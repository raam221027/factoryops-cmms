import { subDays } from 'date-fns'
import type { User, WorkOrder } from './types'
import { compareByUrgency, isOpen, isOverdue, toIsoDate } from './workOrderRules'

export interface TechnicianWorkload {
  technician: User
  open: WorkOrder[]
  inProgress: number
  onHold: number
  overdue: number
  /** Open work planned for today (or due today with no plan) */
  today: number
  completedLast7Days: number
  /** The job the technician is working on right now, if any */
  current?: WorkOrder
  load: 'light' | 'normal' | 'heavy'
}

/** Open jobs above which a technician is shown as heavily loaded. */
export const HEAVY_LOAD = 6
const LIGHT_LOAD = 2

/** Per-technician queue summary for planners. Inactive technicians are left out. */
export function technicianWorkloads(users: User[], workOrders: WorkOrder[], now = new Date()): TechnicianWorkload[] {
  const today = toIsoDate(now)
  const weekAgo = subDays(now, 7)
  return users
    .filter((u) => u.role === 'Technician' && u.active)
    .map((technician) => {
      const own = workOrders.filter((wo) => wo.assigneeId === technician.id)
      const open = own.filter(isOpen).sort(compareByUrgency)
      return {
        technician,
        open,
        inProgress: open.filter((wo) => wo.status === 'InProgress').length,
        onHold: open.filter((wo) => wo.status === 'OnHold').length,
        overdue: open.filter((wo) => isOverdue(wo, now)).length,
        today: open.filter((wo) => (wo.scheduledDate ?? wo.dueDate) === today).length,
        completedLast7Days: own.filter((wo) => wo.status === 'Completed' && wo.completedAtUtc && new Date(wo.completedAtUtc) >= weekAgo).length,
        current: open.find((wo) => wo.status === 'InProgress'),
        load: open.length >= HEAVY_LOAD ? 'heavy' : open.length <= LIGHT_LOAD ? 'light' : 'normal',
      } satisfies TechnicianWorkload
    })
    .sort((a, b) => b.open.length - a.open.length || a.technician.name.localeCompare(b.technician.name))
}

/** Statuses a planner may move a work order to directly (the rest belong to the technician). */
export const PLANNING_STATUSES = ['New', 'Pending', 'Assigned'] as const
