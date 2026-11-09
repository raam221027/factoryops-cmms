import { CheckCircle2, ChevronRight, Clock, MapPin, Pause, Play, ShieldAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { EquipmentStatusBadge, OverdueBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { StickyActionBar } from '@/components/layout/StickyActionBar'
import { Button } from '@/components/ui/button'
import type { WorkOrder } from '@/domain/types'
import { isOpen, isOverdue } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { ActivityLog } from '@/features/work-orders/ActivityLog'
import { useWorkOrder } from '@/features/work-orders/hooks'
import { formatDate, formatHours, formatRelativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { services } from '@/services'
import { Elapsed, MobileHeader } from '../components'
import { ChecklistSection, PartsSection, PhotosSection, Section } from './JobSections'
import { CompleteSheet, PauseSheet } from './JobSheets'

function Banner({ tone, icon, children }: { tone: 'info' | 'warning' | 'success' | 'muted'; icon: ReactNode; children: ReactNode }) {
  const cls = {
    info: 'border-info/40 bg-info-soft text-info',
    warning: 'border-warning/40 bg-warning-soft text-warning',
    success: 'border-success/40 bg-success-soft text-success',
    muted: 'bg-muted text-muted-foreground',
  }[tone]
  return <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', cls)}>{icon}<div className="min-w-0">{children}</div></div>
}

export function JobDetailPage() {
  const { id = '' } = useParams()
  const query = useWorkOrder(id)
  const { lookups } = useLookups()
  const [pausing, setPausing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const start = useServiceMutation(() => services.workOrders.start(id), { invalidates: WORK_ORDER_EFFECTS, success: 'Job started · timer running' })
  const resume = useServiceMutation(() => services.workOrders.resume(id), { invalidates: WORK_ORDER_EFFECTS, success: 'Job resumed' })

  if (query.isPending) return <ListSkeleton rows={6} />
  if (query.error)
    return (
      <>
        <MobileHeader title="Job" back="/tech/jobs" />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    )
  const wo = query.data
  const equipment = lookups.equipment.get(wo.equipmentId)

  return (
    <>
      <MobileHeader title={wo.title} subtitle={<span className="font-mono text-xs">{wo.number}</span>} back="/tech/jobs" />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <WorkOrderStatusBadge status={wo.status} />
          <PriorityBadge priority={wo.priority} />
          <Badge>{wo.type}</Badge>
          {isOverdue(wo) && <OverdueBadge />}
        </div>

        <StatusBanner wo={wo} />

        <Link to={`/tech/equipment/${wo.equipmentId}`} className="flex items-center gap-3 rounded-lg border bg-surface p-3 shadow-card active:bg-accent">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{equipment?.name ?? 'Unknown equipment'}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <span className="font-mono">{equipment?.assetId}</span> · <MapPin className="size-3" aria-hidden /> {lookups.locationLabel(wo.equipmentId)}
            </p>
            {equipment && (
              <div className="mt-1.5">
                <EquipmentStatusBadge status={equipment.status} />
              </div>
            )}
          </div>
          <span className="flex items-center text-xs text-primary">
            History <ChevronRight className="size-4" />
          </span>
        </Link>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Due</dt>
            <dd className={cn('font-medium', isOverdue(wo) && 'text-danger')}>{formatRelativeDay(wo.dueDate)}</dd>
          </div>
          <div className="rounded-lg border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Planned</dt>
            <dd className="font-medium">{wo.scheduledDate ? formatRelativeDay(wo.scheduledDate) : 'Not set'}</dd>
          </div>
        </dl>

        <Section title="What's wrong">
          <p className="whitespace-pre-line text-sm">{wo.description}</p>
        </Section>

        {wo.instructions && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft/60 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
              <ShieldAlert className="size-4" aria-hidden /> Instructions &amp; safety
            </p>
            <p className="whitespace-pre-line text-sm">{wo.instructions}</p>
          </div>
        )}

        {wo.status === 'Completed' && (
          <Section title="Completion report">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Hours</dt>
                <dd>{formatHours(wo.laborHours)}</dd>
              </div>
              {wo.rootCause && (
                <div>
                  <dt className="text-xs text-muted-foreground">Root cause</dt>
                  <dd>{wo.rootCause}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Actions taken</dt>
                <dd>{wo.actionsTaken}</dd>
              </div>
            </dl>
          </Section>
        )}

        {wo.checklist.length > 0 && <ChecklistSection wo={wo} />}
        <PartsSection wo={wo} />
        <PhotosSection wo={wo} />
        <Section title="Notes & activity">
          <ActivityLog wo={wo} lookups={lookups} />
        </Section>
      </div>

      {/* Primary action, kept within thumb reach above the bottom navigation */}
      <StickyActionBar>
          {wo.status === 'Assigned' && (
            <Button size="touch" variant="success" className="flex-1" loading={start.isPending} onClick={() => start.mutate(undefined)}>
              <Play /> Start job
            </Button>
          )}
          {wo.status === 'InProgress' && (
            <>
              <Button size="touch" variant="outline" onClick={() => setPausing(true)}>
                <Pause /> Pause
              </Button>
              <Button size="touch" variant="success" className="flex-1" onClick={() => setCompleting(true)}>
                <CheckCircle2 /> Complete
              </Button>
            </>
          )}
          {wo.status === 'OnHold' && (
            <Button size="touch" className="flex-1" loading={resume.isPending} onClick={() => resume.mutate(undefined)}>
              <Play /> Resume job
            </Button>
          )}
          {!isOpen(wo) || wo.status === 'New' || wo.status === 'Pending' ? (
            <Button size="touch" variant="outline" className="flex-1" asChild>
              <Link to="/tech/jobs">Back to my jobs</Link>
            </Button>
          ) : null}
      </StickyActionBar>

      <PauseSheet wo={wo} open={pausing} onOpenChange={setPausing} />
      <CompleteSheet
        wo={wo}
        open={completing}
        onOpenChange={setCompleting}
        onCompleted={() => {
          setCompleting(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </>
  )
}

function StatusBanner({ wo }: { wo: WorkOrder }) {
  switch (wo.status) {
    case 'InProgress':
      return (
        <Banner tone="info" icon={<Clock />}>
          <span className="font-medium">Working</span> · started <Elapsed since={wo.startedAtUtc!} /> ago
        </Banner>
      )
    case 'OnHold':
      return (
        <Banner tone="warning" icon={<Pause />}>
          <span className="font-medium">Paused:</span> {wo.holdReason ?? 'no reason given'}
        </Banner>
      )
    case 'New':
    case 'Pending':
      return (
        <Banner tone="muted" icon={<Clock />}>
          The planner has not released this job yet ({wo.status === 'Pending' ? 'waiting on parts or a slot' : 'being triaged'}). You'll be notified when it's ready.
        </Banner>
      )
    case 'Completed':
      return (
        <Banner tone="success" icon={<CheckCircle2 />}>
          Completed {formatDate(wo.completedAtUtc)} · {formatHours(wo.laborHours)}
        </Banner>
      )
    case 'Cancelled':
      return (
        <Banner tone="muted" icon={<Clock />}>
          This job was cancelled by the planner. No further work needed.
        </Banner>
      )
    default:
      return null
  }
}
