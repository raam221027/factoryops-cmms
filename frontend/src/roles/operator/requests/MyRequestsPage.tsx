import { FileText } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { requestStage } from '@/domain/requests'
import { useLookups } from '@/features/shared/queries'
import { useRequests } from '@/features/work-orders/hooks'
import { cn } from '@/lib/utils'
import { RequestCard } from '../RequestCard'

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
] as const

export function MyRequestsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'closed' ? 'closed' : 'open'
  const requests = useRequests({ mine: true })
  const { lookups, ready } = useLookups()
  const all = (requests.data ?? []).slice().sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))
  const lists = { open: all.filter((r) => requestStage(r).open), closed: all.filter((r) => !requestStage(r).open) }
  const rows = lists[tab]

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold tracking-tight">My reports</h1>
      <div role="tablist" aria-label="Reports" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setParams(t.value === 'open' ? {} : { tab: t.value }, { replace: true })}
            className={cn('h-10 rounded-md text-sm font-medium text-muted-foreground', tab === t.value && 'bg-surface text-foreground shadow-card')}
          >
            {t.label}
            {requests.data && <span className="ml-1 text-xs text-muted-foreground">{lists[t.value].length}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {requests.error ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : !requests.data || !ready ? (
          <ListSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={tab === 'open' ? 'No open reports' : 'No closed reports yet'}
            description={tab === 'open' ? 'Everything you reported has been dealt with.' : undefined}
            action={
              tab === 'open' && (
                <Button asChild>
                  <Link to="/operator/report">Report a problem</Link>
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <RequestCard r={r} lookups={lookups} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
