import { FileText } from 'lucide-react'
import { RequestStatusBadge } from '@/components/shared/badges'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { PROBLEM_CATEGORY_LABELS } from '@/domain/enums'
import { useSessionUser } from '@/features/auth/context'
import { useLookups } from '@/features/shared/queries'
import { useRequests } from '@/features/work-orders/hooks'
import { formatAgo } from '@/lib/format'

export function OperatorHome() {
  const user = useSessionUser()
  const requests = useRequests({ mine: true })
  const { lookups, ready } = useLookups()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hello, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Your recent maintenance requests</p>
      </div>
      {requests.error ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : !requests.data || !ready ? (
        <ListSkeleton rows={3} />
      ) : requests.data.length === 0 ? (
        <EmptyState icon={FileText} title="No requests yet" description="Problems you report will appear here with their status." />
      ) : (
        <ul className="space-y-2">
          {requests.data.slice(0, 10).map((r) => (
            <li key={r.id} className="rounded-lg border bg-surface p-3 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
                <RequestStatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-sm font-medium">{lookups.equipmentName(r.equipmentId)}</p>
              <p className="text-xs text-muted-foreground">
                {PROBLEM_CATEGORY_LABELS[r.category]} · {formatAgo(r.createdAtUtc)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
