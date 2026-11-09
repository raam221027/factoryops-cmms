import { subHours } from 'date-fns'
import { AlertTriangle, CalendarDays, Inbox, Loader, UserX, XOctagon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { OverdueBadge, PriorityBadge } from '@/components/shared/badges'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, KpiSkeletonRow } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { PROBLEM_CATEGORY_LABELS, type Priority } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { compareByUrgency, isOpen, isOverdue, toIsoDate } from '@/domain/workOrderRules'
import { technicianWorkloads } from '@/domain/workload'
import { useSessionUser } from '@/features/auth/context'
import { useEquipmentList, useLookups, type Lookups } from '@/features/shared/queries'
import { AssignDialog } from '@/features/work-orders/AssignDialog'
import { useRequests, useWorkOrders } from '@/features/work-orders/hooks'
import { formatAgo, formatRelativeDay } from '@/lib/format'

const LIMIT = 5
const SEVERITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

function Panel({ title, count, to, linkLabel = 'View all', children, empty }: { title: string; count: number; to: string; linkLabel?: string; children: ReactNode; empty: string }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-2">
          {title} <Badge tone={count ? 'info' : 'success'}>{count}</Badge>
        </CardTitle>
        <Link to={to} className="text-xs text-primary hover:underline">
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent className="py-2">{count === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y">{children}</ul>}</CardContent>
    </Card>
  )
}

function WorkRow({ wo, lookups, action }: { wo: WorkOrder; lookups: Lookups; action?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Link to={`/supervisor/work-orders/${wo.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-sm font-medium">{wo.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {wo.number} · {lookups.equipment.get(wo.equipmentId)?.assetId} · {wo.assigneeId ? lookups.userName(wo.assigneeId) : 'Unassigned'} · due {formatRelativeDay(wo.dueDate)}
        </span>
      </Link>
      {isOverdue(wo) ? <OverdueBadge /> : <PriorityBadge priority={wo.priority} />}
      {action}
    </li>
  )
}

export function SupervisorDashboard() {
  const user = useSessionUser()
  const workOrders = useWorkOrders()
  const requests = useRequests({ status: 'Submitted' })
  const equipment = useEquipmentList()
  const { lookups, ready, error } = useLookups()
  const [assigning, setAssigning] = useState<WorkOrder | null>(null)
  const failed = workOrders.error ?? requests.error ?? equipment.error ?? error

  const data = useMemo(() => {
    if (!workOrders.data || !requests.data || !equipment.data) return null
    const today = toIsoDate(new Date())
    const open = workOrders.data.filter(isOpen).sort(compareByUrgency)
    const since = subHours(new Date(), 48).toISOString()
    return {
      queue: [...requests.data].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.createdAtUtc.localeCompare(b.createdAtUtc)),
      unassigned: open.filter((wo) => !wo.assigneeId),
      overdue: open.filter((wo) => isOverdue(wo)),
      today: open.filter((wo) => (wo.scheduledDate ?? wo.dueDate) === today),
      inProgress: open.filter((wo) => wo.status === 'InProgress').length,
      down: equipment.data.filter((e) => e.status === 'OutOfService'),
      completed: workOrders.data.filter((wo) => wo.status === 'Completed' && (wo.completedAtUtc ?? '') >= since).sort((a, b) => (b.completedAtUtc ?? '').localeCompare(a.completedAtUtc ?? '')),
      team: technicianWorkloads([...lookups.users.values()], workOrders.data),
    }
  }, [workOrders.data, requests.data, equipment.data, lookups])

  return (
    <>
      <PageHeader title="Operations overview" description={`Good to see you, ${user.name.split(' ')[0]}. Here is what needs a decision today.`} />
      {failed ? (
        <ErrorState error={failed} onRetry={() => (void workOrders.refetch(), void requests.refetch(), void equipment.refetch())} />
      ) : !data || !ready ? (
        <div className="space-y-4">
          <KpiSkeletonRow count={6} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Awaiting review" value={data.queue.length} icon={Inbox} tone="info" hint={`${data.queue.filter((r) => r.severity === 'Critical').length} critical`} to="/supervisor/requests" />
            <KpiCard label="Unassigned" value={data.unassigned.length} icon={UserX} tone="warning" hint="Open work without a technician" to="/supervisor/work-orders?view=unassigned" />
            <KpiCard label="Today" value={data.today.length} icon={CalendarDays} hint="Planned or due today" to="/supervisor/work-orders?view=today" />
            <KpiCard label="In progress" value={data.inProgress} icon={Loader} tone="info" to="/supervisor/board" />
            <KpiCard label="Overdue" value={data.overdue.length} icon={AlertTriangle} tone="danger" to="/supervisor/work-orders?view=overdue" />
            <KpiCard label="Machines down" value={data.down.length} icon={XOctagon} tone="danger" hint="Out of service" to="/supervisor/equipment" />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Requests to review" count={data.queue.length} to="/supervisor/requests" empty="No requests waiting. Nice.">
              {data.queue.slice(0, LIMIT).map((r) => (
                <li key={r.id} className="py-2">
                  <Link to={`/supervisor/requests?id=${r.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {PROBLEM_CATEGORY_LABELS[r.category]} · {lookups.equipmentName(r.equipmentId)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.number} · {lookups.userName(r.requestedById, 'Unknown')} · {formatAgo(r.createdAtUtc)}
                      </span>
                    </span>
                    <PriorityBadge priority={r.severity} />
                  </Link>
                </li>
              ))}
            </Panel>

            <Panel title="Needs a technician" count={data.unassigned.length} to="/supervisor/work-orders?view=unassigned" empty="Every open job has a technician.">
              {data.unassigned.slice(0, LIMIT).map((wo) => (
                <WorkRow
                  key={wo.id}
                  wo={wo}
                  lookups={lookups}
                  action={
                    <Button size="sm" variant="outline" onClick={() => setAssigning(wo)}>
                      Assign
                    </Button>
                  }
                />
              ))}
            </Panel>

            <Panel title="Overdue" count={data.overdue.length} to="/supervisor/work-orders?view=overdue" empty="Nothing overdue.">
              {data.overdue.slice(0, LIMIT).map((wo) => (
                <WorkRow key={wo.id} wo={wo} lookups={lookups} />
              ))}
            </Panel>

            <Panel title="Team right now" count={data.team.length} to="/supervisor/technicians" linkLabel="Workload" empty="No active technicians.">
              {data.team.map((w) => (
                <li key={w.technician.id} className="flex items-center gap-3 py-2">
                  <Avatar name={w.technician.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{w.technician.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {w.current ? (
                        <Link to={`/supervisor/work-orders/${w.current.id}`} className="text-info hover:underline">
                          On {w.current.number} · {lookups.equipmentName(w.current.equipmentId)}
                        </Link>
                      ) : (
                        'No job in progress'
                      )}
                    </p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">
                    {w.open.length} open
                    {w.overdue > 0 && <span className="block text-danger">{w.overdue} overdue</span>}
                  </span>
                </li>
              ))}
            </Panel>

            <Panel title="Completed in the last 48 h" count={data.completed.length} to="/supervisor/work-orders?view=closed" empty="Nothing completed yet.">
              {data.completed.slice(0, LIMIT).map((wo) => (
                <li key={wo.id} className="flex items-center gap-3 py-2">
                  <Link to={`/supervisor/work-orders/${wo.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium">{wo.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {wo.number} · {lookups.userName(wo.assigneeId)} · {formatAgo(wo.completedAtUtc)} · {wo.laborHours} h
                    </span>
                  </Link>
                  <Badge tone="success">{wo.type}</Badge>
                </li>
              ))}
            </Panel>

            <Panel title="Machines out of service" count={data.down.length} to="/supervisor/equipment" empty="All machines are running.">
              {data.down.slice(0, LIMIT).map((e) => (
                <li key={e.id} className="py-2">
                  <Link to={`/supervisor/equipment/${e.id}`} className="block hover:underline">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.assetId} · {lookups.locationLabel(e.id)}
                    </span>
                  </Link>
                </li>
              ))}
            </Panel>
          </div>
        </div>
      )}
      <AssignDialog workOrder={assigning} onOpenChange={(o) => !o && setAssigning(null)} />
    </>
  )
}
