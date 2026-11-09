import { format, parseISO, startOfWeek, subDays } from 'date-fns'
import { History } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { formatHours } from '@/lib/format'
import { MobileHeader } from '../components'

const PAGE_DAYS = 30

export function HistoryPage() {
  const jobs = useWorkOrders({ mine: true, status: 'Completed' })
  const { lookups, ready, error } = useLookups()
  const [days, setDays] = useState(PAGE_DAYS)

  const data = useMemo(() => {
    const all = (jobs.data ?? []).filter((w) => w.completedAtUtc).sort((a, b) => b.completedAtUtc!.localeCompare(a.completedAtUtc!))
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
    const thisWeek = all.filter((w) => w.completedAtUtc! >= weekStart)
    const since = subDays(new Date(), days).toISOString()
    const shown = all.filter((w) => w.completedAtUtc! >= since)
    const groups = new Map<string, typeof shown>()
    for (const w of shown) {
      const key = w.completedAtUtc!.slice(0, 10)
      ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(w)
    }
    return { total: all.length, shownCount: shown.length, thisWeek, groups: [...groups.entries()] }
  }, [jobs.data, days])

  return (
    <>
      <MobileHeader title="My history" subtitle="Jobs you have completed" />
      {jobs.error || error ? (
        <ErrorState error={jobs.error ?? error} onRetry={() => void jobs.refetch()} />
      ) : !jobs.data || !ready ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold tabular-nums">{data.thisWeek.length}</p>
              <p className="text-xs text-muted-foreground">Jobs this week</p>
            </div>
            <div className="rounded-lg border bg-surface p-3 shadow-card">
              <p className="text-2xl font-semibold tabular-nums">{formatHours(data.thisWeek.reduce((s, w) => s + w.laborHours, 0))}</p>
              <p className="text-xs text-muted-foreground">Logged this week</p>
            </div>
          </div>
          {data.groups.length === 0 ? (
            <EmptyState icon={History} title={`Nothing completed in the last ${days} days`} />
          ) : (
            <div className="space-y-4">
              {data.groups.map(([day, items]) => (
                <section key={day} aria-label={format(parseISO(day), 'EEEE, MMM d')}>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{format(parseISO(day), 'EEEE, MMM d')}</h2>
                  <ul className="divide-y rounded-lg border bg-surface shadow-card">
                    {items.map((w) => (
                      <li key={w.id}>
                        <Link to={`/tech/jobs/${w.id}`} className="flex items-center gap-3 px-3 py-3 active:bg-accent">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{w.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {w.number} · {lookups.equipment.get(w.equipmentId)?.assetId} · {format(parseISO(w.completedAtUtc!), 'HH:mm')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm tabular-nums">{formatHours(w.laborHours)}</p>
                            <Badge tone={w.type === 'Preventive' ? 'success' : 'neutral'}>{w.type === 'Preventive' ? 'PM' : 'Repair'}</Badge>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {data.shownCount < data.total && (
            <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => setDays((d) => d + PAGE_DAYS)}>
              Show older jobs
            </Button>
          )}
        </>
      )}
    </>
  )
}
