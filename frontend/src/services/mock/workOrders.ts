import { addDays, addMonths, addWeeks, parseISO } from 'date-fns'
import type { WorkOrderStatus } from '@/domain/enums'
import { hasPermission } from '@/domain/permissions'
import type { User, WorkOrder } from '@/domain/types'
import { canTransition, dueDateForPriority, isOpen, toIsoDate } from '@/domain/workOrderRules'
import { newId } from '@/lib/id'
import { matchesQuery } from '@/lib/utils'
import type { WorkOrderService } from '../contracts'
import { ApiError } from '../errors'
import {
  addLog,
  markEquipmentUnderMaintenance,
  nextWorkOrderNumber,
  notifyRole,
  notifyUser,
  nowIso,
  releaseEquipmentIfClear,
  userName,
} from './effects'
import type { DemoDb } from './schema'
import { actor, authorize, findOrThrow, read, write } from './store'

/** Technicians may only touch work assigned to them; planners and admins see everything. */
function canSee(user: User, wo: WorkOrder) {
  return hasPermission(user.role, 'workorder.view.all') || wo.assigneeId === user.id
}

function getVisible(d: DemoDb, id: string): WorkOrder {
  const user = actor(d)
  const wo = findOrThrow(d.workOrders, id, 'Work order')
  if (!canSee(user, wo)) throw new ApiError('forbidden', 'This work order is not assigned to you.')
  return wo
}

/** Loads a work order the caller is assigned to and may execute. */
function getForExecution(d: DemoDb, id: string): { wo: WorkOrder; user: User } {
  const user = authorize(d, 'workorder.execute', 'workorder.edit')
  const wo = getVisible(d, id)
  if (user.role === 'Technician' && wo.assigneeId !== user.id) throw new ApiError('forbidden', 'This work order is not assigned to you.')
  return { wo, user }
}

function transition(wo: WorkOrder, to: WorkOrderStatus) {
  if (!canTransition(wo.status, to)) {
    throw new ApiError('conflict', `Cannot move a work order from ${wo.status} to ${to}.`)
  }
  wo.status = to
}

function advancePmSchedule(d: DemoDb, wo: WorkOrder) {
  const s = wo.pmScheduleId ? d.pmSchedules.find((x) => x.id === wo.pmScheduleId) : undefined
  if (!s) return
  const done = toIsoDate(new Date())
  s.lastCompletedDate = done
  // Next due is measured from the planned due date so the schedule does not drift.
  const base = parseISO(wo.dueDate ?? done)
  const next = s.frequencyUnit === 'Day' ? addDays(base, s.frequencyInterval) : s.frequencyUnit === 'Week' ? addWeeks(base, s.frequencyInterval) : addMonths(base, s.frequencyInterval)
  if (toIsoDate(next) > s.nextDueDate) s.nextDueDate = toIsoDate(next)
}

export const mockWorkOrders: WorkOrderService = {
  list: (filter = {}) =>
    read((d) => {
      const user = actor(d)
      const statuses = filter.status ? ([] as WorkOrderStatus[]).concat(filter.status) : undefined
      const equipmentById = new Map(d.equipment.map((e) => [e.id, e]))
      return d.workOrders.filter((wo) => {
        if (!canSee(user, wo)) return false
        if (filter.mine && wo.assigneeId !== user.id) return false
        if (statuses && !statuses.includes(wo.status)) return false
        if (filter.type && wo.type !== filter.type) return false
        if (filter.priority && wo.priority !== filter.priority) return false
        if (filter.assigneeId && wo.assigneeId !== filter.assigneeId) return false
        if (filter.equipmentId && wo.equipmentId !== filter.equipmentId) return false
        const e = equipmentById.get(wo.equipmentId)
        return matchesQuery(filter.search ?? '', wo.number, wo.title, e?.name, e?.assetId)
      })
    }),

  get: (id) => read((d) => getVisible(d, id)),

  logs: (id) =>
    read((d) => {
      getVisible(d, id)
      return d.workLogs.filter((l) => l.workOrderId === id).sort((a, b) => b.atUtc.localeCompare(a.atUtc))
    }),

  create: (input) =>
    write((d) => {
      const user = authorize(d, 'workorder.create')
      findOrThrow(d.equipment, input.equipmentId, 'Equipment')
      if (input.assigneeId) findOrThrow(d.users, input.assigneeId, 'Technician')
      const wo: WorkOrder = {
        id: newId(),
        number: nextWorkOrderNumber(d),
        type: input.type,
        title: input.title,
        description: input.description,
        equipmentId: input.equipmentId,
        priority: input.priority,
        status: input.assigneeId ? 'Assigned' : 'New',
        assigneeId: input.assigneeId,
        createdById: user.id,
        createdAtUtc: nowIso(),
        scheduledDate: input.scheduledDate,
        dueDate: input.dueDate ?? dueDateForPriority(input.priority, d.settings.prioritySlaHours),
        instructions: input.instructions,
        checklist: (input.checklist ?? []).map((label) => ({ id: newId(), label, done: false })),
        laborHours: 0,
        partsRequired: input.partsRequired ?? [],
        partsUsed: [],
        attachments: [],
      }
      d.workOrders.unshift(wo)
      addLog(d, wo, user.id, 'Created', 'Work order created')
      if (wo.assigneeId) {
        addLog(d, wo, user.id, 'Assigned', `Assigned to ${userName(d, wo.assigneeId)}`)
        notifyUser(d, wo.assigneeId, 'New work order assigned', `${wo.number}: ${wo.title}`, `/tech/jobs/${wo.id}`)
      }
      return wo
    }),

  update: (id, input) =>
    write((d) => {
      const user = authorize(d, 'workorder.edit')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      if (!isOpen(wo)) throw new ApiError('conflict', 'Closed work orders cannot be edited.')
      Object.assign(wo, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)))
      addLog(d, wo, user.id, 'Updated', 'Work order details updated')
      return wo
    }),

  assign: (id, assigneeId) =>
    write((d) => {
      const user = authorize(d, 'workorder.assign')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      if (wo.status === 'InProgress' || !isOpen(wo)) {
        throw new ApiError('conflict', 'Only work that has not started can be reassigned.')
      }
      if (assigneeId) {
        const tech = findOrThrow(d.users, assigneeId, 'Technician')
        if (tech.role !== 'Technician' || !tech.active) throw new ApiError('validation', 'Work can only be assigned to an active technician.')
        wo.assigneeId = assigneeId
        if (wo.status === 'New' || wo.status === 'Pending') wo.status = 'Assigned'
        wo.scheduledDate ??= toIsoDate(new Date())
        addLog(d, wo, user.id, 'Assigned', `Assigned to ${tech.name}`)
        notifyUser(d, tech.id, 'New work order assigned', `${wo.number}: ${wo.title}`, `/tech/jobs/${wo.id}`)
      } else {
        wo.assigneeId = undefined
        if (wo.status === 'Assigned') wo.status = 'Pending'
        addLog(d, wo, user.id, 'Assigned', 'Technician unassigned')
      }
      return wo
    }),

  changeStatus: (id, status, note) =>
    write((d) => {
      const user = authorize(d, 'workorder.edit')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      if (['InProgress', 'OnHold', 'Completed'].includes(status) || wo.status === 'InProgress') {
        throw new ApiError('conflict', 'Starting, pausing and completing work is done by the assigned technician.')
      }
      if (status === 'Assigned' && !wo.assigneeId) throw new ApiError('validation', 'Assign a technician first.')
      const from = wo.status
      transition(wo, status)
      addLog(d, wo, user.id, status === 'Cancelled' ? 'Cancelled' : 'StatusChanged', note ? `${from} → ${status}: ${note}` : `${from} → ${status}`)
      if (status === 'Cancelled') releaseEquipmentIfClear(d, wo.equipmentId, wo.id)
      return wo
    }),

  start: (id) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      if (!wo.assigneeId) throw new ApiError('validation', 'Assign a technician before starting work.')
      transition(wo, 'InProgress')
      wo.startedAtUtc ??= nowIso()
      addLog(d, wo, user.id, 'Started', 'Work started')
      if (wo.type === 'Corrective') markEquipmentUnderMaintenance(d, wo.equipmentId)
      return wo
    }),

  pause: (id, reason) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      transition(wo, 'OnHold')
      wo.holdReason = reason
      addLog(d, wo, user.id, 'Paused', `On hold: ${reason}`)
      return wo
    }),

  resume: (id) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      transition(wo, 'InProgress')
      wo.holdReason = undefined
      addLog(d, wo, user.id, 'Resumed', 'Work resumed')
      return wo
    }),

  complete: (id, input) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      if (input.laborHours <= 0) throw new ApiError('validation', 'Record the labor hours spent.')
      if (!input.actionsTaken.trim()) throw new ApiError('validation', 'Describe the actions taken.')
      transition(wo, 'Completed')
      wo.completedAtUtc = nowIso()
      wo.laborHours = input.laborHours
      wo.rootCause = input.rootCause?.trim() || undefined
      wo.actionsTaken = input.actionsTaken.trim()
      if (input.note?.trim()) addLog(d, wo, user.id, 'Note', input.note.trim())
      addLog(d, wo, user.id, 'Completed', `Completed · ${input.laborHours} h labor`)
      releaseEquipmentIfClear(d, wo.equipmentId, wo.id)
      advancePmSchedule(d, wo)
      if (wo.requestId) {
        const req = d.requests.find((r) => r.id === wo.requestId)
        if (req) notifyUser(d, req.requestedById, 'Repair completed', `${req.number}: ${wo.title}`, '/operator/requests')
      }
      notifyRole(d, 'Supervisor', 'Work order completed', `${wo.number} completed by ${user.name}`, `/supervisor/work-orders/${wo.id}`)
      return wo
    }),

  addNote: (id, text) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      if (!text.trim()) throw new ApiError('validation', 'Note cannot be empty.')
      addLog(d, wo, user.id, 'Note', text.trim())
      return wo
    }),

  addAttachment: (id, attachment) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      wo.attachments.push({ id: newId(), ...attachment, uploadedById: user.id, uploadedAtUtc: nowIso() })
      addLog(d, wo, user.id, 'PhotoAdded', `${attachment.kind} photo added`)
      return wo
    }),

  removeAttachment: (id, attachmentId) =>
    write((d) => {
      const { wo } = getForExecution(d, id)
      if (!isOpen(wo)) throw new ApiError('conflict', 'Attachments on closed work orders cannot be removed.')
      wo.attachments = wo.attachments.filter((a) => a.id !== attachmentId)
      return wo
    }),

  recordPartUsage: (id, partId, quantity) =>
    write((d) => {
      const { wo, user } = getForExecution(d, id)
      if (!isOpen(wo)) throw new ApiError('conflict', 'Parts can only be logged on open work orders.')
      if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError('validation', 'Quantity must be a positive whole number.')
      const part = findOrThrow(d.parts, partId, 'Spare part')
      if (part.quantityOnHand < quantity) throw new ApiError('conflict', `Only ${part.quantityOnHand} ${part.unit} of ${part.name} in stock.`)
      part.quantityOnHand -= quantity
      const line = wo.partsUsed.find((l) => l.partId === partId)
      if (line) line.quantity += quantity
      else wo.partsUsed.push({ partId, quantity })
      d.transactions.push({ id: newId(), partId, type: 'Issue', quantity: -quantity, workOrderId: wo.id, userId: user.id, atUtc: nowIso(), note: wo.number })
      addLog(d, wo, user.id, 'PartUsed', `Used ${quantity} × ${part.name}`)
      if (d.settings.lowStockAlerts && part.quantityOnHand <= part.minimumStock) {
        notifyRole(d, 'Admin', 'Low stock', `${part.name} is at ${part.quantityOnHand} ${part.unit} (min ${part.minimumStock})`, '/admin/inventory')
      }
      return wo
    }),

  setChecklistItem: (id, itemId, done) =>
    write((d) => {
      const { wo } = getForExecution(d, id)
      const item = findOrThrow(wo.checklist, itemId, 'Checklist item')
      item.done = done
      return wo
    }),
}
