import { useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { FormField } from '@/components/shared/FormField'
import { Textarea } from '@/components/ui/input'
import type { WorkOrder } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { services } from '@/services'

/** Cancelling needs a reason so the history explains why the work was dropped. */
export function CancelWorkOrderDialog({ workOrder, onOpenChange }: { workOrder: WorkOrder | null; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const cancel = useServiceMutation((v: { id: string; reason: string }) => services.workOrders.changeStatus(v.id, 'Cancelled', v.reason), {
    invalidates: WORK_ORDER_EFFECTS,
    success: (wo) => `${wo.number} cancelled`,
  })
  const missing = reason.trim().length < 3

  return (
    <ConfirmDialog
      open={!!workOrder}
      onOpenChange={(o) => {
        if (!o) {
          setReason('')
          setTouched(false)
        }
        onOpenChange(o)
      }}
      title={`Cancel ${workOrder?.number ?? 'work order'}?`}
      description="The technician is told the job is off. Cancelled work orders cannot be reopened."
      confirmLabel="Cancel work order"
      destructive
      onConfirm={() => {
        setTouched(true)
        if (missing || !workOrder) throw new Error('reason required')
        return cancel.mutateAsync({ id: workOrder.id, reason: reason.trim() })
      }}
    >
      <FormField label="Reason" htmlFor="cancel-reason" required error={touched && missing ? 'Give a short reason' : undefined}>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of WO-1043, machine replaced…" aria-invalid={touched && missing} />
      </FormField>
    </ConfirmDialog>
  )
}
