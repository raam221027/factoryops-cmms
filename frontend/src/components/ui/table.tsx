import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/60 [&_tr]:border-b', className)} {...props} />
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b transition-colors data-[selected=true]:bg-primary-soft/50', className)} {...props} />
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-9 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props} />
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}
