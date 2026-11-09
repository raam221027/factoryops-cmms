import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { PROBLEM_CATEGORY_LABELS } from '@/domain/enums'
import { requestStage } from '@/domain/requests'
import type { MaintenanceRequest } from '@/domain/types'
import type { Lookups } from '@/features/shared/queries'
import { formatAgo } from '@/lib/format'

/** One reported problem in the operator's lists. The whole card opens the request. */
export function RequestCard({ r, lookups }: { r: MaintenanceRequest; lookups: Lookups }) {
  const stage = requestStage(r)
  return (
    <Link to={`/operator/requests/${r.id}`} className="flex items-center gap-3 rounded-lg border bg-surface p-3 shadow-card active:bg-accent">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={stage.tone}>{stage.label}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
        </div>
        <p className="mt-1 truncate font-medium">{lookups.equipmentName(r.equipmentId)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {PROBLEM_CATEGORY_LABELS[r.category]} · reported {formatAgo(r.createdAtUtc)}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
