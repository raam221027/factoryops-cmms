import type { ReactElement, ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EmptyState } from './states'

/** Card wrapper giving every chart a title, fixed height and an empty state. */
export function ChartCard({
  title,
  description,
  actions,
  height = 240,
  empty,
  className,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  height?: number
  /** Show an empty state instead of the chart */
  empty?: boolean
  className?: string
  /** A single Recharts chart element */
  children: ReactElement
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="pt-3">
        {empty ? (
          <EmptyState title="No data for this period" className="py-6" />
        ) : (
          <div style={{ height }} role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
