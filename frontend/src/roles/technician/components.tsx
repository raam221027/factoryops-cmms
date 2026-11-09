import { ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { WorkOrder } from '@/domain/types'
import type { Lookups } from '@/features/shared/queries'
import { formatElapsed } from '@/lib/format'
import { WorkOrderCard } from '@/features/work-orders/WorkOrderCard'

/** Page title row for technician screens, with an optional back button sized for thumbs. */
export function MobileHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div className="mb-4 flex items-start gap-2">
      {back && (
        <button
          type="button"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(back))}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Back"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-lg font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

/** Whole card is the tap target. */
export function JobCard({ wo, lookups }: { wo: WorkOrder; lookups: Lookups }) {
  return (
    <Link to={`/tech/jobs/${wo.id}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.99]">
      <WorkOrderCard wo={wo} lookups={lookups} className="hover:border-primary/40" />
    </Link>
  )
}

/** Time since a moment, refreshed every 30 seconds. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <time dateTime={since} className="tabular-nums">
      {formatElapsed(since, now)}
    </time>
  )
}
