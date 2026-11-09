import { useQuery } from '@tanstack/react-query'
import { PhotoThumb } from '@/components/shared/PhotoThumb'
import { AlertTriangle, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PriorityBadge, RequestStatusBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { Detail } from '@/components/shared/Detail'
import { FormField } from '@/components/shared/FormField'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { PRIORITIES, PROBLEM_CATEGORY_LABELS, type Priority } from '@/domain/enums'
import type { MaintenanceRequest } from '@/domain/types'
import { isOpen, toIsoDate } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, WORK_ORDER_EFFECTS, type Lookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { TechnicianPicker } from '@/features/work-orders/TechnicianPicker'
import { formatAgo, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { services } from '@/services'

export function RequestReviewDialog({ requestId, onOpenChange }: { requestId: string | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!requestId} onOpenChange={onOpenChange}>
      <DialogContent size="lg" aria-describedby={undefined}>
        {requestId && <ReviewBody key={requestId} id={requestId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewBody({ id, onDone }: { id: string; onDone: () => void }) {
  const request = useQuery({ queryKey: ['requests', 'detail', id], queryFn: () => services.requests.get(id) })
  const { lookups } = useLookups()

  if (request.isPending)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Loading request…</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ListSkeleton rows={4} />
        </DialogBody>
      </>
    )
  if (request.error)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Request</DialogTitle>
        </DialogHeader>
        <ErrorState error={request.error} onRetry={() => void request.refetch()} />
      </>
    )
  const r = request.data
  const e = lookups.equipment.get(r.equipmentId)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {PROBLEM_CATEGORY_LABELS[r.category]} <RequestStatusBadge status={r.status} />
        </DialogTitle>
        <DialogDescription>
          <span className="font-mono">{r.number}</span> · {e ? `${e.assetId} · ${e.name}` : 'Unknown equipment'} · {lookups.locationLabel(r.equipmentId)}
        </DialogDescription>
      </DialogHeader>
      {r.status === 'Submitted' ? <Decision r={r} lookups={lookups} onDone={onDone} /> : <Outcome r={r} lookups={lookups} onDone={onDone} />}
    </>
  )
}

function RequestFacts({ r, lookups }: { r: MaintenanceRequest; lookups: Lookups }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Detail label="Severity">
          <PriorityBadge priority={r.severity} />
        </Detail>
        <Detail label="Reported by">{lookups.userName(r.requestedById, 'Unknown')}</Detail>
        <Detail label="Reported">
          <span title={formatDateTime(r.createdAtUtc)}>{formatAgo(r.createdAtUtc)}</span>
        </Detail>
      </dl>
      <div>
        <p className="text-xs text-muted-foreground">What the operator saw</p>
        <p className="mt-0.5 whitespace-pre-line text-sm">{r.description}</p>
        {r.additionalInfo && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.additionalInfo}</p>}
      </div>
      {r.attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {r.attachments.map((a) => (
            <PhotoThumb key={a.id} url={a.url} alt={`Photo: ${a.fileName}`} />
          ))}
        </div>
      )}
    </div>
  )
}

function Decision({ r, lookups, onDone }: { r: MaintenanceRequest; lookups: Lookups; onDone: () => void }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [priority, setPriority] = useState<Priority>(r.severity)
  const [assigneeId, setAssigneeId] = useState('')
  const [scheduledDate, setScheduledDate] = useState(r.severity === 'Critical' || r.severity === 'High' ? toIsoDate(new Date()) : '')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [triedReject, setTriedReject] = useState(false)
  const related = useWorkOrders({ equipmentId: r.equipmentId })
  const openOnMachine = (related.data ?? []).filter(isOpen)

  const approve = useServiceMutation(() => services.requests.approve(r.id, { priority, assigneeId: assigneeId || undefined, scheduledDate: scheduledDate || undefined, note: note || undefined }), {
    invalidates: WORK_ORDER_EFFECTS,
    onSuccess: ({ workOrder }) => {
      toast.success(`Approved · ${workOrder.number} created`, {
        action: { label: 'Open', onClick: () => navigate(`/supervisor/work-orders/${workOrder.id}`) },
      })
      onDone()
    },
  })
  const reject = useServiceMutation(() => services.requests.reject(r.id, reason), {
    invalidates: WORK_ORDER_EFFECTS,
    success: `${r.number} rejected · requester notified`,
    onSuccess: onDone,
  })

  return (
    <>
      <DialogBody className="space-y-5">
        <RequestFacts r={r} lookups={lookups} />

        {openOnMachine.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning-soft/40 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="size-4" aria-hidden /> {openOnMachine.length} open work order{openOnMachine.length > 1 ? 's' : ''} on this machine
            </p>
            <ul className="mt-2 space-y-1.5">
              {openOnMachine.slice(0, 4).map((wo) => (
                <li key={wo.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/supervisor/work-orders/${wo.id}`} className="font-mono text-xs text-primary hover:underline">
                    {wo.number}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{wo.title}</span>
                  <WorkOrderStatusBadge status={wo.status} />
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => {
                      setMode('reject')
                      setReason(`Already being handled under ${wo.number}.`)
                    }}
                  >
                    Duplicate?
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div role="radiogroup" aria-label="Decision" className="grid grid-cols-2 gap-2">
          {(['approve', 'reject'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                mode === m ? (m === 'approve' ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger') : 'hover:bg-accent',
              )}
            >
              {m === 'approve' ? <Check className="size-4" /> : <X className="size-4" />}
              {m === 'approve' ? 'Approve → work order' : 'Reject'}
            </button>
          ))}
        </div>

        {mode === 'approve' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority" htmlFor="rv-priority" hint={priority !== r.severity ? `Operator reported ${r.severity.toLowerCase()}` : undefined}>
              <NativeSelect id="rv-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Planned day" htmlFor="rv-date">
              <Input id="rv-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </FormField>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">Technician</legend>
              <TechnicianPicker value={assigneeId} onChange={setAssigneeId} name="rv-tech" />
            </fieldset>
            <FormField label="Note to the requester" htmlFor="rv-note" className="sm:col-span-2">
              <Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </FormField>
          </div>
        ) : (
          <FormField label="Reason" htmlFor="rv-reason" required hint="Sent to the operator who reported it." error={triedReject && !reason.trim() ? 'Give the requester a reason' : undefined}>
            <Textarea id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={triedReject && !reason.trim()} placeholder="e.g. Normal operating noise after changeover; no fault found." />
          </FormField>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Close
        </Button>
        {mode === 'approve' ? (
          <Button variant="success" onClick={() => approve.mutate(undefined)} loading={approve.isPending}>
            <Check /> Approve{assigneeId ? ' & assign' : ''}
          </Button>
        ) : (
          <Button
            variant="danger"
            loading={reject.isPending}
            onClick={() => {
              setTriedReject(true)
              if (reason.trim()) reject.mutate(undefined)
            }}
          >
            <X /> Reject request
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function Outcome({ r, lookups, onDone }: { r: MaintenanceRequest; lookups: Lookups; onDone: () => void }) {
  return (
    <>
      <DialogBody className="space-y-5">
        <RequestFacts r={r} lookups={lookups} />
        <div className={cn('rounded-md border p-3', r.status === 'Approved' ? 'border-success/40 bg-success-soft/40' : 'bg-muted/50')}>
          <p className="text-sm font-medium">
            {r.status} by {lookups.userName(r.reviewedById, 'a supervisor')} · {formatAgo(r.reviewedAtUtc)}
          </p>
          {r.reviewNote && <p className="mt-1 text-sm text-muted-foreground">{r.reviewNote}</p>}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Close
        </Button>
        {r.workOrderId && (
          <Button asChild>
            <Link to={`/supervisor/work-orders/${r.workOrderId}`}>Open work order</Link>
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
