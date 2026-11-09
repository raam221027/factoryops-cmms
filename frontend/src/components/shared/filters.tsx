import { Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input, NativeSelect } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Labelled native select with an "All" option, for filter bars. */
export function FilterSelect<V extends string>({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: {
  label: string
  value: V | ''
  onChange: (v: V | '') => void
  options: readonly { value: V; label: string }[]
  allLabel?: string
  className?: string
}) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value as V | '')} className={cn('w-full sm:w-44', className)}>
      <option value="">
        {label}: {allLabel}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

/** Toolbar row above a table: search and filters wrap on small screens. */
export function FilterBar({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 border-b p-3 md:flex-row md:items-center', className)}>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
