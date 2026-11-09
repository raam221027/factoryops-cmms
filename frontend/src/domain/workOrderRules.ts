import { addHours, formatISO } from 'date-fns'
import { OPEN_WORK_ORDER_STATUSES, type Priority, type WorkOrderStatus } from './enums'
import type { IsoDate, WorkOrder } from './types'

/** Allowed status transitions. The API is expected to enforce the same rules. */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  New: ['Pending', 'Assigned', 'Cancelled'],
  Pending: ['New', 'Assigned', 'Cancelled'],
  Assigned: ['Pending', 'InProgress', 'Cancelled'],
  InProgress: ['OnHold', 'Completed'],
  OnHold: ['InProgress', 'Cancelled'],
  Completed: [],
  Cancelled: [],
}

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from].includes(to)
}

export function isOpen(wo: Pick<WorkOrder, 'status'>): boolean {
  return OPEN_WORK_ORDER_STATUSES.includes(wo.status)
}

export function toIsoDate(date: Date): IsoDate {
  return formatISO(date, { representation: 'date' })
}

export function isOverdue(wo: Pick<WorkOrder, 'status' | 'dueDate'>, today: Date = new Date()): boolean {
  return isOpen(wo) && !!wo.dueDate && wo.dueDate < toIsoDate(today)
}

export function isDueOn(wo: Pick<WorkOrder, 'status' | 'dueDate'>, day: Date): boolean {
  return isOpen(wo) && wo.dueDate === toIsoDate(day)
}

/** Belongs on a technician's list for the day: planned for it (or earlier), due by it, or overdue. */
export function isOnTodaysList(wo: Pick<WorkOrder, 'status' | 'dueDate' | 'scheduledDate'>, today: Date = new Date()): boolean {
  return isOpen(wo) && ((wo.scheduledDate ?? wo.dueDate ?? '9999') <= toIsoDate(today) || isOverdue(wo, today))
}

export function dueDateForPriority(priority: Priority, slaHours: Record<Priority, number>, from: Date = new Date()): IsoDate {
  return toIsoDate(addHours(from, slaHours[priority]))
}

const PRIORITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

/** Sort: overdue first, then priority, then due date. */
export function compareByUrgency(a: WorkOrder, b: WorkOrder): number {
  const overdue = Number(isOverdue(b)) - Number(isOverdue(a))
  if (overdue !== 0) return overdue
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priority !== 0) return priority
  return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
}
