import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as React from 'react'
import { cn, initials } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden {...props} />
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <AvatarPrimitive.Root className={cn('inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary', className)}>
      <AvatarPrimitive.Fallback delayMs={0}>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cn('shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className)} />
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground', className)} {...props} />
}
