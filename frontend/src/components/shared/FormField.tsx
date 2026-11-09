import type { ReactNode } from 'react'
import { Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Label, control, hint and validation message. Pass the control's id as `htmlFor`. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
