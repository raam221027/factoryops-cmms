import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="12" fill="currentColor" />
      <path d="M18 46V18h22v6H25v5h13v6H25v11z" fill="#fff" />
      <circle cx="45" cy="42" r="5" fill="#f59e0b" />
    </svg>
  )
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark className={inverted ? 'text-white/10' : 'text-primary'} />
      <span className="leading-none">
        <span className={cn('block text-sm font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>FactoryOps</span>
        <span className={cn('block text-[10px] font-medium uppercase tracking-wider', inverted ? 'text-sidebar-foreground' : 'text-muted-foreground')}>CMMS</span>
      </span>
    </span>
  )
}
