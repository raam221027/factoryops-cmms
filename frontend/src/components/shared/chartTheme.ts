/*
 * Recharts needs literal color values, so charts read the design tokens through CSS
 * variables. Series colors map to --chart-1..6.
 */

export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'] as const

export const SEMANTIC_CHART = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  accent: 'var(--chart-3)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--chart-5)',
} as const

export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
} as const

export const gridProps = { stroke: 'var(--border)', strokeDasharray: '3 3', vertical: false } as const

export const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    boxShadow: '0 8px 24px -6px rgb(15 23 42 / 0.18)',
  },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 2 },
  cursor: { fill: 'var(--muted)', opacity: 0.6 },
} as const

export const legendProps = { iconType: 'circle', iconSize: 8, wrapperStyle: { fontSize: 12 } } as const
