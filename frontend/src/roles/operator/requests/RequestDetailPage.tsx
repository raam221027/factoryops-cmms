import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Check, ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { PriorityBadge } from '@/components/shared/badges'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { PROBLEM_CATEGORY_LABELS } from '@/domain/enums'
import { requestStage } from '@/domain/requests'
import type { MaintenanceRequest } from '@/domain/types'
import { useLookups, type Lookups } from '@/features/shared/queries'
import { formatAgo, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { services } from '@/services'

type StepState = 'done' | 'current' | 'upcoming' | 'stopped'
interface Step {
  title: string
  detail?: ReactNode
  state: StepState
}

const day = (iso: string) => format(parseISO(iso.length === 10 ? `${iso}T00:00` : iso), 'EEE d MMM')

/** The request's journey from report to repair, in the requester's terms. */
function stepsFor(r: MaintenanceRequest, lookups: Lookups): Step[] {
  const p = r.progress
  const steps: Step[] = [{ title: 'Reported', detail: `${formatDateTime(r.createdAtUtc)} · by you`, state: 'done' }]
  if (r.status === 'Submitted') {
    steps.push({ title: 'Supervisor review', detail: 'Waiting for a maintenance supervisor to look at it', state: 'current' })
    steps.push({ title: 'Technician assigned', state: 'upcoming' }, { title: 'Repair', state: 'upcoming' }, { title: 'Fixed', state: 'upcoming' })
    return steps
  }
  const reviewer = lookups.userName(r.reviewedById, 'a supervisor')
  if (r.status === 'Rejected') {
    steps.push({ title: 'Not approved', detail: <>By {reviewer} · {formatAgo(r.reviewedAtUtc)}{r.reviewNote && <span className="mt-1 block text-foreground">"{r.reviewNote}"</span>}</>, state: 'stopped' })
    return steps
  }
  steps.push({ title: 'Approved', detail: <>By {reviewer} · {formatAgo(r.reviewedAtUtc)}{p && ` · work order ${p.workOrderNumber}`}{r.reviewNote && <span className="mt-1 block text-foreground">"{r.reviewNote}"</span>}</>, state: 'done' })
  if (p?.status === 'Cancelled') {
    steps.push({ title: 'Closed without repair', detail: 'The work was cancelled by maintenance. Ask your supervisor if the problem is still there.', state: 'stopped' })
    return steps
  }
  const assigned = !!p?.technicianName
  const started = !!p?.startedAtUtc
  const fixed = p?.status === 'Completed'
  steps.push({
    title: assigned ? `Technician assigned: ${p!.technicianName}` : 'Technician assigned',
    detail: assigned ? (p!.scheduledDate ? `Planned for ${day(p!.scheduledDate)}` : undefined) : 'Waiting for the planner to assign someone',
    state: assigned ? 'done' : 'current',
  })
  steps.push({
    title: p?.status === 'OnHold' ? 'Repair paused' : 'Repair',
    detail: started ? `Started ${formatAgo(p!.startedAtUtc)}${p?.status === 'OnHold' ? ' · waiting on something (often parts)' : ''}` : undefined,
    state: fixed ? 'done' : started ? 'current' : 'upcoming',
  })
  steps.push({ title: 'Fixed', detail: fixed && p?.completedAtUtc ? formatDateTime(p.completedAtUtc) : undefined, state: fixed ? 'done' : 'upcoming' })
  return steps
}

export function RequestDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const request = useQuery({ queryKey: ['requests', 'detail', id], queryFn: () => services.requests.get(id) })
  const { lookups, ready } = useLookups()
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/operator/requests'))

  const header = (title: string, sub?: ReactNode) => (
    <div className="mb-4 flex items-start gap-2">
      <button type="button" onClick={back} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent" aria-label="Back">
        <ChevronLeft className="size-6" />
      </button>
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )

  if (request.isPending || !ready) return <ListSkeleton rows={4} />
  if (request.error)
    return (
      <>
        {header('Report')}
        <ErrorState error={request.error} onRetry={() => void request.refetch()} />
      </>
    )
  const r = request.data
  const stage = requestStage(r)
  const e = lookups.equipment.get(r.equipmentId)

  return (
    <>
      {header(e?.name ?? 'Report', <span className="font-mono text-xs">{r.number}</span>)}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stage.tone} className="px-2 py-1 text-sm">
            {stage.label}
          </Badge>
          <PriorityBadge priority={r.severity} />
        </div>

        <ol className="rounded-lg border bg-surface p-4 shadow-card" aria-label="Progress">
          {stepsFor(r, lookups).map((s, i, all) => (
            <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.state === 'current' ? 'step' : undefined}>
              {i < all.length - 1 && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5', s.state === 'done' ? 'bg-success' : 'bg-border')} aria-hidden />}
              <span
                className={cn(
                  'relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                  s.state === 'done' && 'border-success bg-success text-white',
                  s.state === 'current' && 'border-primary bg-surface',
                  s.state === 'upcoming' && 'border-border bg-surface',
                  s.state === 'stopped' && 'border-muted-foreground bg-muted-foreground',
                )}
                aria-hidden
              >
                {s.state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
                {s.state === 'current' && <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cn('text-sm font-medium', s.state === 'upcoming' && 'text-muted-foreground')}>{s.title}</p>
                {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-lg border bg-surface p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{PROBLEM_CATEGORY_LABELS[r.category]}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{r.description}</p>
          {r.additionalInfo && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.additionalInfo}</p>}
          {r.attachments.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {r.attachments.map((a) => (
                <li key={a.id}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                    <img src={a.url} alt={`Photo ${a.fileName}`} className="aspect-square w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {e?.assetId} · {lookups.locationLabel(r.equipmentId)}
          </p>
        </div>
      </div>
    </>
  )
}
