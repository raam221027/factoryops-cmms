/*
 * Behaviour of the demo services, which is also the specification the API must meet:
 * every role is checked on the server side, and work order / request rules hold no matter
 * what the UI shows.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Role } from '@/domain/enums'
import type { SessionUser } from '@/domain/types'
import { ApiError } from '../errors'
import { demoAuth } from './auth'
import { mockServices as s } from './index'
import { resetDemoData } from './store'

let accounts: SessionUser[] = []

async function as(role: Role, email?: string): Promise<SessionUser> {
  const user = accounts.find((a) => a.role === role && (!email || a.email === email))
  if (!user) throw new Error(`no ${role} account`)
  await demoAuth.signInAs(user.id)
  return user
}

async function failsWith(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toBeInstanceOf(ApiError)
  await expect(promise).rejects.toMatchObject({ code })
}

async function anyEquipmentId() {
  return (await s.equipment.list({ status: 'Operational' }))[0].id
}

/** An operational machine with no open repair, so its status depends only on the test. */
async function idleEquipmentId() {
  const open = await s.workOrders.list({ status: ['New', 'Pending', 'Assigned', 'InProgress', 'OnHold'] })
  return (await s.equipment.list({ status: 'Operational' })).find((e) => !open.some((w) => w.equipmentId === e.id))!.id
}

const DANIEL = 'daniel.reyes@northwind.example'

beforeEach(async () => {
  resetDemoData()
  accounts = await demoAuth.listAccounts()
})

describe('authentication', () => {
  it('rejects every call without a session', async () => {
    await demoAuth.signOut()
    await failsWith(s.workOrders.list(), 'unauthorized')
    await failsWith(s.equipment.list(), 'unauthorized')
    await failsWith(s.requests.list(), 'unauthorized')
  })

  it('signs operators in by PIN only with a known PIN', async () => {
    expect((await demoAuth.signInWithPin('1111')).role).toBe('Operator')
    await failsWith(demoAuth.signInWithPin('9999'), 'unauthorized')
  })
})

describe('operator permissions', () => {
  beforeEach(() => as('Operator'))

  it('cannot plan, manage assets, stock, users or settings', async () => {
    const equipmentId = await anyEquipmentId()
    await failsWith(s.workOrders.create({ type: 'Corrective', title: 'x x x', description: 'y y y y y', equipmentId, priority: 'Low' }), 'forbidden')
    await failsWith(s.equipment.create({} as never), 'forbidden')
    await failsWith(s.inventory.adjustStock('p', 'Receipt', 1), 'forbidden')
    await failsWith(s.users.create({} as never), 'forbidden')
    await failsWith(s.settings.update({} as never), 'forbidden')
    await failsWith(s.pm.list(), 'forbidden')
  })

  it('sees no work orders and only their own requests', async () => {
    const me = await as('Operator')
    expect(await s.workOrders.list()).toEqual([])
    const mine = await s.requests.list()
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((r) => r.requestedById === me.id)).toBe(true)
  })

  it("cannot open someone else's request", async () => {
    const me = await as('Operator')
    await as('Supervisor')
    const other = (await s.requests.list()).find((r) => r.requestedById !== me.id)!
    await as('Operator')
    await failsWith(s.requests.get(other.id), 'forbidden')
  })
})

describe('technician permissions', () => {
  it("cannot see or execute another technician's work", async () => {
    const daniel = await as('Technician', DANIEL)
    await as('Supervisor')
    const other = (await s.workOrders.list({ status: 'Assigned' })).find((w) => w.assigneeId && w.assigneeId !== daniel.id)!
    await as('Technician', DANIEL)
    await failsWith(s.workOrders.get(other.id), 'forbidden')
    await failsWith(s.workOrders.start(other.id), 'forbidden')
    expect((await s.workOrders.list()).every((w) => w.assigneeId === daniel.id)).toBe(true)
  })

  it('cannot plan, approve or edit work orders', async () => {
    await as('Technician', DANIEL)
    const mine = (await s.workOrders.list())[0]
    await failsWith(s.workOrders.assign(mine.id, null), 'forbidden')
    await failsWith(s.workOrders.plan(mine.id, { assigneeId: null, scheduledDate: null }), 'forbidden')
    await failsWith(s.workOrders.update(mine.id, { priority: 'Low' }), 'forbidden')
    const req = await s.requests.create({ equipmentId: mine.equipmentId, category: 'Leakage', severity: 'Low', description: 'Oil drip at the seal', attachments: [] })
    await failsWith(s.requests.approve(req.id, { priority: 'Low' }), 'forbidden')
  })

  it("can read any machine's repair history", async () => {
    await as('Technician', DANIEL)
    const history = await s.equipment.history(await anyEquipmentId())
    expect(history.every((w) => w.status === 'Completed')).toBe(true)
  })
})

describe('supervisor permissions', () => {
  beforeEach(() => as('Supervisor'))

  it('plans work but cannot manage assets, users, settings or PM schedules', async () => {
    await failsWith(s.equipment.create({} as never), 'forbidden')
    await failsWith(s.users.create({} as never), 'forbidden')
    await failsWith(s.settings.update({} as never), 'forbidden')
    await failsWith(s.pm.create({} as never), 'forbidden')
    await failsWith(s.organization.saveFacility({} as never), 'forbidden')
  })

  it('cannot start, pause or complete work on behalf of a technician', async () => {
    const assigned = (await s.workOrders.list({ status: 'Assigned' }))[0]
    await failsWith(s.workOrders.changeStatus(assigned.id, 'InProgress'), 'conflict')
    await failsWith(s.workOrders.changeStatus(assigned.id, 'Completed'), 'conflict')
  })
})

describe('work order rules', () => {
  it('assigns only active technicians', async () => {
    await as('Supervisor')
    const wo = (await s.workOrders.list({ status: 'Assigned' }))[0]
    const operator = accounts.find((a) => a.role === 'Operator')!
    await failsWith(s.workOrders.assign(wo.id, operator.id), 'validation')
  })

  it('plan() reassigns and schedules in one step, with the status following', async () => {
    const supervisor = await as('Supervisor')
    const daniel = accounts.find((a) => a.email === DANIEL)!
    const created = await s.workOrders.create({ type: 'Corrective', title: 'Belt slipping', description: 'Belt slips under load', equipmentId: await anyEquipmentId(), priority: 'Medium' })
    expect(created.status).toBe('New')
    const planned = await s.workOrders.plan(created.id, { assigneeId: daniel.id, scheduledDate: '2026-12-01' })
    expect(planned).toMatchObject({ status: 'Assigned', assigneeId: daniel.id, scheduledDate: '2026-12-01', createdById: supervisor.id })
    const unassigned = await s.workOrders.plan(created.id, { assigneeId: null, scheduledDate: null })
    expect(unassigned).toMatchObject({ status: 'Pending', assigneeId: undefined, scheduledDate: undefined })
  })

  it('work in progress cannot be reassigned', async () => {
    await as('Supervisor')
    const live = (await s.workOrders.list({ status: 'InProgress' }))[0]
    const other = accounts.find((a) => a.role === 'Technician' && a.id !== live.assigneeId)!
    await failsWith(s.workOrders.plan(live.id, { assigneeId: other.id, scheduledDate: live.scheduledDate ?? null }), 'conflict')
  })

  it('completion requires labor and a description, and frees the machine', async () => {
    const daniel = await as('Technician', DANIEL)
    const job = (await s.workOrders.list({ status: 'Assigned' })).find((w) => w.type === 'Corrective' && w.assigneeId === daniel.id)!
    await s.workOrders.start(job.id)
    await failsWith(s.workOrders.complete(job.id, { laborHours: 0, actionsTaken: 'x' }), 'validation')
    await failsWith(s.workOrders.complete(job.id, { laborHours: 1, actionsTaken: '  ' }), 'validation')
    const done = await s.workOrders.complete(job.id, { laborHours: 1.5, rootCause: 'Worn seal', actionsTaken: 'Replaced seal' })
    expect(done.status).toBe('Completed')
    await failsWith(s.workOrders.pause(job.id, 'x'), 'conflict')
  })

  it('part usage cannot exceed stock and reduces it', async () => {
    const daniel = await as('Technician', DANIEL)
    const job = (await s.workOrders.list({ status: 'Assigned' })).find((w) => w.assigneeId === daniel.id)!
    await s.workOrders.start(job.id)
    const part = (await s.inventory.listParts()).find((p) => p.quantityOnHand > 1)!
    await failsWith(s.workOrders.recordPartUsage(job.id, part.id, part.quantityOnHand + 1), 'conflict')
    await failsWith(s.workOrders.recordPartUsage(job.id, part.id, 0), 'validation')
    await s.workOrders.recordPartUsage(job.id, part.id, 1)
    expect((await s.inventory.listParts()).find((p) => p.id === part.id)!.quantityOnHand).toBe(part.quantityOnHand - 1)
  })
})

describe('request lifecycle', () => {
  it('a critical report takes the machine out of service until the repair is done', async () => {
    await as('Supervisor')
    const equipmentId = await idleEquipmentId()
    const operator = await as('Operator')
    await failsWith(s.requests.create({ equipmentId, category: 'Other', severity: 'Low', description: 'short', attachments: [] }), 'validation')
    const req = await s.requests.create({ equipmentId, category: 'ElectricalProblem', severity: 'Critical', description: 'Smoke from the cabinet', attachments: [] })
    expect((await s.equipment.get(equipmentId)).status).toBe('OutOfService')
    expect((await s.requests.activeIssues(equipmentId)).some((i) => i.number === req.number && i.reportedByMe)).toBe(true)

    await as('Supervisor')
    const daniel = accounts.find((a) => a.email === DANIEL)!
    const { workOrder } = await s.requests.approve(req.id, { priority: 'Critical', assigneeId: daniel.id })
    await failsWith(s.requests.approve(req.id, { priority: 'Critical' }), 'conflict')

    await as('Technician', DANIEL)
    await s.workOrders.start(workOrder.id)
    await s.workOrders.complete(workOrder.id, { laborHours: 2, rootCause: 'Loose terminal', actionsTaken: 'Re-terminated and tested' })
    expect((await s.equipment.get(equipmentId)).status).toBe('Operational')
    expect((await s.downtime.list()).filter((d) => d.equipmentId === equipmentId && !d.endUtc)).toEqual([])

    await as('Operator')
    const mine = await s.requests.get(req.id)
    expect(mine.requestedById).toBe(operator.id)
    expect(mine.progress).toMatchObject({ workOrderNumber: workOrder.number, status: 'Completed', technicianName: daniel.name })
    expect((await s.notifications.list()).some((n) => n.title === 'Repair completed' && n.link === `/operator/requests/${req.id}`)).toBe(true)
  })

  it('rejecting needs a reason and tells the requester', async () => {
    await as('Operator')
    const req = await s.requests.create({ equipmentId: await anyEquipmentId(), category: 'AbnormalNoise', severity: 'Medium', description: 'Rattling from the guard', attachments: [] })
    await as('Supervisor')
    await failsWith(s.requests.reject(req.id, '  '), 'validation')
    await s.requests.reject(req.id, 'Guard was loose; tightened on the spot.')
    await as('Operator')
    expect((await s.requests.get(req.id)).status).toBe('Rejected')
    expect((await s.notifications.list()).some((n) => n.title === 'Request not approved')).toBe(true)
  })
})
