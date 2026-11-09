import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { SEMANTIC_CHART } from '@/components/shared/chartTheme'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WORK_ORDER_STATUS_LABELS } from '@/domain/enums'
import { completionRate, type DateRange } from '@/domain/metrics'
import {
  costTrend,
  downtimeByEquipment,
  equipmentReliability,
  mttrByCategory,
  pmComplianceTrend,
  technicianPerformance,
  workOrderTrend,
} from '@/domain/reports'
import type { WorkOrder } from '@/domain/types'
import { useCategories, useDowntimes, useEquipmentList, useLookups, useParts, useSettings, useUsersList } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { downloadCsv } from '@/lib/csv'
import { lastDays } from '@/lib/dateRange'
import { formatCurrency, formatDate, formatHours, formatPercent } from '@/lib/format'
import { CostTrendChart, PmComplianceChart, WorkOrderTrendChart } from '../dashboard/DashboardCharts'
import { RankingChart, ReportTable } from './ReportBlocks'

const REPORTS = [
  { id: 'work-orders', label: 'Work orders' },
  { id: 'downtime', label: 'Downtime' },
  { id: 'mttr', label: 'MTTR' },
  { id: 'cost', label: 'Maintenance cost' },
  { id: 'pm', label: 'PM compliance' },
  { id: 'technicians', label: 'Technician performance' },
  { id: 'reliability', label: 'Equipment reliability' },
] as const

const round1 = (n: number | null) => (n == null ? '' : Math.round(n * 10) / 10)

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('report') ?? 'work-orders'
  const [range, setRange] = useState<DateRange>(() => lastDays(90))
  const workOrders = useWorkOrders()
  const equipment = useEquipmentList()
  const downtimes = useDowntimes()
  const parts = useParts()
  const settings = useSettings()
  const users = useUsersList()
  const categories = useCategories()
  const { lookups } = useLookups()
  const queries = [workOrders, equipment, downtimes, parts, settings, users, categories]
  const failed = queries.find((q) => q.error)

  const suffix = `${format(range.from, 'yyyyMMdd')}-${format(range.to, 'yyyyMMdd')}`
  const periodLabel = `${format(range.from, 'MMM d, yyyy')} – ${format(range.to, 'MMM d, yyyy')}`

  const r = useMemo(() => {
    if (!workOrders.data || !equipment.data || !downtimes.data || !parts.data || !settings.data || !users.data || !categories.data) return null
    const inRange = workOrders.data.filter((wo) => {
      const d = new Date(wo.createdAtUtc)
      return d >= range.from && d <= range.to
    })
    return {
      inRange,
      trend: workOrderTrend(workOrders.data, range),
      completion: completionRate(workOrders.data, range),
      downtime: downtimeByEquipment(downtimes.data, equipment.data, range),
      mttr: mttrByCategory(workOrders.data, equipment.data, categories.data, range),
      cost: costTrend(workOrders.data, parts.data, settings.data.laborRatePerHour, range),
      pm: pmComplianceTrend(workOrders.data, range),
      techs: technicianPerformance(workOrders.data, users.data, range),
      reliability: equipmentReliability(workOrders.data, downtimes.data, equipment.data, range),
      laborRate: settings.data.laborRatePerHour,
    }
  }, [workOrders.data, equipment.data, downtimes.data, parts.data, settings.data, users.data, categories.data, range])

  const woColumns = useMemo<ColumnDef<WorkOrder, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      { id: 'equipment', header: 'Equipment', accessorFn: (wo) => lookups.equipmentName(wo.equipmentId) },
      { accessorKey: 'type', header: 'Type' },
      { accessorKey: 'priority', header: 'Priority', cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} /> },
      { id: 'tech', header: 'Technician', accessorFn: (wo) => lookups.userName(wo.assigneeId) },
      { accessorKey: 'createdAtUtc', header: 'Created', cell: ({ row }) => formatDate(row.original.createdAtUtc) },
      { accessorKey: 'laborHours', header: 'Labor', cell: ({ row }) => formatHours(row.original.laborHours || null) },
    ],
    [lookups],
  )

  return (
    <>
      <PageHeader title="Reports & analytics" description={`Reporting period: ${periodLabel}`} actions={<DateRangePicker value={range} onChange={setRange} />} />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />
      ) : !r ? (
        <ListSkeleton rows={6} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParams({ report: v }, { replace: true })}>
          <TabsList>
            {REPORTS.map((rep) => (
              <TabsTrigger key={rep.id} value={rep.id}>
                {rep.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="work-orders" className="space-y-4">
            <WorkOrderTrendChart rows={r.trend.rows} unit={r.trend.unit} completionRate={r.completion} />
            <ReportTable
              title={`Work orders created (${r.inRange.length})`}
              count={r.inRange.length}
              onExport={() =>
                downloadCsv(`work-orders-${suffix}`, r.inRange, [
                  { header: 'Number', value: (wo) => wo.number },
                  { header: 'Title', value: (wo) => wo.title },
                  { header: 'Type', value: (wo) => wo.type },
                  { header: 'Priority', value: (wo) => wo.priority },
                  { header: 'Status', value: (wo) => WORK_ORDER_STATUS_LABELS[wo.status] },
                  { header: 'Asset ID', value: (wo) => lookups.equipment.get(wo.equipmentId)?.assetId },
                  { header: 'Equipment', value: (wo) => lookups.equipmentName(wo.equipmentId) },
                  { header: 'Technician', value: (wo) => lookups.userName(wo.assigneeId, '') },
                  { header: 'Created', value: (wo) => wo.createdAtUtc },
                  { header: 'Due', value: (wo) => wo.dueDate },
                  { header: 'Completed', value: (wo) => wo.completedAtUtc },
                  { header: 'Labor hours', value: (wo) => wo.laborHours },
                  { header: 'Root cause', value: (wo) => wo.rootCause },
                ])
              }
            >
              <DataTable data={r.inRange} columns={woColumns} getRowId={(w) => w.id} initialSorting={[{ id: 'createdAtUtc', desc: true }]} emptyTitle="No work orders in this period" />
            </ReportTable>
          </TabsContent>

          <TabsContent value="downtime" className="space-y-4">
            <RankingChart
              title="Downtime by equipment"
              description="Top 10 assets by breakdown hours"
              data={r.downtime.slice(0, 10).map((d) => ({ label: d.equipment.name, hours: d.hours }))}
              labelKey="label"
              valueKey="hours"
              color={SEMANTIC_CHART.danger}
              format={(v) => `${v} h`}
            />
            <ReportTable
              title="Downtime by equipment"
              count={r.downtime.length}
              onExport={() =>
                downloadCsv(`downtime-${suffix}`, r.downtime, [
                  { header: 'Asset ID', value: (d) => d.equipment.assetId },
                  { header: 'Equipment', value: (d) => d.equipment.name },
                  { header: 'Events', value: (d) => d.events },
                  { header: 'Downtime hours', value: (d) => d.hours },
                ])
              }
            >
              <DataTable
                data={r.downtime}
                getRowId={(d) => d.equipment.id}
                columns={[
                  { id: 'eq', header: 'Equipment', accessorFn: (d) => d.equipment.name, cell: ({ row }) => <CellStack primary={row.original.equipment.name} secondary={row.original.equipment.assetId} /> },
                  { accessorKey: 'events', header: 'Events' },
                  { accessorKey: 'hours', header: 'Downtime', cell: ({ row }) => formatHours(row.original.hours) },
                ]}
                initialSorting={[{ id: 'hours', desc: true }]}
                emptyTitle="No downtime recorded in this period"
              />
            </ReportTable>
          </TabsContent>

          <TabsContent value="mttr" className="space-y-4">
            <RankingChart
              title="Mean time to repair by category"
              description="Average hours from start to completion of corrective work"
              data={r.mttr.map((m) => ({ label: m.category.name, mttr: round1(m.mttr) }))}
              labelKey="label"
              valueKey="mttr"
              color={SEMANTIC_CHART.primary}
              format={(v) => `${v} h`}
            />
            <ReportTable
              title="MTTR by equipment category"
              count={r.mttr.length}
              onExport={() =>
                downloadCsv(`mttr-${suffix}`, r.mttr, [
                  { header: 'Category', value: (m) => m.category.name },
                  { header: 'Repairs', value: (m) => m.repairs },
                  { header: 'MTTR hours', value: (m) => round1(m.mttr) },
                ])
              }
            >
              <DataTable
                data={r.mttr}
                getRowId={(m) => m.category.id}
                columns={[
                  { id: 'cat', header: 'Category', accessorFn: (m) => m.category.name },
                  { accessorKey: 'repairs', header: 'Repairs completed' },
                  { accessorKey: 'mttr', header: 'MTTR', cell: ({ row }) => formatHours(row.original.mttr) },
                ]}
                initialSorting={[{ id: 'mttr', desc: true }]}
                emptyTitle="No completed repairs in this period"
              />
            </ReportTable>
          </TabsContent>

          <TabsContent value="cost" className="space-y-4">
            <CostTrendChart rows={r.cost.rows} unit={r.cost.unit} />
            <ReportTable
              title={`Maintenance cost · labor at ${formatCurrency(r.laborRate)}/h`}
              count={r.cost.rows.length}
              onExport={() =>
                downloadCsv(`maintenance-cost-${suffix}`, r.cost.rows, [
                  { header: 'Period', value: (c) => c.period },
                  { header: 'Labor', value: (c) => c.labor },
                  { header: 'Parts', value: (c) => c.parts },
                  { header: 'Total', value: (c) => c.total },
                ])
              }
            >
              <DataTable
                data={r.cost.rows}
                getRowId={(c) => c.period}
                columns={[
                  { accessorKey: 'period', header: 'Period', enableSorting: false },
                  { accessorKey: 'labor', header: 'Labor', cell: ({ row }) => formatCurrency(row.original.labor) },
                  { accessorKey: 'parts', header: 'Parts', cell: ({ row }) => formatCurrency(row.original.parts) },
                  { accessorKey: 'total', header: 'Total', cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.total)}</span> },
                ]}
                pageSize={30}
              />
            </ReportTable>
          </TabsContent>

          <TabsContent value="pm" className="space-y-4">
            <PmComplianceChart rows={r.pm} />
            <ReportTable
              title="PM compliance by month"
              count={r.pm.length}
              onExport={() =>
                downloadCsv(`pm-compliance-${suffix}`, r.pm, [
                  { header: 'Month', value: (p) => p.period },
                  { header: 'Compliance %', value: (p) => p.compliance },
                ])
              }
            >
              <DataTable
                data={r.pm}
                getRowId={(p) => p.period}
                columns={[
                  { accessorKey: 'period', header: 'Month', enableSorting: false },
                  { accessorKey: 'compliance', header: 'Completed on time', cell: ({ row }) => (row.original.compliance == null ? 'No PM due' : `${row.original.compliance}%`) },
                ]}
              />
            </ReportTable>
          </TabsContent>

          <TabsContent value="technicians" className="space-y-4">
            <RankingChart
              title="Work orders completed"
              data={r.techs.map((t) => ({ label: t.user.name, completed: t.completed }))}
              labelKey="label"
              valueKey="completed"
              color={SEMANTIC_CHART.secondary}
            />
            <ReportTable
              title="Technician performance"
              count={r.techs.length}
              onExport={() =>
                downloadCsv(`technician-performance-${suffix}`, r.techs, [
                  { header: 'Technician', value: (t) => t.user.name },
                  { header: 'Completed', value: (t) => t.completed },
                  { header: 'Labor hours', value: (t) => t.laborHours },
                  { header: 'On time %', value: (t) => (t.onTimeRate == null ? '' : Math.round(t.onTimeRate * 100)) },
                  { header: 'MTTR hours', value: (t) => round1(t.mttr) },
                  { header: 'Open now', value: (t) => t.open },
                ])
              }
            >
              <DataTable
                data={r.techs}
                getRowId={(t) => t.user.id}
                columns={[
                  { id: 'name', header: 'Technician', accessorFn: (t) => t.user.name, cell: ({ row }) => <CellStack primary={row.original.user.name} secondary={row.original.user.active ? row.original.user.shift : 'Inactive'} /> },
                  { accessorKey: 'completed', header: 'Completed' },
                  { accessorKey: 'laborHours', header: 'Labor hours' },
                  { accessorKey: 'onTimeRate', header: 'On time', cell: ({ row }) => formatPercent(row.original.onTimeRate) },
                  { accessorKey: 'mttr', header: 'Avg repair', cell: ({ row }) => formatHours(row.original.mttr) },
                  { accessorKey: 'open', header: 'Open now' },
                ]}
                initialSorting={[{ id: 'completed', desc: true }]}
              />
            </ReportTable>
          </TabsContent>

          <TabsContent value="reliability" className="space-y-4">
            <ReportTable
              title="Equipment reliability"
              count={r.reliability.length}
              onExport={() =>
                downloadCsv(`equipment-reliability-${suffix}`, r.reliability, [
                  { header: 'Asset ID', value: (x) => x.equipment.assetId },
                  { header: 'Equipment', value: (x) => x.equipment.name },
                  { header: 'Failures', value: (x) => x.failures },
                  { header: 'Downtime hours', value: (x) => x.downtimeHours },
                  { header: 'MTTR hours', value: (x) => round1(x.mttr) },
                  { header: 'MTBF hours', value: (x) => x.mtbfHours },
                  { header: 'Availability %', value: (x) => (x.availability == null ? '' : Math.round(x.availability * 1000) / 10) },
                ])
              }
            >
              <DataTable
                data={r.reliability}
                getRowId={(x) => x.equipment.id}
                columns={[
                  { id: 'eq', header: 'Equipment', accessorFn: (x) => x.equipment.name, cell: ({ row }) => <CellStack primary={row.original.equipment.name} secondary={row.original.equipment.assetId} /> },
                  { accessorKey: 'failures', header: 'Failures' },
                  { accessorKey: 'downtimeHours', header: 'Downtime', cell: ({ row }) => formatHours(row.original.downtimeHours) },
                  { accessorKey: 'mttr', header: 'MTTR', cell: ({ row }) => formatHours(row.original.mttr) },
                  { accessorKey: 'mtbfHours', header: 'MTBF', cell: ({ row }) => (row.original.mtbfHours == null ? 'No failures' : formatHours(row.original.mtbfHours)) },
                  {
                    accessorKey: 'availability',
                    header: 'Availability',
                    cell: ({ row }) => <span className={row.original.availability != null && row.original.availability < 0.97 ? 'font-medium text-danger' : undefined}>{formatPercent(row.original.availability)}</span>,
                  },
                ]}
                initialSorting={[{ id: 'failures', desc: true }]}
              />
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                MTBF = (hours in period − downtime) ÷ failures. Availability counts breakdown downtime only, not planned stops.
              </p>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}
