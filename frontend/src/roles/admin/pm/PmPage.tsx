import { addMonths } from 'date-fns'
import { CalendarCheck, CalendarClock, CalendarX, ClipboardList, MoreHorizontal, Pause, Pencil, Play, Plus, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { KpiCard } from '@/components/shared/KpiCard'
import { MonthCalendar, type CalendarEvent } from '@/components/shared/MonthCalendar'
import { PageHeader } from '@/components/shared/PageHeader'
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { pmCompliance } from '@/domain/metrics'
import { dueState, frequencyLabel, projectOccurrences, type DueState } from '@/domain/pm'
import { pmComplianceTrend } from '@/domain/reports'
import type { PmSchedule, WorkOrder } from '@/domain/types'
import { isOpen, isOverdue } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, usePmSchedules, WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { lastDays } from '@/lib/dateRange'
import { formatDate, formatPercent, formatRelativeDay } from '@/lib/format'
import { matchesQuery } from '@/lib/utils'
import { services } from '@/services'
import { PmComplianceChart } from '../dashboard/DashboardCharts'
import { PmScheduleDialog } from './PmScheduleDialog'

const DUE_BADGE: Record<DueState, { tone: 'danger' | 'warning' | 'neutral' | 'primary'; label: string }> = {
  overdue: { tone: 'danger', label: 'Overdue' },
  'due-soon': { tone: 'warning', label: 'Due soon' },
  scheduled: { tone: 'primary', label: 'Scheduled' },
  paused: { tone: 'neutral', label: 'Paused' },
}

export function PmPage() {
  const schedules = usePmSchedules()
  const pmWorkOrders = useWorkOrders({ type: 'Preventive' })
  const { lookups, ready, error } = useLookups()
  const [search, setSearch] = useState('')
  const [state, setState] = useState<DueState | ''>('')
  const [dialog, setDialog] = useState<{ open: boolean; schedule?: PmSchedule }>({ open: false })

  const generate = useServiceMutation((s: PmSchedule) => services.pm.generateWorkOrder(s.id), {
    invalidates: WORK_ORDER_EFFECTS,
    success: (wo) => `${wo.number} created for ${formatDate(wo.dueDate)}`,
  })
  const toggleActive = useServiceMutation((s: PmSchedule) => services.pm.update(s.id, { ...s, active: !s.active }), {
    invalidates: ['pm'],
    success: (s) => (s.active ? 'Schedule resumed' : 'Schedule paused'),
  })

  const rows = useMemo(
    () =>
      (schedules.data ?? []).filter((s) => {
        const e = lookups.equipment.get(s.equipmentId)
        return (!state || dueState(s) === state) && matchesQuery(search, s.name, e?.name, e?.assetId)
      }),
    [schedules.data, lookups, state, search],
  )

  const columns = useMemo<ColumnDef<PmSchedule, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Schedule',
        cell: ({ row }) => {
          const e = lookups.equipment.get(row.original.equipmentId)
          return <CellStack primary={row.original.name} secondary={e ? `${e.assetId} · ${lookups.locationLabel(e.id)}` : undefined} />
        },
      },
      { id: 'frequency', header: 'Frequency', accessorFn: (s) => frequencyLabel(s), enableSorting: false },
      {
        accessorKey: 'nextDueDate',
        header: 'Next due',
        cell: ({ row }) => {
          const st = DUE_BADGE[dueState(row.original)]
          return (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">{formatRelativeDay(row.original.nextDueDate)}</span>
              {st.label !== 'Scheduled' && <Badge tone={st.tone}>{st.label}</Badge>}
            </div>
          )
        },
      },
      { accessorKey: 'lastCompletedDate', header: 'Last done', cell: ({ row }) => formatDate(row.original.lastCompletedDate) },
      { id: 'assignee', header: 'Technician', accessorFn: (s) => lookups.userName(s.assigneeId) },
      { accessorKey: 'priority', header: 'Priority', cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()} className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog({ open: true, schedule: row.original })}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!row.original.active || generate.isPending} onSelect={() => generate.mutate(row.original)}>
                  <Wand2 /> Generate work order
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleActive.mutate(row.original)}>
                  {row.original.active ? (
                    <>
                      <Pause /> Pause schedule
                    </>
                  ) : (
                    <>
                      <Play /> Resume schedule
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [lookups, generate, toggleActive],
  )

  const events = useMemo<CalendarEvent[]>(() => {
    if (!schedules.data || !pmWorkOrders.data) return []
    const until = addMonths(new Date(), 6)
    // Dates already covered by a work order are shown as that work order, not as a projection.
    const covered = new Set(pmWorkOrders.data.map((wo) => `${wo.pmScheduleId}|${wo.dueDate}`))
    const projected = schedules.data.flatMap((s) =>
      projectOccurrences(s, until)
        .filter((date) => !covered.has(`${s.id}|${date}`))
        .map((date) => ({ id: `${s.id}-${date}`, date, label: lookups.equipmentName(s.equipmentId), tone: 'default' as const, onClick: () => setDialog({ open: true, schedule: s }) })),
    )
    const actual = pmWorkOrders.data
      .filter((wo) => wo.dueDate && wo.status !== 'Cancelled')
      .map((wo) => ({
        id: wo.id,
        date: wo.dueDate!,
        label: `${wo.number} · ${lookups.equipmentName(wo.equipmentId)}`,
        tone: wo.status === 'Completed' ? ('success' as const) : isOverdue(wo) ? ('danger' as const) : ('warning' as const),
      }))
    return [...actual, ...projected]
  }, [schedules.data, pmWorkOrders.data, lookups])

  const loading = schedules.isPending || !ready

  return (
    <>
      <PageHeader
        title="Preventive maintenance"
        description="Recurring maintenance schedules, their calendar and compliance."
        actions={
          <Button onClick={() => setDialog({ open: true })} disabled={!ready}>
            <Plus /> New schedule
          </Button>
        }
      />
      <Tabs defaultValue="schedules">
        <TabsList>
          <TabsTrigger value="schedules">
            <ClipboardList /> Schedules
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarClock /> Calendar
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <CalendarCheck /> Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
          <Card>
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search schedule or equipment…" className="sm:w-72" />
              <FilterSelect
                label="Due"
                value={state}
                onChange={setState}
                options={(Object.keys(DUE_BADGE) as DueState[]).map((s) => ({ value: s, label: DUE_BADGE[s].label }))}
              />
            </FilterBar>
            <DataTable
              data={loading ? undefined : rows}
              columns={columns}
              getRowId={(s) => s.id}
              error={schedules.error ?? error}
              onRetry={() => void schedules.refetch()}
              onRowClick={(s) => setDialog({ open: true, schedule: s })}
              initialSorting={[{ id: 'nextDueDate', desc: false }]}
              rowClassName={(s) => (s.active ? undefined : 'text-muted-foreground')}
              emptyTitle="No schedules match"
            />
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardContent>
              <MonthCalendar
                events={events}
                toolbar={
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone="primary">Planned</Badge>
                    <Badge tone="warning">Work order open</Badge>
                    <Badge tone="danger">Overdue</Badge>
                    <Badge tone="success">Completed</Badge>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceTab schedules={schedules.data ?? []} workOrders={pmWorkOrders.data ?? []} />
        </TabsContent>
      </Tabs>

      <PmScheduleDialog open={dialog.open} schedule={dialog.schedule} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}

function ComplianceTab({ schedules, workOrders }: { schedules: PmSchedule[]; workOrders: WorkOrder[] }) {
  const { lookups } = useLookups()
  const range = lastDays(90)
  const overdue = workOrders.filter((wo) => isOverdue(wo)).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  const columns: ColumnDef<WorkOrder, unknown>[] = [
    { accessorKey: 'number', header: 'Work order', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
    { id: 'equipment', header: 'Equipment', accessorFn: (wo) => lookups.equipmentName(wo.equipmentId) },
    { accessorKey: 'dueDate', header: 'Was due', cell: ({ row }) => <span className="text-danger">{formatDate(row.original.dueDate)}</span> },
    { id: 'assignee', header: 'Technician', accessorFn: (wo) => lookups.userName(wo.assigneeId) },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} /> },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Compliance (90 d)" value={formatPercent(pmCompliance(workOrders, range))} icon={CalendarCheck} tone="success" />
        <KpiCard label="Overdue PM work" value={overdue.length} icon={CalendarX} tone="danger" />
        <KpiCard label="Open PM work orders" value={workOrders.filter(isOpen).length} icon={ClipboardList} tone="info" />
        <KpiCard label="Active schedules" value={schedules.filter((s) => s.active).length} hint={`${schedules.filter((s) => !s.active).length} paused`} icon={CalendarClock} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PmComplianceChart rows={pmComplianceTrend(workOrders, lastDays(180))} />
        <Card>
          <CardHeader>
            <CardTitle>Overdue preventive work</CardTitle>
          </CardHeader>
          <DataTable data={overdue} columns={columns} getRowId={(w) => w.id} emptyTitle="No overdue preventive work" pageSize={6} />
        </Card>
      </div>
    </div>
  )
}
