import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '@/components/shared/ChartCard'
import { axisProps, gridProps, tooltipProps } from '@/components/shared/chartTheme'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

/** Horizontal bar ranking (top N items), used by several reports. */
export function RankingChart<T extends Record<string, unknown>>({
  title,
  description,
  data,
  labelKey,
  valueKey,
  color,
  format = (v) => String(v),
}: {
  title: string
  description?: string
  data: T[]
  labelKey: keyof T & string
  valueKey: keyof T & string
  color: string
  format?: (v: number) => string
}) {
  const height = Math.max(160, data.length * 28 + 24)
  return (
    <ChartCard title={title} description={description} empty={data.length === 0} height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" {...axisProps} tickFormatter={(v: number) => format(v)} />
        <YAxis type="category" dataKey={labelKey} width={150} {...axisProps} tick={{ ...axisProps.tick, width: 145 }} interval={0} />
        <Tooltip {...tooltipProps} formatter={(v) => [format(Number(v)), title]} />
        <Bar isAnimationActive={false} dataKey={valueKey} fill={color} radius={[0, 2, 2, 0]} barSize={16} />
      </BarChart>
    </ChartCard>
  )
}

/** Card holding a report table with its CSV export action. */
export function ReportTable({ title, onExport, count, children }: { title: string; onExport: () => void; count: number; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onExport} disabled={count === 0}>
          <Download /> Export CSV
        </Button>
      </CardHeader>
      {children}
    </Card>
  )
}
