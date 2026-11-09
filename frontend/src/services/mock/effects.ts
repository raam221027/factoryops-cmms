import type { Role, WorkLogAction } from '@/domain/enums'
import type { Id, WorkOrder } from '@/domain/types'
import { isOpen } from '@/domain/workOrderRules'
import { newId } from '@/lib/id'
import type { DemoDb } from './schema'

/*
 * Side effects the backend would perform alongside a write: audit log entries, notifications,
 * equipment status and downtime bookkeeping, document numbering.
 */

export const nowIso = () => new Date().toISOString()

export function addLog(d: DemoDb, wo: WorkOrder, userId: Id, action: WorkLogAction, message: string) {
  d.workLogs.push({ id: newId(), workOrderId: wo.id, userId, action, message, atUtc: nowIso() })
}

export function notifyUser(d: DemoDb, userId: Id, title: string, body: string, link?: string) {
  d.notifications.unshift({ id: newId(), userId, title, body, link, atUtc: nowIso(), read: false })
}

export function notifyRole(d: DemoDb, role: Role, title: string, body: string, link?: string) {
  for (const u of d.users.filter((x) => x.role === role && x.active)) notifyUser(d, u.id, title, body, link)
}

export function nextWorkOrderNumber(d: DemoDb): string {
  return `${d.settings.workOrderPrefix}-${++d.counters.workOrder}`
}

export function nextRequestNumber(d: DemoDb): string {
  return `${d.settings.requestPrefix}-${++d.counters.request}`
}

/** Corrective work in progress puts the machine under maintenance. */
export function markEquipmentUnderMaintenance(d: DemoDb, equipmentId: Id) {
  const e = d.equipment.find((x) => x.id === equipmentId)
  if (e && e.status === 'Operational') e.status = 'UnderMaintenance'
}

/** When the last open corrective job on a machine closes, it returns to service and downtime ends. */
export function releaseEquipmentIfClear(d: DemoDb, equipmentId: Id, closedWorkOrderId: Id) {
  const stillOpen = d.workOrders.some(
    (wo) => wo.equipmentId === equipmentId && wo.id !== closedWorkOrderId && wo.type === 'Corrective' && isOpen(wo),
  )
  const end = nowIso()
  for (const dt of d.downtimes) {
    if (dt.equipmentId === equipmentId && !dt.endUtc && (dt.workOrderId === closedWorkOrderId || !stillOpen)) dt.endUtc = end
  }
  if (stillOpen) return
  const e = d.equipment.find((x) => x.id === equipmentId)
  if (e && (e.status === 'UnderMaintenance' || e.status === 'OutOfService')) e.status = 'Operational'
}

export function userName(d: DemoDb, id: Id | undefined): string {
  return d.users.find((u) => u.id === id)?.name ?? 'Unassigned'
}
