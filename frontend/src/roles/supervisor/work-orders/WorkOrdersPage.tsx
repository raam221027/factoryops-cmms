import { Download, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { OverdueBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PRIORITIES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type Priority, type WorkOrderStatus, type WorkOrderType } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { compareByUrgency, isOpen, isOverdue, toIsoDate } from '@/domain/workOrderRules'
import { useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { WorkOrderFormDialog } from '@/features/work-orders/WorkOrderFormDialog'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatRelativeDay } from '@/lib/format'
import { cn, matchesQuery } from '@/lib/utils'

const VIEWS = [
  { value: 'open', label: 'Open' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
] as const
type View = (typeof VIEWS)[number]['value']

function inView(view: View, wo: WorkOrder, today: string): boolean {
  switch (view) {
    case 'open':
      return isOpen(wo)
    case 'unassigned':
      return isOpen(wo) && !wo.assigneeId
    case 'overdue':
      return isOverdue(wo)
    case 'today':
      return isOpen(wo) && (wo.scheduledDate ?? wo.dueDate) === today
    case 'closed':
      return !isOpen(wo)
    default:
      return true
  }
}

export function WorkOrdersPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const workOrders = useWorkOrders()
  const { lookups, ready, error } = useLookups()
  const [creating, setCreating] = useState(false)

  const view = (VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'open') as View
  const search = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as WorkOrderStatus | ''
  const type = (params.get('type') ?? '') as WorkOrderType | ''
  const priority = (params.get('priority') ?? '') as Priority | ''
  const assignee = params.get('assignee') ?? ''

  function setParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const today = toIsoDate(new Date())
  const rows = useMemo(
    () =>
      (workOrders.data ?? [])
        .filter((wo) => {
          if (!inView(view, wo, today)) return false
          if (status && wo.status !== status) return false
          if (type && wo.type !== type) return false
          if (priority && wo.priority !== priority) return false
          if (assignee === 'none' ? !!wo.assigneeId : assignee && wo.assigneeId !== assignee) return false
          const e = lookups.equipment.get(wo.equipmentId)
          return matchesQuery(search, wo.number, wo.title, e?.name, e?.assetId, lookups.userName(wo.assigneeId, ''))
        })
        .sort(compareByUrgency),
    [workOrders.data, view, today, status, type, priority, assignee, search, lookups],
  )

  const columns = useMemo<ColumnDef<WorkOrder, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      {
        accessorKey: 'title',
        header: 'Work order',
        cell: ({ row }) => {
          const e = lookups.equipment.get(row.original.equipmentId)
          return <CellStack primary={row.original.title} secondary={e ? `${e.assetId} · ${e.name}` : undefined} />
        },
      },
      { accessorKey: 'type', header: 'Type' },
      {
        accessorKey: 'priority',
        header: 'Priority',
        sortingFn: (a, b) => PRIORITIES.indexOf(a.original.priority) - PRIORITIES.indexOf(b.original.priority),
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} /> },
      {
        id: 'assignee',
        header: 'Technician',
        accessorFn: (w) => lookups.userName(w.assigneeId, ''),
        cell: ({ row }) => (row.original.assigneeId ? lookups.userName(row.original.assigneeId) : <span className="text-warning">Unassigned</span>),
      },
      { accessorKey: 'scheduledDate', header: 'Planned', cell: ({ row }) => (row.original.scheduledDate ? formatRelativeDay(row.original.scheduledDate) : '—') },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ row }) => (isOverdue(row.original) ? <OverdueBadge /> : row.original.dueDate ? formatRelativeDay(row.original.dueDate) : '—'),
      },
    ],
    [lookups],
  )

  function exportCsv() {
    downloadCsv('work-orders', rows, [
      { header: 'Number', value: (w) => w.number },
      { header: 'Title', value: (w) => w.title },
      { header: 'Type', value: (w) => w.type },
      { header: 'Priority', value: (w) => w.priority },
      { header: 'Status', value: (w) => WORK_ORDER_STATUS_LABELS[w.status] },
      { header: 'Asset ID', value: (w) => lookups.equipment.get(w.equipmentId)?.assetId },
      { header: 'Equipment', value: (w) => lookups.equipmentName(w.equipmentId) },
      { header: 'Technician', value: (w) => lookups.userName(w.assigneeId, '') },
      { header: 'Created', value: (w) => formatDate(w.createdAtUtc) },
      { header: 'Planned', value: (w) => w.scheduledDate },
      { header: 'Due', value: (w) => w.dueDate },
      { header: 'Completed', value: (w) => w.completedAtUtc?.slice(0, 10) },
      { header: 'Labor hours', value: (w) => w.laborHours || '' },
    ])
  }

  const technicians = [...lookups.users.values()].filter((u) => u.role === 'Technician')

  return (
    <>
      <PageHeader
        title="Work orders"
        description="Plan, assign and follow up on all maintenance work."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New work order
          </Button>
        }
      />
      <Card>
        <Tabs value={view} onValueChange={(v) => setParam('view', v === 'open' ? '' : v)}>
          <TabsList className="px-3">
            {VIEWS.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Every tab has a panel; only the active one holds the list */}
          {VIEWS.map((v) => v.value).filter((t) => t !== view).map((t) => (
            <TabsContent key={t} value={t} />
          ))}
          <TabsContent value={view} className="pt-0">
            <FilterBar
              actions={
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
                  <Download /> Export
                </Button>
              }
            >
              <SearchInput value={search} onChange={(v) => setParam('q', v)} placeholder="Search number, title, equipment…" className="sm:w-72" />
              <FilterSelect label="Status" value={status} onChange={(v) => setParam('status', v)} options={WORK_ORDER_STATUSES.map((s) => ({ value: s, label: WORK_ORDER_STATUS_LABELS[s] }))} />
              <FilterSelect label="Type" value={type} onChange={(v) => setParam('type', v)} options={WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))} className="sm:w-36" />
              <FilterSelect label="Priority" value={priority} onChange={(v) => setParam('priority', v)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} className="sm:w-36" />
              <FilterSelect
                label="Technician"
                value={assignee}
                onChange={(v) => setParam('assignee', v)}
                options={[{ value: 'none', label: 'Unassigned' }, ...technicians.map((t) => ({ value: t.id, label: t.name }))]}
              />
            </FilterBar>
            <DataTable
              data={ready ? rows : undefined}
              columns={columns}
              getRowId={(w) => w.id}
              loading={workOrders.isPending}
              error={workOrders.error ?? error}
              onRetry={() => void workOrders.refetch()}
              onRowClick={(w) => navigate(`/supervisor/work-orders/${w.id}`)}
              rowClassName={(w) => cn(isOverdue(w) && 'bg-danger-soft/30')}
              emptyTitle="No work orders match"
              emptyDescription="Try another view or clear the filters."
              pageSize={20}
            />
          </TabsContent>
        </Tabs>
      </Card>
      <WorkOrderFormDialog open={creating} onOpenChange={setCreating} onCreated={(wo) => navigate(`/supervisor/work-orders/${wo.id}`)} />
    </>
  )
}
