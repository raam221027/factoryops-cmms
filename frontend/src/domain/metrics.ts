import { differenceInMinutes, max, min, parseISO } from 'date-fns'
import type { WorkOrderStatus } from './enums'
import type { Equipment, EquipmentDowntime, PmSchedule, SparePart, WorkOrder } from './types'
import { isOpen, isOverdue, toIsoDate } from './workOrderRules'

/*
 * KPI calculations shared by dashboards and reports. Pure functions over domain data so the
 * same numbers come out whether data is mocked or served by the API.
 */

export interface DateRange {
  from: Date
  to: Date
}

function inRange(iso: string | undefined, range?: DateRange): boolean {
  if (!iso) return false
  if (!range) return true
  const d = parseISO(iso)
  return d >= range.from && d <= range.to
}

export function countByStatus(workOrders: WorkOrder[]): Record<WorkOrderStatus, number> {
  const counts: Record<WorkOrderStatus, number> = {
    New: 0,
    Pending: 0,
    Assigned: 0,
    InProgress: 0,
    OnHold: 0,
    Completed: 0,
    Cancelled: 0,
  }
  for (const wo of workOrders) counts[wo.status]++
  return counts
}

export function overdueCount(workOrders: WorkOrder[], today = new Date()): number {
  return workOrders.filter((wo) => isOverdue(wo, today)).length
}

export function openCount(workOrders: WorkOrder[]): number {
  return workOrders.filter(isOpen).length
}

/** Mean time to repair in hours: average start→completion time of completed corrective work. */
export function mttrHours(workOrders: WorkOrder[], range?: DateRange): number | null {
  const durations = workOrders
    .filter((wo) => wo.type === 'Corrective' && wo.status === 'Completed' && wo.startedAtUtc && inRange(wo.completedAtUtc, range))
    .map((wo) => differenceInMinutes(parseISO(wo.completedAtUtc!), parseISO(wo.startedAtUtc!)) / 60)
  if (durations.length === 0) return null
  return durations.reduce((a, b) => a + b, 0) / durations.length
}

/**
 * Preventive maintenance compliance: share of preventive work orders due in the range that were
 * completed on or before their due date. Work due today is not counted yet; it still has time.
 */
export function pmCompliance(workOrders: WorkOrder[], range?: DateRange, today = new Date()): number | null {
  const due = workOrders.filter(
    (wo) => wo.type === 'Preventive' && wo.status !== 'Cancelled' && wo.dueDate && inRange(wo.dueDate, range) && wo.dueDate < toIsoDate(today),
  )
  if (due.length === 0) return null
  const onTime = due.filter((wo) => wo.status === 'Completed' && wo.completedAtUtc && wo.completedAtUtc.slice(0, 10) <= wo.dueDate!)
  return onTime.length / due.length
}

/** Total downtime hours, clipped to the range; open downtime counts until `now`. */
export function downtimeHours(downtimes: EquipmentDowntime[], range?: DateRange, now = new Date()): number {
  let minutes = 0
  for (const d of downtimes) {
    let start = parseISO(d.startUtc)
    let end = d.endUtc ? parseISO(d.endUtc) : now
    if (range) {
      start = max([start, range.from])
      end = min([end, range.to])
    }
    if (end > start) minutes += differenceInMinutes(end, start)
  }
  return minutes / 60
}

/** Share of work orders created in the range that are completed. */
export function completionRate(workOrders: WorkOrder[], range?: DateRange): number | null {
  const created = workOrders.filter((wo) => wo.status !== 'Cancelled' && inRange(wo.createdAtUtc, range))
  if (created.length === 0) return null
  return created.filter((wo) => wo.status === 'Completed').length / created.length
}

export function partsCost(workOrders: WorkOrder[], parts: SparePart[], range?: DateRange): number {
  const cost = new Map(parts.map((p) => [p.id, p.unitCost]))
  return workOrders
    .filter((wo) => wo.status === 'Completed' && inRange(wo.completedAtUtc, range))
    .flatMap((wo) => wo.partsUsed)
    .reduce((sum, line) => sum + (cost.get(line.partId) ?? 0) * line.quantity, 0)
}

export function lowStockParts(parts: SparePart[]): SparePart[] {
  return parts.filter((p) => p.quantityOnHand <= p.minimumStock)
}

export function equipmentStatusCounts(equipment: Equipment[]) {
  return {
    total: equipment.filter((e) => e.status !== 'Retired').length,
    operational: equipment.filter((e) => e.status === 'Operational').length,
    underMaintenance: equipment.filter((e) => e.status === 'UnderMaintenance').length,
    outOfService: equipment.filter((e) => e.status === 'OutOfService').length,
  }
}

export function overduePmSchedules(schedules: PmSchedule[], today = new Date()): PmSchedule[] {
  const iso = toIsoDate(today)
  return schedules.filter((s) => s.active && s.nextDueDate < iso)
}
