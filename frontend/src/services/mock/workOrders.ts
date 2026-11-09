import { parseISO } from 'date-fns'
import type { WorkOrderStatus } from '@/domain/enums'
import { hasPermission } from '@/domain/permissions'
import { addFrequency } from '@/domain/pm'
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
  notifyAssignment,
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

/** Sets or clears the technician, keeping status, log and notification in step. */
function applyAssignment(d: DemoDb, wo: WorkOrder, by: User, assigneeId: string | null) {
  if (wo.status === 'InProgress' || !isOpen(wo)) {
    throw new ApiError('conflict', 'Only work that has not started can be reassigned.')
  }
  if (assigneeId) {
    const tech = findOrThrow(d.users, assigneeId, 'Technician')
    if (tech.role !== 'Technician' || !tech.active) throw new ApiError('validation', 'Work can only be assigned to an active technician.')
    if (wo.assigneeId === assigneeId) return
    wo.assigneeId = assigneeId
    if (wo.status === 'New' || wo.status === 'Pending') wo.status = 'Assigned'
    addLog(d, wo, by.id, 'Assigned', `Assigned to ${tech.name}`)
    notifyAssignment(d, wo, tech.id)
  } else {
    if (!wo.assigneeId) return
    wo.assigneeId = undefined
    if (wo.status === 'Assigned') wo.status = 'Pending'
    addLog(d, wo, by.id, 'Assigned', 'Technician unassigned')
  }
}

function advancePmSchedule(d: DemoDb, wo: WorkOrder) {
  const s = wo.pmScheduleId ? d.pmSchedules.find((x) => x.id === wo.pmScheduleId) : undefined
  if (!s) return
  const done = toIsoDate(new Date())
  s.lastCompletedDate = done
  // Next due is measured from the planned due date so the schedule does not drift.
  const next = addFrequency(parseISO(wo.dueDate ?? done), s.frequencyInterval, s.frequencyUnit)
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
        notifyAssignment(d, wo, wo.assigneeId)
      }
      return wo
    }),

  update: (id, input) =>
    write((d) => {
      const user = authorize(d, 'workorder.edit')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      if (!isOpen(wo)) throw new ApiError('conflict', 'Closed work orders cannot be edited.')
      const { title, description, priority, scheduledDate, dueDate, instructions, partsRequired } = input
      if (title !== undefined && title.trim().length < 3) throw new ApiError('validation', 'Give the work order a title.')
      const changes = { title: title?.trim(), description, priority, scheduledDate, dueDate, instructions, partsRequired }
      // Name what changed so the history is useful, e.g. "Priority Medium → High".
      const described: [keyof typeof changes, string][] = [['priority', 'Priority'], ['dueDate', 'Due date'], ['scheduledDate', 'Planned day'], ['title', 'Title']]
      const summary = described
        .filter(([k]) => changes[k] !== undefined && changes[k] !== wo[k])
        .map(([k, label]) => (k === 'title' ? 'Title changed' : `${label} ${wo[k] ?? 'none'} → ${changes[k]}`))
      const other = (['description', 'instructions', 'partsRequired'] as const).filter((k) => changes[k] !== undefined && JSON.stringify(changes[k]) !== JSON.stringify(wo[k] ?? ''))
      if (other.length) summary.push(`Updated ${other.map((k) => (k === 'partsRequired' ? 'parts list' : k)).join(', ')}`)
      Object.assign(wo, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)))
      if (summary.length) addLog(d, wo, user.id, 'Updated', summary.join(' · '))
      return wo
    }),

  assign: (id, assigneeId) =>
    write((d) => {
      const user = authorize(d, 'workorder.assign')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      applyAssignment(d, wo, user, assigneeId)
      if (assigneeId) wo.scheduledDate ??= toIsoDate(new Date())
      return wo
    }),

  plan: (id, input) =>
    write((d) => {
      const user = authorize(d, 'workorder.assign')
      const wo = findOrThrow(d.workOrders, id, 'Work order')
      if (!isOpen(wo)) throw new ApiError('conflict', 'Closed work orders cannot be rescheduled.')
      if (input.scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) throw new ApiError('validation', 'Scheduled date is not a valid date.')
      const reassigned = (input.assigneeId ?? undefined) !== wo.assigneeId
      if (reassigned) applyAssignment(d, wo, user, input.assigneeId)
      const scheduled = input.scheduledDate ?? undefined
      if (scheduled !== wo.scheduledDate) {
        wo.scheduledDate = scheduled
        addLog(d, wo, user.id, 'Updated', scheduled ? `Scheduled for ${scheduled}` : 'Removed from the schedule')
        // A newly assigned technician already gets the assignment notice.
        if (scheduled && wo.assigneeId && !reassigned) {
          notifyUser(d, wo.assigneeId, 'Work rescheduled', `${wo.number} is now planned for ${scheduled}`, `/tech/jobs/${wo.id}`)
        }
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
      if (status === 'Cancelled') {
        releaseEquipmentIfClear(d, wo.equipmentId, wo.id)
        if (wo.assigneeId) notifyUser(d, wo.assigneeId, 'Work order cancelled', `${wo.number}: ${note ?? wo.title}`, `/tech/jobs/${wo.id}`)
      }
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
      const openItems = wo.checklist.filter((c) => !c.done).length
      addLog(d, wo, user.id, 'Completed', `Completed · ${input.laborHours} h labor${openItems ? ` · ${openItems} checklist item${openItems > 1 ? 's' : ''} not ticked` : ''}`)
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
