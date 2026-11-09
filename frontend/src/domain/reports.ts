import { differenceInMinutes, eachMonthOfInterval, eachWeekOfInterval, format, max, min, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { DateRange } from './metrics'
import { downtimeHours, mttrHours, pmCompliance } from './metrics'
import type { Equipment, EquipmentCategory, EquipmentDowntime, SparePart, User, WorkOrder } from './types'
import { isOpen } from './workOrderRules'

/*
 * Report aggregations over domain data. Pure functions: the same code backs the dashboard,
 * the report tabs and their CSV exports. When the API grows dedicated report endpoints these
 * become the reference for what they must return.
 */

const within = (iso: string | undefined, range: DateRange) => {
  if (!iso) return false
  const d = parseISO(iso)
  return d >= range.from && d <= range.to
}

type Bucket = { key: string; label: string; start: Date; end: Date }

function weekBuckets(range: DateRange): Bucket[] {
  return eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 }).map((start) => {
    const end = new Date(start.getTime() + 7 * 86_400_000 - 1)
    return { key: format(start, 'yyyy-MM-dd'), label: format(max([start, range.from]), 'MMM d'), start, end }
  })
}

function monthBuckets(range: DateRange): Bucket[] {
  return eachMonthOfInterval({ start: range.from, end: range.to }).map((start) => {
    const next = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return { key: format(start, 'yyyy-MM'), label: format(start, 'MMM yyyy'), start, end: new Date(next.getTime() - 1) }
  })
}

/** Weekly buckets for short ranges, monthly for long ones. */
export function bucketsFor(range: DateRange): { buckets: Bucket[]; unit: 'week' | 'month' } {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000
  return days > 120 ? { buckets: monthBuckets(range), unit: 'month' } : { buckets: weekBuckets(range), unit: 'week' }
}

function bucketKey(iso: string, unit: 'week' | 'month') {
  const d = parseISO(iso)
  return unit === 'week' ? format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd') : format(startOfMonth(d), 'yyyy-MM')
}

export function workOrderTrend(workOrders: WorkOrder[], range: DateRange) {
  const { buckets, unit } = bucketsFor(range)
  const rows = new Map(buckets.map((b) => [b.key, { period: b.label, created: 0, completed: 0, corrective: 0, preventive: 0 }]))
  for (const wo of workOrders) {
    if (wo.status !== 'Cancelled' && within(wo.createdAtUtc, range)) {
      const row = rows.get(bucketKey(wo.createdAtUtc, unit))
      if (row) {
        row.created++
        if (wo.type === 'Corrective') row.corrective++
        else row.preventive++
      }
    }
    if (wo.status === 'Completed' && within(wo.completedAtUtc, range)) {
      const row = rows.get(bucketKey(wo.completedAtUtc!, unit))
      if (row) row.completed++
    }
  }
  return { unit, rows: [...rows.values()] }
}

/** Downtime hours per period; events spanning periods are split across them. */
export function downtimeTrend(downtimes: EquipmentDowntime[], range: DateRange, now = new Date()) {
  const { buckets, unit } = bucketsFor(range)
  return {
    unit,
    rows: buckets.map((b) => ({ period: b.label, hours: Math.round(downtimeHours(downtimes, { from: max([b.start, range.from]), to: min([b.end, range.to]) }, now) * 10) / 10 })),
  }
}

export function costTrend(workOrders: WorkOrder[], parts: SparePart[], laborRate: number, range: DateRange) {
  const { buckets, unit } = bucketsFor(range)
  const unitCost = new Map(parts.map((p) => [p.id, p.unitCost]))
  const rows = new Map(buckets.map((b) => [b.key, { period: b.label, parts: 0, labor: 0 }]))
  for (const wo of workOrders) {
    if (wo.status !== 'Completed' || !within(wo.completedAtUtc, range)) continue
    const row = rows.get(bucketKey(wo.completedAtUtc!, unit))
    if (!row) continue
    row.labor += wo.laborHours * laborRate
    row.parts += wo.partsUsed.reduce((s, l) => s + (unitCost.get(l.partId) ?? 0) * l.quantity, 0)
  }
  return { unit, rows: [...rows.values()].map((r) => ({ ...r, parts: Math.round(r.parts), labor: Math.round(r.labor), total: Math.round(r.parts + r.labor) })) }
}

export function pmComplianceTrend(workOrders: WorkOrder[], range: DateRange, today = new Date()) {
  return monthBuckets(range).map((b) => {
    const value = pmCompliance(workOrders, { from: max([b.start, range.from]), to: min([b.end, range.to]) }, today)
    return { period: b.label, compliance: value == null ? null : Math.round(value * 100) }
  })
}

export function downtimeByEquipment(downtimes: EquipmentDowntime[], equipment: Equipment[], range: DateRange, now = new Date()) {
  return equipment
    .map((e) => {
      const own = downtimes.filter((d) => d.equipmentId === e.id)
      const events = own.filter((d) => parseISO(d.startUtc) <= range.to && (!d.endUtc || parseISO(d.endUtc) >= range.from)).length
      return { equipment: e, hours: Math.round(downtimeHours(own, range, now) * 10) / 10, events }
    })
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
}

export function mttrByCategory(workOrders: WorkOrder[], equipment: Equipment[], categories: EquipmentCategory[], range: DateRange) {
  const categoryOf = new Map(equipment.map((e) => [e.id, e.categoryId]))
  return categories
    .map((c) => {
      const own = workOrders.filter((wo) => categoryOf.get(wo.equipmentId) === c.id)
      const repairs = own.filter((wo) => wo.type === 'Corrective' && wo.status === 'Completed' && within(wo.completedAtUtc, range)).length
      return { category: c, repairs, mttr: mttrHours(own, range) }
    })
    .filter((r) => r.repairs > 0)
    .sort((a, b) => (b.mttr ?? 0) - (a.mttr ?? 0))
}

export function technicianPerformance(workOrders: WorkOrder[], users: User[], range: DateRange) {
  return users
    .filter((u) => u.role === 'Technician')
    .map((u) => {
      const mine = workOrders.filter((wo) => wo.assigneeId === u.id)
      const done = mine.filter((wo) => wo.status === 'Completed' && within(wo.completedAtUtc, range))
      const withDue = done.filter((wo) => wo.dueDate)
      const onTime = withDue.filter((wo) => wo.completedAtUtc!.slice(0, 10) <= wo.dueDate!).length
      return {
        user: u,
        completed: done.length,
        laborHours: Math.round(done.reduce((s, wo) => s + wo.laborHours, 0) * 10) / 10,
        onTimeRate: withDue.length ? onTime / withDue.length : null,
        mttr: mttrHours(done),
        open: mine.filter(isOpen).length,
      }
    })
    .sort((a, b) => b.completed - a.completed)
}

/**
 * Reliability per asset over the range: corrective failures, downtime, MTTR and MTBF
 * (operating hours between failures = (range hours − downtime) / failures).
 */
export function equipmentReliability(workOrders: WorkOrder[], downtimes: EquipmentDowntime[], equipment: Equipment[], range: DateRange, now = new Date()) {
  const rangeHours = differenceInMinutes(min([range.to, now]), range.from) / 60
  return equipment
    .filter((e) => e.status !== 'Retired')
    .map((e) => {
      const own = workOrders.filter((wo) => wo.equipmentId === e.id)
      const failures = own.filter((wo) => wo.type === 'Corrective' && wo.status !== 'Cancelled' && within(wo.createdAtUtc, range)).length
      const down = downtimeHours(
        downtimes.filter((d) => d.equipmentId === e.id),
        range,
        now,
      )
      return {
        equipment: e,
        failures,
        downtimeHours: Math.round(down * 10) / 10,
        mttr: mttrHours(own, range),
        mtbfHours: failures ? Math.round((rangeHours - down) / failures) : null,
        availability: rangeHours > 0 ? Math.max(0, 1 - down / rangeHours) : null,
      }
    })
    .sort((a, b) => b.failures - a.failures || b.downtimeHours - a.downtimeHours)
}

export function statusDistribution(workOrders: WorkOrder[]) {
  const order = ['New', 'Pending', 'Assigned', 'InProgress', 'OnHold'] as const
  return order.map((status) => ({ status, count: workOrders.filter((wo) => wo.status === status).length }))
}
