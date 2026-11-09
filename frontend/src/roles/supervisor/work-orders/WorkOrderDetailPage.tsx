import { CheckCircle2, ChevronDown, Circle, Pencil, UserPlus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { OverdueBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { Detail } from '@/components/shared/Detail'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table'
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { canTransition, isOpen, isOverdue } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, useParts, usePmSchedules, WORK_ORDER_EFFECTS, type Lookups } from '@/features/shared/queries'
import { ActivityLog } from '@/features/work-orders/ActivityLog'
import { AssignDialog } from '@/features/work-orders/AssignDialog'
import { CancelWorkOrderDialog } from '@/features/work-orders/CancelWorkOrderDialog'
import { useWorkOrder } from '@/features/work-orders/hooks'
import { WorkOrderFormDialog } from '@/features/work-orders/WorkOrderFormDialog'
import { formatCurrency, formatDate, formatDateTime, formatHours } from '@/lib/format'
import { services } from '@/services'

/** Planner-side status moves; assigning goes through the assign dialog instead. */
const PLANNER_MOVES: { to: WorkOrderStatus; label: string }[] = [
  { to: 'Pending', label: 'Mark pending (waiting on parts or slot)' },
  { to: 'New', label: 'Back to new (needs triage)' },
]

export function WorkOrderDetailPage() {
  const { id = '' } = useParams()
  const query = useWorkOrder(id)
  const { lookups } = useLookups()
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState<WorkOrder | null>(null)
  const [cancelling, setCancelling] = useState<WorkOrder | null>(null)
  const move = useServiceMutation((v: { to: WorkOrderStatus }) => services.workOrders.changeStatus(id, v.to), {
    invalidates: WORK_ORDER_EFFECTS,
    success: (wo) => `${wo.number} is now ${WORK_ORDER_STATUS_LABELS[wo.status].toLowerCase()}`,
  })

  if (query.isPending) return <ListSkeleton rows={6} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const wo = query.data
  const open = isOpen(wo)
  const moves = PLANNER_MOVES.filter((m) => canTransition(wo.status, m.to))
  const canAssign = open && wo.status !== 'InProgress'

  return (
    <>
      <PageHeader
        title={wo.title}
        breadcrumbs={[{ label: 'Work orders', to: '/supervisor/work-orders' }, { label: wo.number }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{wo.number}</span>
            <WorkOrderStatusBadge status={wo.status} />
            <PriorityBadge priority={wo.priority} />
            <Badge>{wo.type}</Badge>
            {isOverdue(wo) && <OverdueBadge />}
          </span>
        }
        actions={
          open && (
            <>
              {(moves.length > 0 || canTransition(wo.status, 'Cancelled')) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Status <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {moves.map((m) => (
                      <DropdownMenuItem key={m.to} onSelect={() => move.mutate({ to: m.to })}>
                        {m.label}
                      </DropdownMenuItem>
                    ))}
                    {canTransition(wo.status, 'Cancelled') && (
                      <DropdownMenuItem destructive onSelect={() => setCancelling(wo)}>
                        <XCircle /> Cancel work order…
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              {canAssign && (
                <Button onClick={() => setAssigning(wo)}>
                  <UserPlus /> {wo.assigneeId ? 'Reassign' : 'Assign'}
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm">{wo.description}</p>
              {wo.instructions && (
                <div className="rounded-md border border-warning/30 bg-warning-soft/50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Instructions</p>
                  <p className="whitespace-pre-line text-sm">{wo.instructions}</p>
                </div>
              )}
              {wo.status === 'OnHold' && wo.holdReason && (
                <p className="text-sm">
                  <span className="font-medium text-warning">On hold:</span> {wo.holdReason}
                </p>
              )}
            </CardContent>
          </Card>

          {wo.status === 'Completed' && (
            <Card>
              <CardHeader>
                <CardTitle>Completion report</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Labor">{formatHours(wo.laborHours)}</Detail>
                  <Detail label="Root cause">{wo.rootCause}</Detail>
                  <Detail label="Actions taken">{wo.actionsTaken}</Detail>
                </dl>
              </CardContent>
            </Card>
          )}

          {wo.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Checklist</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {wo.checklist.filter((c) => c.done).length} of {wo.checklist.length} done
                </span>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {wo.checklist.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      {c.done ? <CheckCircle2 className="mt-0.5 size-4 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" aria-label="Not done" />}
                      <span className={c.done ? 'text-muted-foreground line-through' : undefined}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <PartsCard wo={wo} />

          {wo.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {wo.attachments.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border">
                    <img src={a.url} alt={`${a.kind} photo: ${a.fileName}`} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                    <span className="block truncate px-2 py-1 text-xs text-muted-foreground">
                      {a.kind} · {lookups.userName(a.uploadedById, '')}
                    </span>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityLog wo={wo} lookups={lookups} />
            </CardContent>
          </Card>
        </div>

        <SummaryCard wo={wo} lookups={lookups} />
      </div>

      <WorkOrderFormDialog open={editing} onOpenChange={setEditing} workOrder={wo} />
      <AssignDialog workOrder={assigning} onOpenChange={(o) => !o && setAssigning(null)} />
      <CancelWorkOrderDialog workOrder={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </>
  )
}

function SummaryCard({ wo, lookups }: { wo: WorkOrder; lookups: Lookups }) {
  const schedules = usePmSchedules()
  const equipment = lookups.equipment.get(wo.equipmentId)
  const schedule = wo.pmScheduleId ? schedules.data?.find((s) => s.id === wo.pmScheduleId) : undefined
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-1">
          <Detail label="Equipment">
            {equipment ? (
              <Link to={`/supervisor/equipment/${equipment.id}`} className="text-primary hover:underline">
                {equipment.assetId} · {equipment.name}
              </Link>
            ) : null}
          </Detail>
          <Detail label="Location">{lookups.locationLabel(wo.equipmentId)}</Detail>
          <Detail label="Technician">{wo.assigneeId ? lookups.userName(wo.assigneeId) : <span className="text-warning">Unassigned</span>}</Detail>
          <Detail label="Planned day">{wo.scheduledDate ? formatDate(wo.scheduledDate) : 'Not scheduled'}</Detail>
          <Detail label="Due">{formatDate(wo.dueDate)}</Detail>
          <Detail label="Created">
            {formatDateTime(wo.createdAtUtc)}
            <span className="block text-xs text-muted-foreground">by {lookups.userName(wo.createdById, 'System')}</span>
          </Detail>
          {wo.startedAtUtc && <Detail label="Started">{formatDateTime(wo.startedAtUtc)}</Detail>}
          {wo.completedAtUtc && <Detail label="Completed">{formatDateTime(wo.completedAtUtc)}</Detail>}
          {wo.requestId && (
            <Detail label="Source">
              <Link to={`/supervisor/requests?id=${wo.requestId}`} className="text-primary hover:underline">
                Operator request
              </Link>
            </Detail>
          )}
          {wo.pmScheduleId && <Detail label="PM schedule">{schedule?.name ?? 'Preventive schedule'}</Detail>}
        </dl>
      </CardContent>
    </Card>
  )
}

function PartsCard({ wo }: { wo: WorkOrder }) {
  const parts = useParts()
  if (wo.partsRequired.length === 0 && wo.partsUsed.length === 0) return null
  const byId = new Map((parts.data ?? []).map((p) => [p.id, p]))
  const ids = [...new Set([...wo.partsRequired, ...wo.partsUsed].map((l) => l.partId))]
  const qty = (lines: WorkOrder['partsUsed'], partId: string) => lines.find((l) => l.partId === partId)?.quantity ?? 0
  const total = wo.partsUsed.reduce((s, l) => s + (byId.get(l.partId)?.unitCost ?? 0) * l.quantity, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parts</CardTitle>
        {wo.partsUsed.length > 0 && <span className="text-xs text-muted-foreground">Used: {formatCurrency(total)}</span>}
      </CardHeader>
      <Table>
        <THead>
          <Tr>
            <Th>Part</Th>
            <Th className="text-right">Planned</Th>
            <Th className="text-right">Used</Th>
            <Th className="text-right">In stock</Th>
          </Tr>
        </THead>
        <TBody>
          {ids.map((pid) => {
            const p = byId.get(pid)
            const short = p && p.quantityOnHand < qty(wo.partsRequired, pid) - qty(wo.partsUsed, pid)
            return (
              <Tr key={pid}>
                <Td>
                  <span className="font-medium">{p?.name ?? 'Unknown part'}</span>
                  {p && <span className="block font-mono text-xs text-muted-foreground">{p.partNumber}</span>}
                </Td>
                <Td className="text-right tabular-nums">{qty(wo.partsRequired, pid) || '—'}</Td>
                <Td className="text-right tabular-nums">{qty(wo.partsUsed, pid) || '—'}</Td>
                <Td className="text-right tabular-nums">
                  {p ? (
                    <span className={short ? 'font-medium text-danger' : undefined}>
                      {p.quantityOnHand} {p.unit}
                    </span>
                  ) : (
                    '—'
                  )}
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </Card>
  )
}
