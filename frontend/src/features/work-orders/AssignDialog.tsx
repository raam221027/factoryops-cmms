import { useState } from 'react'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { WorkOrder } from '@/domain/types'
import { usePlanWorkOrder } from './hooks'
import { TechnicianPicker } from './TechnicianPicker'

/** Choose the technician and planned day for a work order. */
export function AssignDialog({ workOrder, onOpenChange }: { workOrder: WorkOrder | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!workOrder} onOpenChange={onOpenChange}>
      <DialogContent size="md">{workOrder && <AssignForm key={workOrder.id} wo={workOrder} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function AssignForm({ wo, onDone }: { wo: WorkOrder; onDone: () => void }) {
  const [assigneeId, setAssigneeId] = useState(wo.assigneeId ?? '')
  const [scheduledDate, setScheduledDate] = useState(wo.scheduledDate ?? '')
  const plan = usePlanWorkOrder({
    success: (r) => (r.assigneeId ? `${r.number} planned` : `${r.number} left unassigned`),
    onSuccess: onDone,
  })
  const unchanged = assigneeId === (wo.assigneeId ?? '') && scheduledDate === (wo.scheduledDate ?? '')

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        plan.mutate({ id: wo.id, assigneeId: assigneeId || null, scheduledDate: scheduledDate || null })
      }}
    >
      <DialogHeader>
        <DialogTitle>Assign &amp; schedule</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{wo.number}</span> · {wo.title}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FormField label="Planned day" htmlFor="assign-date" hint={wo.dueDate ? `Due ${wo.dueDate}` : undefined}>
          <Input id="assign-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="sm:w-48" />
        </FormField>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Technician</legend>
          <TechnicianPicker value={assigneeId} onChange={setAssigneeId} />
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={plan.isPending} disabled={unchanged}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
