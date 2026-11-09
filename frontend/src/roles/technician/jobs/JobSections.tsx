import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, Package, Plus, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import type { AttachmentKind } from '@/domain/enums'
import type { Attachment, WorkOrder } from '@/domain/types'
import { isOpen } from '@/domain/workOrderRules'
import { useSessionUser } from '@/features/auth/context'
import { useServiceMutation } from '@/features/shared/mutations'
import { useInvalidate, useParts } from '@/features/shared/queries'
import { cn } from '@/lib/utils'
import { errorMessage, services } from '@/services'
import { LogPartSheet } from './JobSheets'

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border bg-surface shadow-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Ticks are applied instantly and rolled back if the server refuses. */
export function ChecklistSection({ wo }: { wo: WorkOrder }) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidate()
  const key = ['workOrders', 'detail', wo.id]
  const editable = wo.status === 'InProgress'
  const toggle = useMutation({
    mutationFn: (v: { itemId: string; done: boolean }) => services.workOrders.setChecklistItem(wo.id, v.itemId, v.done),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<WorkOrder>(key)
      queryClient.setQueryData<WorkOrder>(key, (w) => w && { ...w, checklist: w.checklist.map((c) => (c.id === v.itemId ? { ...c, done: v.done } : c)) })
      return { previous }
    },
    onError: (error, _v, ctx) => {
      queryClient.setQueryData(key, ctx?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => invalidate('workOrders'),
  })
  const done = wo.checklist.filter((c) => c.done).length

  return (
    <Section title="Checklist" aside={<span className="text-xs text-muted-foreground">{done} of {wo.checklist.length}</span>}>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={wo.checklist.length} aria-valuenow={done} aria-label="Checklist progress">
        <div className="h-full bg-success transition-[width]" style={{ width: `${(done / Math.max(1, wo.checklist.length)) * 100}%` }} />
      </div>
      {!editable && isOpen(wo) && <p className="mb-2 text-xs text-muted-foreground">Start the job to tick off steps.</p>}
      <ul className="-mx-2 space-y-1">
        {wo.checklist.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={c.done}
              disabled={!editable}
              onClick={() => toggle.mutate({ itemId: c.id, done: !c.done })}
              className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/60 disabled:hover:bg-transparent"
            >
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md border-2', c.done ? 'border-success bg-success text-white' : 'border-input bg-surface')}>
                {c.done && <Check className="size-4" strokeWidth={3} />}
              </span>
              <span className={cn('text-sm', c.done && 'text-muted-foreground line-through')}>
                <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                {c.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const PHOTO_KINDS: { kind: AttachmentKind; label: string }[] = [
  { kind: 'Before', label: 'Before' },
  { kind: 'After', label: 'After' },
]

export function PhotosSection({ wo }: { wo: WorkOrder }) {
  const user = useSessionUser()
  const input = useRef<HTMLInputElement>(null)
  const [pendingKind, setPendingKind] = useState<AttachmentKind>('Before')
  const [uploading, setUploading] = useState<AttachmentKind | null>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  const canAdd = isOpen(wo) && wo.status !== 'New' && wo.status !== 'Pending'
  const add = useServiceMutation((v: { kind: AttachmentKind; fileName: string; url: string }) => services.workOrders.addAttachment(wo.id, v), {
    invalidates: ['workOrders'],
    success: (_r, v) => `${v.kind} photo added`,
  })
  const remove = useServiceMutation((attachmentId: string) => services.workOrders.removeAttachment(wo.id, attachmentId), {
    invalidates: ['workOrders'],
    success: 'Photo removed',
  })

  async function onFile(file: File | undefined) {
    if (!file) return
    setUploading(pendingKind)
    try {
      let uploaded
      try {
        uploaded = await services.attachments.upload(file)
      } catch (e) {
        toast.error(errorMessage(e))
        return
      }
      await add.mutateAsync({ kind: pendingKind, ...uploaded }).catch(() => {
        // the mutation already reported the error
      })
    } finally {
      setUploading(null)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Section title="Photos" aside={<span className="text-xs text-muted-foreground">{wo.attachments.length}</span>}>
      {wo.attachments.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {wo.attachments.map((a) => (
            <li key={a.id} className="relative">
              <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                <img src={a.url} alt={`${a.kind} photo`} className="aspect-square w-full object-cover" />
              </a>
              <span className="absolute bottom-1 left-1 rounded-sm bg-foreground/70 px-1 text-[10px] font-medium text-white">{a.kind}</span>
              {isOpen(wo) && a.uploadedById === user.id && (
                <button
                  type="button"
                  onClick={() => setRemoving(a)}
                  className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full border bg-surface shadow-card"
                  aria-label={`Remove ${a.kind.toLowerCase()} photo`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <div className="grid grid-cols-2 gap-2">
          {PHOTO_KINDS.map(({ kind, label }) => (
            <Button
              key={kind}
              variant="outline"
              size="lg"
              loading={uploading === kind}
              disabled={!!uploading}
              onClick={() => {
                setPendingKind(kind)
                input.current?.click()
              }}
            >
              <Camera /> {label}
            </Button>
          ))}
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      ) : (
        wo.attachments.length === 0 && <p className="text-sm text-muted-foreground">No photos.</p>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this photo?"
        confirmLabel="Remove"
        destructive
        onConfirm={() => removing && remove.mutateAsync(removing.id)}
      />
    </Section>
  )
}

export function PartsSection({ wo }: { wo: WorkOrder }) {
  const parts = useParts()
  const [logging, setLogging] = useState<string | null>(null)
  const byId = new Map((parts.data ?? []).map((p) => [p.id, p]))
  const used = (partId: string) => wo.partsUsed.find((l) => l.partId === partId)?.quantity ?? 0
  const ids = [...new Set([...wo.partsRequired, ...wo.partsUsed].map((l) => l.partId))]
  const canLog = wo.status === 'InProgress'

  return (
    <Section
      title="Parts"
      aside={
        canLog && (
          <Button variant="outline" size="sm" onClick={() => setLogging('')}>
            <Plus /> Log part
          </Button>
        )
      }
    >
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canLog ? 'No parts planned. Log anything you take from stores.' : 'No parts planned or used.'}</p>
      ) : (
        <ul className="divide-y">
          {ids.map((pid) => {
            const p = byId.get(pid)
            const planned = wo.partsRequired.find((l) => l.partId === pid)?.quantity ?? 0
            const u = used(pid)
            return (
              <li key={pid} className="flex items-center gap-3 py-2">
                <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p?.name ?? 'Unknown part'}</p>
                  <p className="text-xs text-muted-foreground">
                    {p?.partNumber}
                    {p && ` · ${p.storageLocation}`}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className={cn('font-medium tabular-nums', planned && u >= planned && 'text-success')}>
                    {u} used{planned ? ` / ${planned}` : ''}
                  </p>
                  {p && <p className="text-muted-foreground">{p.quantityOnHand} in stock</p>}
                </div>
                {canLog && planned > u && (
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => setLogging(pid)} aria-label={`Log ${p?.name ?? 'part'} used`}>
                    Use
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <LogPartSheet wo={wo} partId={logging} onOpenChange={(o) => !o && setLogging(null)} />
    </Section>
  )
}
