import { CheckCircle2, ChevronRight, Clock, Pause, QrCode } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { OPEN_WORK_ORDER_STATUSES } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { compareByUrgency, isOnTodaysList, isOverdue } from '@/domain/workOrderRules'
import { useSessionUser } from '@/features/auth/context'
import { useLookups, type Lookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { cn } from '@/lib/utils'
import { Elapsed, JobCard } from '../components'

function greeting(date = new Date()) {
  const h = date.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const NEXT_UP = 3

export function TechnicianHome() {
  const user = useSessionUser()
  const jobs = useWorkOrders({ mine: true, status: [...OPEN_WORK_ORDER_STATUSES] })
  const { lookups, ready, error } = useLookups()

  const open = (jobs.data ?? []).slice().sort(compareByUrgency)
  const current = open.find((w) => w.status === 'InProgress')
  const onHold = open.filter((w) => w.status === 'OnHold')
  const queue = open.filter((w) => w.status !== 'InProgress' && w.status !== 'OnHold')
  const today = queue.filter((w) => isOnTodaysList(w))
  const later = queue.filter((w) => !isOnTodaysList(w))
  const stats = [
    { label: 'Today', value: today.length + (current ? 1 : 0) },
    { label: 'Overdue', value: open.filter((w) => isOverdue(w)).length, danger: true },
    { label: 'Open', value: open.length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{user.name.split(' ')[0]}</h1>
        </div>
        <Button size="lg" asChild>
          <Link to="/tech/scan">
            <QrCode /> Scan
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-surface p-3 text-center shadow-card">
            <p className={cn('text-2xl font-semibold tabular-nums', s.danger && s.value > 0 && 'text-danger')}>{jobs.data ? s.value : '–'}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {jobs.error || error ? (
        <ErrorState error={jobs.error ?? error} onRetry={() => void jobs.refetch()} />
      ) : !jobs.data || !ready ? (
        <ListSkeleton rows={4} />
      ) : open.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="All caught up" description="You have no open jobs. New assignments appear here and in your notifications." />
      ) : (
        <>
          {current && <CurrentJob wo={current} lookups={lookups} />}

          {onHold.length > 0 && (
            <JobList title="Paused" icon={<Pause className="size-4 text-warning" />} items={onHold} lookups={lookups} />
          )}

          <JobList
            title="Today"
            items={today}
            lookups={lookups}
            empty={current ? 'Nothing else planned for today.' : 'Nothing planned for today.'}
          />

          {later.length > 0 && (
            <section aria-labelledby="next-up">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="next-up" className="text-sm font-semibold">
                  Coming up
                </h2>
                <Link to="/tech/jobs?tab=upcoming" className="flex items-center text-xs text-primary">
                  All {later.length} <ChevronRight className="size-3.5" />
                </Link>
              </div>
              <ul className="space-y-2">
                {later.slice(0, NEXT_UP).map((wo) => (
                  <li key={wo.id}>
                    <JobCard wo={wo} lookups={lookups} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function CurrentJob({ wo, lookups }: { wo: WorkOrder; lookups: Lookups }) {
  return (
    <Link to={`/tech/jobs/${wo.id}`} className="block rounded-lg bg-primary p-4 text-primary-foreground shadow-popover active:opacity-95">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide opacity-80">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        Working now · <Clock className="size-3" aria-hidden /> <Elapsed since={wo.startedAtUtc!} />
      </p>
      <p className="mt-1.5 text-base font-semibold leading-snug">{wo.title}</p>
      <p className="mt-0.5 text-sm opacity-80">
        {lookups.equipment.get(wo.equipmentId)?.assetId} · {lookups.locationLabel(wo.equipmentId)}
      </p>
      <p className="mt-3 flex items-center justify-between text-sm font-medium">
        <span>
          {wo.checklist.length > 0 ? `${wo.checklist.filter((c) => c.done).length}/${wo.checklist.length} steps done` : wo.number}
        </span>
        <span className="flex items-center">
          Continue <ChevronRight className="size-4" />
        </span>
      </p>
    </Link>
  )
}

function JobList({ title, icon, items, lookups, empty }: { title: string; icon?: ReactNode; items: WorkOrder[]; lookups: Lookups; empty?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((wo) => (
            <li key={wo.id}>
              <JobCard wo={wo} lookups={lookups} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
