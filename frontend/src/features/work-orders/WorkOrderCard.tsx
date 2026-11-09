import { CalendarClock, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { OverdueBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import type { WorkOrder } from '@/domain/types'
import { isOverdue } from '@/domain/workOrderRules'
import type { Lookups } from '@/features/shared/queries'
import { formatRelativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Compact work order summary used in mobile lists, boards and dashboards. */
export function WorkOrderCard({ wo, lookups, className, footer }: { wo: WorkOrder; lookups: Lookups; className?: string; footer?: ReactNode }) {
  const equipment = lookups.equipment.get(wo.equipmentId)
  const overdue = isOverdue(wo)
  return (
    <div className={cn('rounded-lg border bg-surface p-3 shadow-card', overdue && 'border-l-4 border-l-danger', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{wo.number}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {overdue && <OverdueBadge />}
          <PriorityBadge priority={wo.priority} />
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{wo.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {equipment ? `${equipment.assetId} · ${equipment.name}` : 'Unknown equipment'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <WorkOrderStatusBadge status={wo.status} />
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" aria-hidden />
          {lookups.locationLabel(wo.equipmentId)}
        </span>
        {wo.dueDate && (
          <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
            <CalendarClock className="size-3" aria-hidden />
            Due {formatRelativeDay(wo.dueDate)}
          </span>
        )}
      </div>
      {footer}
    </div>
  )
}
