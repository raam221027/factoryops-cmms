import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUp, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  EQUIPMENT_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type EquipmentStatus,
  type Priority,
  type RequestStatus,
  type WorkOrderStatus,
} from '@/domain/enums'
import { EQUIPMENT_STATUS_TONE, PRIORITY_TONE, REQUEST_STATUS_TONE, WORK_ORDER_STATUS_TONE } from './tones'

const PRIORITY_ICON = { Low: ArrowDown, Medium: Minus, High: ArrowUp, Critical: ChevronsUp } as const

function Dot() {
  return <span className="size-1.5 rounded-full bg-current" aria-hidden />
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <Badge tone={WORK_ORDER_STATUS_TONE[status]}>
      <Dot />
      {WORK_ORDER_STATUS_LABELS[status]}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const Icon = PRIORITY_ICON[priority]
  return (
    <Badge tone={PRIORITY_TONE[priority]}>
      <Icon aria-hidden />
      {priority}
    </Badge>
  )
}

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <Badge tone={EQUIPMENT_STATUS_TONE[status]}>
      <Dot />
      {EQUIPMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={REQUEST_STATUS_TONE[status]}>{status === 'Submitted' ? 'Awaiting review' : status}</Badge>
}

export function OverdueBadge() {
  return (
    <Badge tone="danger">
      <AlertTriangle aria-hidden />
      Overdue
    </Badge>
  )
}
