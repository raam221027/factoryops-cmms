import { FlaskConical } from 'lucide-react'
import { useAuth } from '@/features/auth/context'
import { cn } from '@/lib/utils'

/** Visible reminder that demo sign-in and sample data are active. Hidden when demo auth is off. */
export function DemoBadge({ className }: { className?: string }) {
  const { demo } = useAuth()
  if (!demo) return null
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-sm border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning', className)}
      title="Development demo: sample data stored in this browser, demo sign-in enabled"
    >
      <FlaskConical className="size-3" aria-hidden />
      {/* Icon only on the narrowest phones, where the header has no room to spare */}
      <span className="max-[359px]:sr-only">Demo</span>
    </span>
  )
}
