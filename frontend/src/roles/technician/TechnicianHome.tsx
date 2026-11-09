import { CheckCircle2 } from 'lucide-react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { OPEN_WORK_ORDER_STATUSES } from '@/domain/enums'
import { compareByUrgency, isDueOn, isOverdue } from '@/domain/workOrderRules'
import { useSessionUser } from '@/features/auth/context'
import { useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { WorkOrderCard } from '@/features/work-orders/WorkOrderCard'

function greeting(date = new Date()) {
  const h = date.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function TechnicianHome() {
  const user = useSessionUser()
  const jobs = useWorkOrders({ mine: true, status: [...OPEN_WORK_ORDER_STATUSES] })
  const { lookups, ready, error } = useLookups()

  const open = (jobs.data ?? []).slice().sort(compareByUrgency)
  const today = new Date()
  const stats = [
    { label: 'Due today', value: open.filter((w) => isDueOn(w, today)).length },
    { label: 'Overdue', value: open.filter((w) => isOverdue(w, today)).length, danger: true },
    { label: 'In progress', value: open.filter((w) => w.status === 'InProgress').length },
  ]

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-surface p-3 text-center shadow-card">
            <p className={s.danger && s.value > 0 ? 'text-2xl font-semibold text-danger' : 'text-2xl font-semibold'}>{jobs.data ? s.value : '–'}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="my-open-jobs">
        <h2 id="my-open-jobs" className="mb-2 text-sm font-semibold">
          My open jobs
        </h2>
        {jobs.error || error ? (
          <ErrorState error={jobs.error ?? error} onRetry={() => void jobs.refetch()} />
        ) : !jobs.data || !ready ? (
          <ListSkeleton rows={4} />
        ) : open.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No open jobs" description="New assignments will appear here." />
        ) : (
          <ul className="space-y-2">
            {open.map((wo) => (
              <li key={wo.id}>
                <WorkOrderCard wo={wo} lookups={lookups} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
