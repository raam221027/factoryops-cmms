import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { ExternalLink, GripVertical, MoreHorizontal, Plus, UserPlus, XCircle } from 'lucide-react'
import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { PRIORITIES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPES, type Priority, type WorkOrderStatus, type WorkOrderType } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { canTransition, compareByUrgency } from '@/domain/workOrderRules'
import { PLANNING_STATUSES } from '@/domain/workload'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, WORK_ORDER_EFFECTS, type Lookups } from '@/features/shared/queries'
import { AssignDialog } from '@/features/work-orders/AssignDialog'
import { CancelWorkOrderDialog } from '@/features/work-orders/CancelWorkOrderDialog'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { WorkOrderCard } from '@/features/work-orders/WorkOrderCard'
import { WorkOrderFormDialog } from '@/features/work-orders/WorkOrderFormDialog'
import { cn, matchesQuery } from '@/lib/utils'
import { services } from '@/services'

const COLUMNS: { status: WorkOrderStatus; hint: string }[] = [
  { status: 'New', hint: 'Needs triage' },
  { status: 'Pending', hint: 'Waiting on parts or a slot' },
  { status: 'Assigned', hint: 'Ready for the technician' },
  { status: 'InProgress', hint: 'Being worked on' },
  { status: 'OnHold', hint: 'Paused by technician' },
  { status: 'Completed', hint: 'Last 7 days' },
]

const isPlannerTarget = (s: WorkOrderStatus): boolean => (PLANNING_STATUSES as readonly WorkOrderStatus[]).includes(s)

/** Why a card cannot go to a column, or null when the move is allowed. */
function blockedReason(wo: WorkOrder, to: WorkOrderStatus): string | null {
  if (wo.status === to) return null
  if (!isPlannerTarget(to)) return 'Starting, pausing and completing work is done by the assigned technician.'
  if (!canTransition(wo.status, to)) return `A work order that is ${WORK_ORDER_STATUS_LABELS[wo.status].toLowerCase()} cannot move to ${WORK_ORDER_STATUS_LABELS[to].toLowerCase()}.`
  return null
}

export function BoardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workOrders = useWorkOrders()
  const { lookups, ready, error } = useLookups()
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [type, setType] = useState<WorkOrderType | ''>('')
  const [dragging, setDragging] = useState<WorkOrder | null>(null)
  const [assigning, setAssigning] = useState<WorkOrder | null>(null)
  const [cancelling, setCancelling] = useState<WorkOrder | null>(null)
  const [creating, setCreating] = useState(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch so a swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const changeStatus = useServiceMutation((v: { id: string; to: WorkOrderStatus }) => services.workOrders.changeStatus(v.id, v.to), {
    invalidates: WORK_ORDER_EFFECTS,
    success: (wo) => `${wo.number} moved to ${WORK_ORDER_STATUS_LABELS[wo.status].toLowerCase()}`,
  })

  const columns = useMemo(() => {
    const weekAgo = subDays(new Date(), 7)
    const visible = (workOrders.data ?? []).filter((wo) => {
      if (wo.status === 'Cancelled') return false
      if (wo.status === 'Completed' && (!wo.completedAtUtc || new Date(wo.completedAtUtc) < weekAgo)) return false
      if (assignee === 'none' ? !!wo.assigneeId : assignee && wo.assigneeId !== assignee) return false
      if (priority && wo.priority !== priority) return false
      if (type && wo.type !== type) return false
      const e = lookups.equipment.get(wo.equipmentId)
      return matchesQuery(search, wo.number, wo.title, e?.name, e?.assetId)
    })
    return COLUMNS.map((c) => ({
      ...c,
      items: visible
        .filter((wo) => wo.status === c.status)
        .sort(c.status === 'Completed' ? (a, b) => (b.completedAtUtc ?? '').localeCompare(a.completedAtUtc ?? '') : compareByUrgency),
    }))
  }, [workOrders.data, assignee, priority, type, search, lookups])

  /** Moves the card immediately, then rolls back if the server refuses. */
  function move(wo: WorkOrder, to: WorkOrderStatus) {
    const reason = blockedReason(wo, to)
    if (reason) return void toast.info(reason)
    if (wo.status === to) return
    if (to === 'Assigned' && !wo.assigneeId) return setAssigning(wo)
    const key = ['workOrders', 'list', {}]
    const snapshot = queryClient.getQueryData<WorkOrder[]>(key)
    queryClient.setQueryData<WorkOrder[]>(key, (list) => list?.map((w) => (w.id === wo.id ? { ...w, status: to } : w)))
    changeStatus.mutate({ id: wo.id, to }, { onError: () => queryClient.setQueryData(key, snapshot) })
  }

  // Screen reader wording: work order numbers and column names instead of internal ids
  const numberOf = (id: string | number) => (workOrders.data ?? []).find((w) => w.id === id)?.number ?? 'Work order'
  const columnName = (id: string | number) => WORK_ORDER_STATUS_LABELS[id as WorkOrderStatus] ?? String(id)

  function onDragStart(e: DragStartEvent) {
    setDragging((workOrders.data ?? []).find((w) => w.id === e.active.id) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const wo = (workOrders.data ?? []).find((w) => w.id === e.active.id)
    if (wo && e.over) move(wo, e.over.id as WorkOrderStatus)
  }

  const technicians = [...lookups.users.values()].filter((u) => u.role === 'Technician' && u.active)

  return (
    <>
      <PageHeader
        title="Work board"
        description="Drag cards to triage and plan. Technicians move work into progress and completion from their phones."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New work order
          </Button>
        }
      />
      <Card className="mb-4">
        <FilterBar className="border-b-0">
          <SearchInput value={search} onChange={setSearch} placeholder="Search number, title, equipment…" className="sm:w-72" />
          <FilterSelect label="Technician" value={assignee} onChange={setAssignee} options={[{ value: 'none', label: 'Unassigned' }, ...technicians.map((t) => ({ value: t.id, label: t.name }))]} />
          <FilterSelect label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: p }))} className="sm:w-36" />
          <FilterSelect label="Type" value={type} onChange={setType} options={WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))} className="sm:w-36" />
        </FilterBar>
      </Card>

      {workOrders.error || error ? (
        <ErrorState error={workOrders.error ?? error} onRetry={() => void workOrders.refetch()} />
      ) : !workOrders.data || !ready ? (
        <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-hidden">
          {COLUMNS.map((c) => (
            <Skeleton key={c.status} className="h-96" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'To pick up a work order, press space or enter. Use the arrow keys to move it to another column. Press space or enter again to drop it, or escape to cancel.',
            },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${numberOf(active.id)}.`,
              onDragOver: ({ active, over }) => (over ? `${numberOf(active.id)} is over ${columnName(over.id)}.` : `${numberOf(active.id)} is not over a column.`),
              onDragEnd: ({ active, over }) => (over ? `${numberOf(active.id)} dropped on ${columnName(over.id)}.` : `${numberOf(active.id)} dropped. No change.`),
              onDragCancel: ({ active }) => `Moving ${numberOf(active.id)} cancelled.`,
            },
          }}
        >
          <div className="-mx-4 grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6" aria-label="Work order board">
            {columns.map((c) => (
              <Column key={c.status} status={c.status} hint={c.hint} count={c.items.length} dragging={dragging}>
                {c.items.map((wo) => (
                  <DraggableCard
                    key={wo.id}
                    wo={wo}
                    lookups={lookups}
                    onOpen={() => navigate(`/supervisor/work-orders/${wo.id}`)}
                    onAssign={() => setAssigning(wo)}
                    onCancel={() => setCancelling(wo)}
                    onMove={(to) => move(wo, to)}
                  />
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging && <WorkOrderCard wo={dragging} lookups={lookups} className="rotate-1 shadow-popover" footer={<AssigneeLine wo={dragging} lookups={lookups} />} />}</DragOverlay>
        </DndContext>
      )}

      <AssignDialog workOrder={assigning} onOpenChange={(o) => !o && setAssigning(null)} />
      <CancelWorkOrderDialog workOrder={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
      <WorkOrderFormDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function Column({ status, hint, count, dragging, children }: { status: WorkOrderStatus; hint: string; count: number; dragging: WorkOrder | null; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const allowed = dragging ? !blockedReason(dragging, status) && dragging.status !== status : false
  return (
    <section
      ref={setNodeRef}
      aria-label={`${WORK_ORDER_STATUS_LABELS[status]}, ${count} work orders`}
      className={cn(
        'flex min-h-64 flex-col rounded-lg border bg-muted/50 transition-colors',
        dragging && !allowed && dragging.status !== status && 'opacity-50',
        allowed && 'border-dashed border-primary/60',
        allowed && isOver && 'bg-primary-soft/60',
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold">{WORK_ORDER_STATUS_LABELS[status]}</h2>
        <Badge>{count}</Badge>
        <span className="ml-auto truncate text-xs text-muted-foreground">{hint}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-17rem)] min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {count === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">No work orders</p>}
      </div>
    </section>
  )
}

function AssigneeLine({ wo, lookups }: { wo: WorkOrder; lookups: Lookups }) {
  return wo.assigneeId ? (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <Avatar name={lookups.userName(wo.assigneeId)} className="size-5 text-[9px]" />
      <span className="truncate">{lookups.userName(wo.assigneeId)}</span>
    </span>
  ) : (
    <span className="text-xs font-medium text-warning">Unassigned</span>
  )
}

function DraggableCard({
  wo,
  lookups,
  onOpen,
  onAssign,
  onCancel,
  onMove,
}: {
  wo: WorkOrder
  lookups: Lookups
  onOpen: () => void
  onAssign: () => void
  onCancel: () => void
  onMove: (to: WorkOrderStatus) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: wo.id })
  const targets = PLANNING_STATUSES.filter((s) => s !== wo.status && canTransition(wo.status, s))
  const canAssign = wo.status !== 'InProgress' && wo.status !== 'Completed'
  const canCancel = canTransition(wo.status, 'Cancelled')
  const stop = { onPointerDown: (e: SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: SyntheticEvent) => e.stopPropagation() }

  // The whole card drags with mouse or touch and opens on click. Keyboard and screen-reader
  // users drag with the handle and open the card from its menu, so no control is nested in another.
  return (
    <div ref={setNodeRef} {...listeners} onClick={onOpen} className={cn('cursor-grab rounded-lg active:cursor-grabbing', isDragging && 'opacity-40')}>
      <WorkOrderCard
        wo={wo}
        lookups={lookups}
        className="hover:border-primary/40"
        footer={
          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <AssigneeLine wo={wo} lookups={lookups} />
            <span className="-my-1 -mr-1 flex shrink-0 items-center">
              <button
                ref={setActivatorNodeRef}
                type="button"
                {...attributes}
                aria-label={`Move ${wo.number}: ${wo.title}`}
                onClick={(e) => e.stopPropagation()}
                className="flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${wo.number}`} onClick={(e) => e.stopPropagation()} {...stop}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onSelect={onOpen}>
                    <ExternalLink /> Open
                  </DropdownMenuItem>
                  {canAssign && (
                    <DropdownMenuItem onSelect={onAssign}>
                      <UserPlus /> {wo.assigneeId ? 'Reassign / reschedule…' : 'Assign…'}
                    </DropdownMenuItem>
                  )}
                  {targets.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Move to</DropdownMenuLabel>
                      {targets.map((t) => (
                        <DropdownMenuItem key={t} onSelect={() => onMove(t)}>
                          {WORK_ORDER_STATUS_LABELS[t]}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {canCancel && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={onCancel}>
                        <XCircle /> Cancel…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        }
      />
    </div>
  )
}
