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
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, addWeeks, eachDayOfInterval, format, startOfWeek, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import type { User, WorkOrder } from '@/domain/types'
import { compareByUrgency, isOpen, isOverdue, toIsoDate } from '@/domain/workOrderRules'
import type { Lookups } from '@/features/shared/queries'
import { usePlanWorkOrder } from '@/features/work-orders/hooks'
import { cn } from '@/lib/utils'

const NONE = 'none'
const TRAY = 'tray'
/** Jobs per technician per day above which the cell is flagged as overbooked. */
const DAY_CAPACITY = 3

const PRIORITY_BAR = { Critical: 'border-l-danger', High: 'border-l-warning', Medium: 'border-l-info', Low: 'border-l-border' } as const

const cellId = (techId: string, day: string) => `cell|${techId}|${day}`

/** Drop target → plan. The tray keeps the technician and only clears the day. */
function parseTarget(id: string): { assigneeId?: string | null; scheduledDate: string | null } {
  if (id === TRAY) return { scheduledDate: null }
  const [, tech, day] = id.split('|')
  return { assigneeId: tech === NONE ? null : tech, scheduledDate: day }
}

/** Drag ids are scoped by where the chip is shown, since a job can appear in the tray and the grid. */
const workOrderIdOf = (data: unknown) => (data as { workOrderId?: string } | undefined)?.workOrderId

export function WeekPlanner({ workOrders, technicians, lookups }: { workOrders: WorkOrder[]; technicians: User[]; lookups: Lookups }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [dragging, setDragging] = useState<WorkOrder | null>(null)
  const plan = usePlanWorkOrder({
    success: (wo) => (wo.scheduledDate ? `${wo.number} planned for ${format(new Date(`${wo.scheduledDate}T00:00`), 'EEE d MMM')}` : `${wo.number} unscheduled`),
  })

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }).map(toIsoDate), [weekStart])
  const today = toIsoDate(new Date())

  const { byCell, unscheduled, missed } = useMemo(() => {
    const first = days[0]
    const last = days[6]
    const map = new Map<string, WorkOrder[]>()
    for (const wo of workOrders) {
      if (!wo.scheduledDate || wo.scheduledDate < first || wo.scheduledDate > last || wo.status === 'Cancelled') continue
      const key = cellId(wo.assigneeId ?? NONE, wo.scheduledDate)
      ;(map.get(key) ?? map.set(key, []).get(key)!).push(wo)
    }
    for (const list of map.values()) list.sort(compareByUrgency)
    const open = workOrders.filter((wo) => isOpen(wo) && wo.status !== 'InProgress')
    return {
      byCell: map,
      unscheduled: open.filter((wo) => !wo.scheduledDate).sort(compareByUrgency),
      missed: open.filter((wo) => wo.scheduledDate && wo.scheduledDate < today).sort(compareByUrgency),
    }
  }, [workOrders, days, today])

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const wo = workOrders.find((w) => w.id === workOrderIdOf(e.active.data.current))
    if (!wo || !e.over) return
    const target = parseTarget(String(e.over.id))
    const assigneeId = target.assigneeId === undefined ? (wo.assigneeId ?? null) : target.assigneeId
    if (assigneeId === (wo.assigneeId ?? null) && target.scheduledDate === (wo.scheduledDate ?? null)) return
    if (wo.status === 'InProgress' && assigneeId !== (wo.assigneeId ?? null)) {
      return void toast.info('Work in progress stays with its technician. You can still move the day.')
    }
    const key = ['workOrders', 'list', {}]
    const snapshot = queryClient.getQueryData<WorkOrder[]>(key)
    queryClient.setQueryData<WorkOrder[]>(key, (list) =>
      list?.map((w) =>
        w.id === wo.id
          ? { ...w, assigneeId: assigneeId ?? undefined, scheduledDate: target.scheduledDate ?? undefined, status: assigneeId && (w.status === 'New' || w.status === 'Pending') ? 'Assigned' : !assigneeId && w.status === 'Assigned' ? 'Pending' : w.status }
          : w,
      ),
    )
    plan.mutate({ id: wo.id, assigneeId, scheduledDate: target.scheduledDate }, { onError: () => queryClient.setQueryData(key, snapshot) })
  }

  const rows: { id: string; user?: User }[] = [{ id: NONE }, ...technicians.map((t) => ({ id: t.id, user: t }))]
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
  const open = (wo: WorkOrder) => navigate(`/supervisor/work-orders/${wo.id}`)
  // Screen reader wording: work order numbers and "technician, day" instead of internal ids
  const numberOf = (data: unknown) => workOrders.find((w) => w.id === workOrderIdOf(data))?.number ?? 'Work order'
  const slotName = (id: string | number) => {
    if (id === TRAY) return 'the to-plan list'
    const { assigneeId, scheduledDate } = parseTarget(String(id))
    const who = assigneeId ? (technicians.find((t) => t.id === assigneeId)?.name ?? 'a technician') : 'Unassigned'
    return `${who}, ${format(new Date(`${scheduledDate}T00:00`), 'EEEE d MMMM')}`
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(workOrders.find((w) => w.id === workOrderIdOf(e.active.data.current)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'To plan a work order, press space or enter to pick it up, use the arrow keys to move it onto a technician and day, then press space or enter to drop it.',
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${numberOf(active.data.current)}.`,
          onDragOver: ({ active, over }) => (over ? `${numberOf(active.data.current)} is over ${slotName(over.id)}.` : `${numberOf(active.data.current)} is not over a day.`),
          onDragEnd: ({ active, over }) => (over ? `${numberOf(active.data.current)} planned for ${slotName(over.id)}.` : `${numberOf(active.data.current)} dropped. No change.`),
          onDragCancel: ({ active }) => `Planning ${numberOf(active.data.current)} cancelled.`,
        },
      }}
    >
      <div className="flex flex-col gap-4 xl:flex-row">
        <Tray unscheduled={unscheduled} missed={missed} lookups={lookups} onOpen={open} />

        <Card className="min-w-0 flex-1">
          <CardHeader className="flex-wrap items-center">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => setWeekStart((w) => subWeeks(w, 1))} aria-label="Previous week">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))} aria-label="Next week">
                <ChevronRight />
              </Button>
              <CardTitle className="ml-2" aria-live="polite">
                {weekLabel}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              This week
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[170px_repeat(7,minmax(110px,1fr))]" role="table" aria-label={`Technician schedule, ${weekLabel}`}>
              <div role="row" className="contents">
                <div className="sticky left-0 z-10 border-b bg-surface" role="columnheader">
                  <span className="sr-only">Technician</span>
                </div>
                {days.map((d) => (
                  <div key={d} role="columnheader" className={cn('border-b border-l px-2 py-2 text-xs font-medium', d === today ? 'bg-primary-soft text-primary' : 'text-muted-foreground')}>
                    {format(new Date(`${d}T00:00`), 'EEE d')}
                  </div>
                ))}
              </div>
              {rows.map((row) => {
                const weekCount = days.reduce((s, d) => s + (byCell.get(cellId(row.id, d))?.length ?? 0), 0)
                return (
                  <div key={row.id} role="row" className="contents">
                    <div role="rowheader" className="sticky left-0 z-10 flex items-center gap-2 border-b bg-surface px-3 py-2">
                      {row.user ? <Avatar name={row.user.name} className="size-7" /> : null}
                      <div className="min-w-0">
                        <p className={cn('truncate text-sm font-medium', !row.user && 'text-warning')}>{row.user?.name ?? 'Unassigned'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {weekCount} this week{row.user?.shift ? ` · ${row.user.shift}` : ''}
                        </p>
                      </div>
                    </div>
                    {days.map((d) => (
                      <Cell key={d} id={cellId(row.id, d)} past={d < today} items={byCell.get(cellId(row.id, d)) ?? []} label={`${row.user?.name ?? 'Unassigned'}, ${d}`} unassignedRow={!row.user}>
                        {(byCell.get(cellId(row.id, d)) ?? []).map((wo) => (
                          <Chip key={wo.id} scope="grid" wo={wo} lookups={lookups} onOpen={() => open(wo)} />
                        ))}
                      </Cell>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Drag a job onto a technician and day to plan it. Cells with more than {DAY_CAPACITY} jobs are flagged. Long-press to drag on touch screens.
          </p>
        </Card>
      </div>
      <DragOverlay dropAnimation={null}>{dragging && <ChipBody wo={dragging} lookups={lookups} className="w-48 shadow-popover" />}</DragOverlay>
    </DndContext>
  )
}

function Tray({ unscheduled, missed, lookups, onOpen }: { unscheduled: WorkOrder[]; missed: WorkOrder[]; lookups: Lookups; onOpen: (wo: WorkOrder) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY })
  return (
    <div ref={setNodeRef} className={cn('flex max-h-[70dvh] flex-col rounded-lg border bg-surface shadow-card xl:w-72 xl:shrink-0', isOver && 'ring-2 ring-primary/50')}>
      <CardHeader>
        <CardTitle>To plan</CardTitle>
        <Badge tone={unscheduled.length + missed.length ? 'info' : 'success'}>{unscheduled.length + missed.length}</Badge>
      </CardHeader>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <TrayGroup title="Planned day passed" hint="Still open; re-plan these" items={missed} lookups={lookups} onOpen={onOpen} tone="danger" />
        <TrayGroup title="Not scheduled" hint="Drop here to take a job off the schedule" items={unscheduled} lookups={lookups} onOpen={onOpen} />
      </div>
    </div>
  )
}

function TrayGroup({ title, hint, items, lookups, onOpen, tone }: { title: string; hint: string; items: WorkOrder[]; lookups: Lookups; onOpen: (wo: WorkOrder) => void; tone?: 'danger' }) {
  return (
    <section aria-label={title}>
      <h3 className={cn('text-xs font-semibold uppercase tracking-wide', tone === 'danger' && items.length ? 'text-danger' : 'text-muted-foreground')}>
        {title} ({items.length})
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
          {items.map((wo) => (
            <li key={wo.id}>
              <Chip scope="tray" wo={wo} lookups={lookups} onOpen={() => onOpen(wo)} detailed />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Cell({ id, past, items, label, unassignedRow, children }: { id: string; past: boolean; items: WorkOrder[]; label: string; unassignedRow: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const over = !unassignedRow && items.filter(isOpen).length > DAY_CAPACITY
  return (
    <div
      ref={setNodeRef}
      role="cell"
      aria-label={`${label}: ${items.length} jobs`}
      className={cn('min-h-20 space-y-1 border-b border-l p-1', past && 'bg-muted/40', over && 'bg-warning-soft/50', isOver && 'bg-primary-soft ring-2 ring-inset ring-primary/40')}
    >
      {children}
    </div>
  )
}

function ChipBody({ wo, lookups, className, detailed }: { wo: WorkOrder; lookups: Lookups; className?: string; detailed?: boolean }) {
  const e = lookups.equipment.get(wo.equipmentId)
  const done = !isOpen(wo)
  return (
    <div
      className={cn(
        'rounded-sm border border-l-4 bg-surface px-1.5 py-1 text-left text-[11px] leading-tight shadow-card',
        PRIORITY_BAR[wo.priority],
        isOverdue(wo) && 'bg-danger-soft/50',
        done && 'opacity-60',
        className,
      )}
    >
      <p className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
        <span className="shrink-0 font-mono text-muted-foreground">{wo.number}</span>
        {wo.status === 'InProgress' && <span className="text-info">● live</span>}
        {wo.status === 'OnHold' && <span className="text-warning">on hold</span>}
        {done && <span className="text-success">✓</span>}
      </p>
      <p className={cn('truncate font-medium', done && 'line-through')}>{e?.name ?? wo.title}</p>
      {detailed && (
        <p className="truncate text-muted-foreground">
          {wo.priority} · {wo.assigneeId ? lookups.userName(wo.assigneeId) : 'Unassigned'}
          {wo.scheduledDate ? ` · ${format(new Date(`${wo.scheduledDate}T00:00`), 'MMM d')}` : ''}
        </p>
      )}
    </div>
  )
}

function Chip({ scope, wo, lookups, onOpen, detailed }: { scope: 'tray' | 'grid'; wo: WorkOrder; lookups: Lookups; onOpen: () => void; detailed?: boolean }) {
  const movable = isOpen(wo)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${scope}:${wo.id}`, data: { workOrderId: wo.id }, disabled: !movable })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      aria-label={`${wo.number}: ${wo.title}`}
      title={`${wo.number} · ${wo.title}`}
      className={cn('rounded-sm focus-visible:outline-2 focus-visible:outline-ring', movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', isDragging && 'opacity-30')}
    >
      <ChipBody wo={wo} lookups={lookups} detailed={detailed} />
    </div>
  )
}
