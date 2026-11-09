import { AlertTriangle, CalendarCheck, ClipboardList, Cog, Gauge, Timer, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, KpiSkeletonRow } from '@/components/shared/states'
import { Skeleton } from '@/components/ui/misc'
import { completionRate, downtimeHours, equipmentStatusCounts, mttrHours, pmCompliance, type DateRange } from '@/domain/metrics'
import { costTrend, downtimeTrend, pmComplianceTrend, statusDistribution, workOrderTrend } from '@/domain/reports'
import { useSessionUser } from '@/features/auth/context'
import { useDowntimes, useEquipmentList, useParts, usePmSchedules, useSettings } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { lastDays } from '@/lib/dateRange'
import { formatHours, formatPercent } from '@/lib/format'
import { CostTrendChart, DowntimeTrendChart, MaintenanceMixChart, PmComplianceChart, StatusDistributionChart, WorkOrderTrendChart } from './DashboardCharts'
import { NeedsAttention } from './NeedsAttention'

const PRESETS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
] as const

export function AdminDashboard() {
  const user = useSessionUser()
  const [range, setRange] = useState<DateRange>(() => lastDays(90))
  const equipment = useEquipmentList()
  const workOrders = useWorkOrders()
  const downtimes = useDowntimes()
  const parts = useParts()
  const schedules = usePmSchedules()
  const settings = useSettings()
  const queries = [equipment, workOrders, downtimes, parts, schedules, settings]
  const failed = queries.find((q) => q.error)
  const ready = queries.every((q) => q.isSuccess)

  const data = useMemo(() => {
    if (!equipment.data || !workOrders.data || !downtimes.data || !parts.data || !settings.data) return null
    const wos = workOrders.data
    const inRange = wos.filter((wo) => wo.status !== 'Cancelled' && new Date(wo.createdAtUtc) >= range.from && new Date(wo.createdAtUtc) <= range.to)
    const trend = workOrderTrend(wos, range)
    return {
      eq: equipmentStatusCounts(equipment.data),
      created: inRange.length,
      corrective: inRange.filter((wo) => wo.type === 'Corrective').length,
      compliance: pmCompliance(wos, range),
      downtime: downtimeHours(downtimes.data, range),
      mttr: mttrHours(wos, range),
      completion: completionRate(wos, range),
      trend,
      downtimeTrend: downtimeTrend(downtimes.data, range),
      cost: costTrend(wos, parts.data, settings.data.laborRatePerHour, range),
      compliances: pmComplianceTrend(wos, range),
      status: statusDistribution(wos),
    }
  }, [equipment.data, workOrders.data, downtimes.data, parts.data, settings.data, range])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name.split(' ')[0]}. Plant-wide maintenance performance.`}
        actions={<DateRangePicker value={range} onChange={setRange} presets={PRESETS} showCustom={false} />}
      />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />
      ) : !ready || !data ? (
        <div className="space-y-4">
          <KpiSkeletonRow count={4} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <KpiCard label="Total equipment" value={data.eq.total} icon={Cog} hint="Active assets" to="/admin/equipment" />
            <KpiCard label="Operational" value={data.eq.operational} icon={Gauge} tone="success" hint={`${formatPercent(data.eq.total ? data.eq.operational / data.eq.total : null)} available`} />
            <KpiCard label="Under maintenance" value={data.eq.underMaintenance + data.eq.outOfService} icon={Wrench} tone="warning" hint={`${data.eq.outOfService} out of service`} />
            <KpiCard label="Work orders" value={data.created} icon={ClipboardList} tone="info" hint={`${data.corrective} corrective in period`} />
            <KpiCard label="PM compliance" value={formatPercent(data.compliance)} icon={CalendarCheck} tone={data.compliance != null && data.compliance < 0.85 ? 'warning' : 'success'} hint="Completed on time" to="/admin/pm" />
            <KpiCard label="Downtime" value={formatHours(data.downtime)} icon={AlertTriangle} tone="danger" hint="Breakdown hours in period" />
            <KpiCard label="MTTR" value={formatHours(data.mttr)} icon={Timer} hint="Mean time to repair" to="/admin/reports" />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <WorkOrderTrendChart rows={data.trend.rows} unit={data.trend.unit} completionRate={data.completion} />
            <StatusDistributionChart rows={data.status} />
            <MaintenanceMixChart rows={data.trend.rows} unit={data.trend.unit} />
            <DowntimeTrendChart rows={data.downtimeTrend.rows} unit={data.downtimeTrend.unit} />
            <CostTrendChart rows={data.cost.rows} unit={data.cost.unit} />
            <PmComplianceChart rows={data.compliances} />
            <NeedsAttention equipment={equipment.data!} parts={parts.data!} schedules={schedules.data!} className="lg:col-span-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            Figures are calculated from work orders, downtime and parts records. Labor cost uses the rate in{' '}
            <Link to="/admin/settings" className="underline hover:text-foreground">
              settings
            </Link>
            .
          </p>
        </div>
      )}
    </>
  )
}
