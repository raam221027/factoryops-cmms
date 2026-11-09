import { ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { SearchInput } from '@/components/shared/filters'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { OPEN_WORK_ORDER_STATUSES } from '@/domain/enums'
import { compareByUrgency, isOnTodaysList } from '@/domain/workOrderRules'
import { useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { cn, matchesQuery } from '@/lib/utils'
import { JobCard, MobileHeader } from '../components'

const TABS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All open' },
] as const
type Tab = (typeof TABS)[number]['value']

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'today') as Tab
  const search = params.get('q') ?? ''
  const jobs = useWorkOrders({ mine: true, status: [...OPEN_WORK_ORDER_STATUSES] })
  const { lookups, ready, error } = useLookups()

  function set(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const { lists, rows } = useMemo(() => {
    const all = (jobs.data ?? []).slice().sort(compareByUrgency)
    const lists: Record<Tab, typeof all> = {
      today: all.filter((w) => isOnTodaysList(w) || w.status === 'InProgress'),
      upcoming: all.filter((w) => !isOnTodaysList(w) && w.status !== 'InProgress'),
      all,
    }
    const rows = lists[tab].filter((w) => {
      const e = lookups.equipment.get(w.equipmentId)
      return matchesQuery(search, w.number, w.title, e?.name, e?.assetId)
    })
    return { lists, rows }
  }, [jobs.data, tab, search, lookups])

  return (
    <>
      <MobileHeader title="My jobs" />
      <div role="tablist" aria-label="Job lists" className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => set('tab', t.value === 'today' ? '' : t.value)}
            className={cn('h-10 rounded-md text-sm font-medium text-muted-foreground', tab === t.value && 'bg-surface text-foreground shadow-card')}
          >
            {t.label}
            {jobs.data && <span className="ml-1 text-xs text-muted-foreground">{lists[t.value].length}</span>}
          </button>
        ))}
      </div>
      <SearchInput value={search} onChange={(v) => set('q', v)} placeholder="Search jobs or machines…" className="mb-3 [&_input]:h-11" />
      <div role="tabpanel">
        {jobs.error || error ? (
          <ErrorState error={jobs.error ?? error} onRetry={() => void jobs.refetch()} />
        ) : !jobs.data || !ready ? (
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={search ? 'No jobs match your search' : tab === 'today' ? 'Nothing for today' : 'No jobs here'}
            description={tab === 'today' && !search ? 'Check upcoming jobs or scan a machine to look it up.' : undefined}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((wo) => (
              <li key={wo.id}>
                <JobCard wo={wo} lookups={lookups} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
