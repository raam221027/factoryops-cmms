import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '@/components/shared/ChartCard'
import { axisProps, gridProps, legendProps, SEMANTIC_CHART, tooltipProps } from '@/components/shared/chartTheme'
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from '@/domain/enums'
import { formatCurrency, formatPercent } from '@/lib/format'

type Trend = { period: string; created: number; completed: number; corrective: number; preventive: number }[]

export function WorkOrderTrendChart({ rows, unit, completionRate }: { rows: Trend; unit: string; completionRate: number | null }) {
  return (
    <ChartCard title="Work order trend" description={`Created vs completed per ${unit} · completion rate ${formatPercent(completionRate)}`} empty={rows.every((r) => !r.created && !r.completed)} className="lg:col-span-2">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Bar isAnimationActive={false} dataKey="created" name="Created" fill={SEMANTIC_CHART.secondary} radius={[2, 2, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="completed" name="Completed" fill={SEMANTIC_CHART.primary} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartCard>
  )
}

export function MaintenanceMixChart({ rows, unit }: { rows: Trend; unit: string }) {
  return (
    <ChartCard title="Preventive vs corrective" description={`Work orders created per ${unit}`} empty={rows.every((r) => !r.created)}>
      <BarChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Bar isAnimationActive={false} dataKey="preventive" name="Preventive" stackId="mix" fill={SEMANTIC_CHART.success} />
        <Bar isAnimationActive={false} dataKey="corrective" name="Corrective" stackId="mix" fill={SEMANTIC_CHART.accent} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartCard>
  )
}

export function DowntimeTrendChart({ rows, unit }: { rows: { period: string; hours: number }[]; unit: string }) {
  return (
    <ChartCard title="Equipment downtime" description={`Hours of breakdown downtime per ${unit}`} empty={rows.every((r) => !r.hours)}>
      <AreaChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipProps} formatter={(v) => [`${v} h`, 'Downtime']} />
        <Area isAnimationActive={false} type="monotone" dataKey="hours" stroke={SEMANTIC_CHART.danger} fill={SEMANTIC_CHART.danger} fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ChartCard>
  )
}

const STATUS_COLOR: Partial<Record<WorkOrderStatus, string>> = {
  New: SEMANTIC_CHART.secondary,
  Pending: SEMANTIC_CHART.accent,
  Assigned: SEMANTIC_CHART.primary,
  InProgress: SEMANTIC_CHART.secondary,
  OnHold: SEMANTIC_CHART.warning,
}

export function StatusDistributionChart({ rows }: { rows: { status: WorkOrderStatus; count: number }[] }) {
  const data = rows.map((r) => ({ ...r, label: WORK_ORDER_STATUS_LABELS[r.status] }))
  return (
    <ChartCard title="Open work orders by status" description="Current backlog" empty={rows.every((r) => !r.count)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="label" width={78} {...axisProps} />
        <Tooltip {...tooltipProps} formatter={(v) => [v, 'Work orders']} />
        <Bar isAnimationActive={false} dataKey="count" radius={[0, 2, 2, 0]} barSize={18}>
          {data.map((r) => (
            <Cell key={r.status} fill={STATUS_COLOR[r.status] ?? SEMANTIC_CHART.neutral} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  )
}

export function CostTrendChart({ rows, unit }: { rows: { period: string; parts: number; labor: number }[]; unit: string }) {
  return (
    <ChartCard title="Maintenance cost" description={`Parts and labor per ${unit}`} empty={rows.every((r) => !r.parts && !r.labor)}>
      <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} />
        <Tooltip {...tooltipProps} formatter={(v, name) => [formatCurrency(Number(v)), name]} />
        <Legend {...legendProps} />
        <Bar isAnimationActive={false} dataKey="labor" name="Labor" stackId="cost" fill={SEMANTIC_CHART.primary} />
        <Bar isAnimationActive={false} dataKey="parts" name="Parts" stackId="cost" fill={SEMANTIC_CHART.accent} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartCard>
  )
}

export function PmComplianceChart({ rows }: { rows: { period: string; compliance: number | null }[] }) {
  return (
    <ChartCard title="PM compliance" description="Preventive work completed by its due date, per month" empty={rows.every((r) => r.compliance == null)}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip {...tooltipProps} formatter={(v) => [`${v}%`, 'Compliance']} />
        <Line isAnimationActive={false} type="monotone" dataKey="compliance" stroke={SEMANTIC_CHART.success} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ChartCard>
  )
}
