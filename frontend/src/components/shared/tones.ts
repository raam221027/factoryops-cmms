import type { BadgeTone } from '@/components/ui/badge'
import type { EquipmentStatus, Priority, RequestStatus, WorkOrderStatus } from '@/domain/enums'

/* Single source of truth for how statuses and priorities are colored everywhere. */

export const WORK_ORDER_STATUS_TONE: Record<WorkOrderStatus, BadgeTone> = {
  New: 'info',
  Pending: 'warning',
  Assigned: 'primary',
  InProgress: 'info',
  OnHold: 'warning',
  Completed: 'success',
  Cancelled: 'neutral',
}

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  Low: 'neutral',
  Medium: 'info',
  High: 'warning',
  Critical: 'solidDanger',
}

export const EQUIPMENT_STATUS_TONE: Record<EquipmentStatus, BadgeTone> = {
  Operational: 'success',
  UnderMaintenance: 'warning',
  OutOfService: 'danger',
  Retired: 'neutral',
}

export const REQUEST_STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  Submitted: 'info',
  Approved: 'success',
  Rejected: 'neutral',
}
