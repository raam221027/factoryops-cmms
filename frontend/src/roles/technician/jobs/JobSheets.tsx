import { differenceInMinutes, parseISO } from 'date-fns'
import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/toggles'
import type { WorkOrder } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { useParts, WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { formatElapsed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { services } from '@/services'

/** Quantity input with large +/- buttons for gloved hands. */
function Stepper({ id, value, onChange, max }: { id: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Decrease quantity">
        <Minus />
      </Button>
      <Input id={id} type="number" inputMode="numeric" min={1} max={max} value={value} onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="h-12 w-20 text-center text-lg" />
      <Button type="button" variant="outline" size="icon" className="size-12" onClick={() => onChange(value + 1)} disabled={max !== undefined && value >= max} aria-label="Increase quantity">
        <Plus />
      </Button>
    </div>
  )
}

export function LogPartSheet({ wo, partId, onOpenChange }: { wo: WorkOrder; partId: string | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={partId !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm">{partId !== null && <LogPartForm key={partId} wo={wo} initialPartId={partId} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function LogPartForm({ wo, initialPartId, onDone }: { wo: WorkOrder; initialPartId: string; onDone: () => void }) {
  const parts = useParts()
  const [partId, setPartId] = useState(initialPartId)
  const remaining = (pid: string) => Math.max(1, (wo.partsRequired.find((l) => l.partId === pid)?.quantity ?? 1) - (wo.partsUsed.find((l) => l.partId === pid)?.quantity ?? 0))
  const [quantity, setQuantity] = useState(initialPartId ? remaining(initialPartId) : 1)
  const log = useServiceMutation((v: { partId: string; quantity: number }) => services.workOrders.recordPartUsage(wo.id, v.partId, v.quantity), {
    invalidates: WORK_ORDER_EFFECTS,
    success: (_r, v) => `Logged ${v.quantity} × ${parts.data?.find((p) => p.id === v.partId)?.name ?? 'part'}`,
    onSuccess: onDone,
  })
  const planned = new Set(wo.partsRequired.map((l) => l.partId))
  const sorted = [...(parts.data ?? [])].sort((a, b) => Number(planned.has(b.id)) - Number(planned.has(a.id)) || a.name.localeCompare(b.name))
  const part = parts.data?.find((p) => p.id === partId)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (partId) log.mutate({ partId, quantity })
      }}
    >
      <DialogHeader>
        <DialogTitle>Log part used</DialogTitle>
        <DialogDescription>Stock is reduced as soon as you save.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FormField label="Part" htmlFor="lp-part">
          <NativeSelect
            id="lp-part"
            value={partId}
            onChange={(e) => {
              setPartId(e.target.value)
              setQuantity(remaining(e.target.value))
            }}
            className="h-12"
          >
            <option value="">Select a part…</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id} disabled={p.quantityOnHand === 0}>
                {planned.has(p.id) ? '★ ' : ''}
                {p.name} · {p.quantityOnHand} {p.unit}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {part && (
          <p className="text-xs text-muted-foreground">
            {part.partNumber} · {part.storageLocation} · {part.quantityOnHand} {part.unit} in stock
          </p>
        )}
        <FormField label="Quantity" htmlFor="lp-qty">
          <Stepper id="lp-qty" value={quantity} onChange={setQuantity} max={part?.quantityOnHand} />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={!partId} loading={log.isPending}>
          Log {quantity} {part?.unit ?? ''}
        </Button>
      </DialogFooter>
    </form>
  )
}

const PAUSE_REASONS = ['Waiting for parts', 'Waiting for production to release the machine', 'Needs another trade / specialist', 'End of shift', 'Called to an emergency']

export function PauseSheet({ wo, open, onOpenChange }: { wo: WorkOrder; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [choice, setChoice] = useState('')
  const [other, setOther] = useState('')
  const reason = choice === 'Other' ? other.trim() : choice
  const pause = useServiceMutation((r: string) => services.workOrders.pause(wo.id, r), {
    invalidates: WORK_ORDER_EFFECTS,
    success: 'Job paused · your supervisor can see why',
    onSuccess: () => {
      setChoice('')
      setOther('')
      onOpenChange(false)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Pause job</DialogTitle>
          <DialogDescription>Why are you stopping?</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div role="radiogroup" aria-label="Reason" className="grid gap-2">
            {[...PAUSE_REASONS, 'Other'].map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={choice === r}
                onClick={() => setChoice(r)}
                className={cn('min-h-12 rounded-md border px-3 py-2 text-left text-sm', choice === r ? 'border-primary bg-primary-soft font-medium' : 'hover:bg-accent')}
              >
                {r}
              </button>
            ))}
          </div>
          {choice === 'Other' && <Textarea aria-label="Describe the reason" className="mt-2" value={other} onChange={(e) => setOther(e.target.value)} placeholder="What is blocking the work?" autoFocus />}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Keep working
          </Button>
          <Button variant="warning" size="lg" disabled={!reason} loading={pause.isPending} onClick={() => pause.mutate(reason)}>
            Pause job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Suggested labor from the running time, when it is plausible for one stint of work. */
function suggestedHours(wo: WorkOrder): string {
  if (!wo.startedAtUtc) return ''
  const minutes = differenceInMinutes(new Date(), parseISO(wo.startedAtUtc))
  if (minutes > 12 * 60) return ''
  return String(Math.max(0.25, Math.round(minutes / 15) / 4))
}

export function CompleteSheet({ wo, open, onOpenChange, onCompleted }: { wo: WorkOrder; open: boolean; onOpenChange: (open: boolean) => void; onCompleted: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">{open && <CompleteForm wo={wo} onCancel={() => onOpenChange(false)} onCompleted={onCompleted} />}</DialogContent>
    </Dialog>
  )
}

function CompleteForm({ wo, onCancel, onCompleted }: { wo: WorkOrder; onCancel: () => void; onCompleted: () => void }) {
  const corrective = wo.type === 'Corrective'
  const [laborHours, setLaborHours] = useState(suggestedHours(wo))
  const [rootCause, setRootCause] = useState('')
  const [actionsTaken, setActionsTaken] = useState('')
  const [note, setNote] = useState('')
  const [skipConfirmed, setSkipConfirmed] = useState(false)
  const [tried, setTried] = useState(false)
  const openItems = wo.checklist.filter((c) => !c.done)
  const hasAfterPhoto = wo.attachments.some((a) => a.kind === 'After')
  const hours = Number(laborHours)

  const errors = {
    laborHours: !(hours > 0 && hours <= 24) ? 'Enter the hours you worked (up to 24)' : undefined,
    rootCause: corrective && rootCause.trim().length < 3 ? 'What caused the problem?' : undefined,
    actionsTaken: actionsTaken.trim().length < 5 ? 'Describe what you did' : undefined,
    checklist: openItems.length > 0 && !skipConfirmed ? 'Confirm the unticked steps' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  const complete = useServiceMutation(
    () => services.workOrders.complete(wo.id, { laborHours: hours, rootCause: rootCause.trim() || undefined, actionsTaken: actionsTaken.trim(), note: note.trim() || undefined }),
    { invalidates: WORK_ORDER_EFFECTS, success: `${wo.number} completed`, onSuccess: onCompleted },
  )

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (valid) complete.mutate(undefined)
      }}
    >
      <DialogHeader>
        <DialogTitle>Complete job</DialogTitle>
        <DialogDescription>
          {wo.number} · {wo.startedAtUtc ? `started ${formatElapsed(wo.startedAtUtc)} ago` : 'not started'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {openItems.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning-soft/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="size-4" aria-hidden /> {openItems.length} checklist step{openItems.length > 1 ? 's' : ''} not ticked
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              {openItems.slice(0, 4).map((c) => (
                <li key={c.id}>{c.label}</li>
              ))}
            </ul>
            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm">
              <Checkbox checked={skipConfirmed} onCheckedChange={(v) => setSkipConfirmed(!!v)} aria-invalid={tried && !!errors.checklist} />
              These steps were not needed or not possible
            </label>
            {tried && errors.checklist && <p className="text-xs text-danger">{errors.checklist}</p>}
          </div>
        )}
        {!hasAfterPhoto && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Tip: an "After" photo helps the next technician. You can add one before completing.</p>}
        <FormField label="Hours worked" htmlFor="cj-hours" required error={tried ? errors.laborHours : undefined} hint={!laborHours && wo.startedAtUtc ? 'Started more than 12 h ago: enter your actual working time' : undefined}>
          <Input id="cj-hours" type="number" inputMode="decimal" step="0.25" min={0.25} max={24} value={laborHours} onChange={(e) => setLaborHours(e.target.value)} className="h-12 w-32 text-lg" aria-invalid={tried && !!errors.laborHours} />
        </FormField>
        {corrective && (
          <FormField label="Root cause" htmlFor="cj-cause" required error={tried ? errors.rootCause : undefined}>
            <Textarea id="cj-cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="e.g. Worn bearing on drive end" aria-invalid={tried && !!errors.rootCause} className="min-h-16" />
          </FormField>
        )}
        <FormField label="What did you do?" htmlFor="cj-actions" required error={tried ? errors.actionsTaken : undefined}>
          <Textarea id="cj-actions" value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} placeholder="e.g. Replaced bearing, realigned coupling, test-ran 15 min" aria-invalid={tried && !!errors.actionsTaken} />
        </FormField>
        <FormField label="Note for the supervisor" htmlFor="cj-note">
          <Input id="cj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. follow-up needed" className="h-11" />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" variant="success" size="lg" loading={complete.isPending}>
          Complete job
        </Button>
      </DialogFooter>
    </form>
  )
}
