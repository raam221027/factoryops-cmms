import { Mail, Phone, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { OverdueBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, KpiSkeletonRow, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import type { WorkOrder } from '@/domain/types'
import { isOverdue } from '@/domain/workOrderRules'
import { HEAVY_LOAD, type TechnicianWorkload } from '@/domain/workload'
import { useLookups, type Lookups } from '@/features/shared/queries'
import { AssignDialog } from '@/features/work-orders/AssignDialog'
import { useTechnicianWorkloads, useWorkOrders } from '@/features/work-orders/hooks'
import { formatRelativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'

const QUEUE_PREVIEW = 5
const LOAD = {
  light: { tone: 'success', label: 'Available' },
  normal: { tone: 'info', label: 'Normal load' },
  heavy: { tone: 'warning', label: 'Busy' },
} as const

export function TechniciansPage() {
  const { workloads, error, refetch } = useTechnicianWorkloads()
  const workOrders = useWorkOrders()
  const { lookups } = useLookups()
  const [reassigning, setReassigning] = useState<WorkOrder | null>(null)

  const unassigned = (workOrders.data ?? []).filter((wo) => !wo.assigneeId && ['New', 'Pending'].includes(wo.status)).length

  return (
    <>
      <PageHeader title="Technicians" description="Who is working on what, and who has room for more." />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !workloads ? (
        <div className="space-y-4">
          <KpiSkeletonRow />
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <>
          <section aria-label="Team summary" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Working now" value={`${workloads.filter((w) => w.current).length} / ${workloads.length}`} icon={Wrench} tone="info" hint="Technicians with a job in progress" />
            <KpiCard label="Open jobs assigned" value={workloads.reduce((s, w) => s + w.open.length, 0)} hint={`Avg ${(workloads.reduce((s, w) => s + w.open.length, 0) / Math.max(1, workloads.length)).toFixed(1)} per technician`} />
            <KpiCard label="Waiting for a technician" value={unassigned} tone={unassigned ? 'warning' : 'success'} to="/supervisor/work-orders?view=unassigned" hint="New and pending, unassigned" />
            <KpiCard label="Busy technicians" value={workloads.filter((w) => w.load === 'heavy').length} tone="warning" hint={`${HEAVY_LOAD}+ open jobs`} />
          </section>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {workloads.map((w) => (
              <TechnicianCard key={w.technician.id} w={w} lookups={lookups} onReassign={setReassigning} />
            ))}
          </div>
        </>
      )}
      <AssignDialog workOrder={reassigning} onOpenChange={(o) => !o && setReassigning(null)} />
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'info' | 'warning' }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', value > 0 && tone === 'danger' && 'text-danger', value > 0 && tone === 'info' && 'text-info', value > 0 && tone === 'warning' && 'text-warning')}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function TechnicianCard({ w, lookups, onReassign }: { w: TechnicianWorkload; lookups: Lookups; onReassign: (wo: WorkOrder) => void }) {
  const t = w.technician
  const queue = w.open.filter((wo) => wo.id !== w.current?.id)
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={t.name} className="size-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{t.name}</p>
            <p className="truncate text-xs text-muted-foreground">{[t.title, t.shift].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <Badge tone={LOAD[w.load].tone}>{LOAD[w.load].label}</Badge>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {t.skills.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Skills">
            {t.skills.map((s) => (
              <li key={s}>
                <Badge>{s}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-5 gap-1.5">
          <Stat label="Open" value={w.open.length} />
          <Stat label="Today" value={w.today} tone="info" />
          <Stat label="Overdue" value={w.overdue} tone="danger" />
          <Stat label="On hold" value={w.onHold} tone="warning" />
          <Stat label="Done 7d" value={w.completedLast7Days} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now</p>
          {w.current ? (
            <Link to={`/supervisor/work-orders/${w.current.id}`} className="block rounded-md border border-info/40 bg-info-soft/40 px-3 py-2 hover:border-info">
              <span className="flex items-center gap-2 text-xs">
                <span className="font-mono">{w.current.number}</span>
                <WorkOrderStatusBadge status={w.current.status} />
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium">{w.current.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{lookups.equipmentName(w.current.equipmentId)}</span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">No job in progress</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue ({queue.length})</p>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing else assigned.</p>
          ) : (
            <ul className="divide-y">
              {queue.slice(0, QUEUE_PREVIEW).map((wo) => (
                <li key={wo.id} className="flex items-center gap-2 py-1.5">
                  <Link to={`/supervisor/work-orders/${wo.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm">{wo.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {wo.number} · {wo.status === 'OnHold' ? 'On hold' : `due ${formatRelativeDay(wo.dueDate)}`}
                    </span>
                  </Link>
                  {isOverdue(wo) ? <OverdueBadge /> : <PriorityBadge priority={wo.priority} />}
                  {wo.status !== 'InProgress' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onReassign(wo)} aria-label={`Reassign ${wo.number}`}>
                      Reassign
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between">
        <div className="flex gap-1">
          {t.phone && (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={`tel:${t.phone}`} aria-label={`Call ${t.name}`}>
                <Phone />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={`mailto:${t.email}`} aria-label={`Email ${t.name}`}>
              <Mail />
            </a>
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/supervisor/work-orders?assignee=${t.id}`}>All {w.open.length} open jobs</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
