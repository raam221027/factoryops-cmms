import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/toggles'
import { FREQUENCY_UNITS, PRIORITIES } from '@/domain/enums'
import type { PmSchedule } from '@/domain/types'
import { toIsoDate } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups } from '@/features/shared/queries'
import { services, type PmScheduleInput } from '@/services'

const schema = z.object({
  name: z.string().trim().min(3, 'Name the schedule').max(120),
  equipmentId: z.string().min(1, 'Choose the equipment'),
  frequencyInterval: z.coerce.number().int('Whole numbers only').min(1, 'At least 1').max(365),
  frequencyUnit: z.enum(FREQUENCY_UNITS),
  nextDueDate: z.iso.date('Choose the next due date'),
  assigneeId: z.string(),
  estimatedHours: z.coerce.number().min(0.25, 'At least 15 minutes').max(100),
  priority: z.enum(PRIORITIES),
  active: z.boolean(),
  checklist: z.array(z.object({ label: z.string().trim().min(1, 'Describe the task').max(200) })).min(1, 'Add at least one checklist item'),
})
type FormValues = z.input<typeof schema>
type Parsed = z.output<typeof schema>

function defaults(s?: PmSchedule): FormValues {
  return s
    ? {
        name: s.name,
        equipmentId: s.equipmentId,
        frequencyInterval: s.frequencyInterval,
        frequencyUnit: s.frequencyUnit,
        nextDueDate: s.nextDueDate,
        assigneeId: s.assigneeId ?? '',
        estimatedHours: s.estimatedHours,
        priority: s.priority,
        active: s.active,
        checklist: s.checklist.map((label) => ({ label })),
      }
    : {
        name: '',
        equipmentId: '',
        frequencyInterval: 1,
        frequencyUnit: 'Month',
        nextDueDate: toIsoDate(new Date()),
        assigneeId: '',
        estimatedHours: 1,
        priority: 'Medium',
        active: true,
        checklist: [{ label: '' }],
      }
}

export function PmScheduleDialog({ open, onOpenChange, schedule }: { open: boolean; onOpenChange: (o: boolean) => void; schedule?: PmSchedule }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open && <ScheduleForm schedule={schedule} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function ScheduleForm({ schedule, onDone }: { schedule?: PmSchedule; onDone: () => void }) {
  const { lookups } = useLookups()
  const form = useForm<FormValues, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: defaults(schedule) })
  const checklist = useFieldArray({ control: form.control, name: 'checklist' })
  const { errors } = form.formState

  const save = useServiceMutation(
    (v: Parsed) => {
      const input: PmScheduleInput = { ...v, assigneeId: v.assigneeId || undefined, checklist: v.checklist.map((c) => c.label) }
      return schedule ? services.pm.update(schedule.id, input) : services.pm.create(input)
    },
    { invalidates: ['pm'], success: schedule ? 'Schedule updated' : 'Schedule created', onSuccess: onDone },
  )

  const technicians = [...lookups.users.values()].filter((u) => u.role === 'Technician' && u.active)
  const equipment = [...lookups.equipment.values()].filter((e) => e.status !== 'Retired').sort((a, b) => a.assetId.localeCompare(b.assetId))

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{schedule ? 'Edit PM schedule' : 'New PM schedule'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="pm-name" error={errors.name?.message} required className="sm:col-span-2">
          <Input id="pm-name" aria-invalid={!!errors.name} placeholder="e.g. Monthly PM — Hydraulic Press #2" {...form.register('name')} />
        </FormField>
        <FormField label="Equipment" htmlFor="pm-equipment" error={errors.equipmentId?.message} required className="sm:col-span-2">
          <NativeSelect id="pm-equipment" aria-invalid={!!errors.equipmentId} {...form.register('equipmentId')}>
            <option value="">Select…</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.assetId} · {e.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Repeat every" htmlFor="pm-interval" error={errors.frequencyInterval?.message} required>
          <div className="flex gap-2">
            <Input id="pm-interval" type="number" min={1} inputMode="numeric" className="w-20" aria-invalid={!!errors.frequencyInterval} {...form.register('frequencyInterval')} />
            <NativeSelect aria-label="Frequency unit" className="flex-1" {...form.register('frequencyUnit')}>
              {FREQUENCY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u.toLowerCase()}(s)
                </option>
              ))}
            </NativeSelect>
          </div>
        </FormField>
        <FormField label="Next due date" htmlFor="pm-due" error={errors.nextDueDate?.message} required>
          <Input id="pm-due" type="date" aria-invalid={!!errors.nextDueDate} {...form.register('nextDueDate')} />
        </FormField>
        <FormField label="Responsible technician" htmlFor="pm-assignee">
          <NativeSelect id="pm-assignee" {...form.register('assigneeId')}>
            <option value="">Unassigned (planner assigns)</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Est. hours" htmlFor="pm-hours" error={errors.estimatedHours?.message}>
            <Input id="pm-hours" type="number" step="0.25" min={0.25} inputMode="decimal" {...form.register('estimatedHours')} />
          </FormField>
          <FormField label="Priority" htmlFor="pm-priority">
            <NativeSelect id="pm-priority" {...form.register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">
            Checklist <span className="text-danger">*</span>
          </legend>
          <ol className="space-y-2">
            {checklist.fields.map((field, index) => (
              <li key={field.id} className="flex items-start gap-2">
                <span className="mt-2 w-5 text-right text-xs text-muted-foreground">{index + 1}.</span>
                <div className="flex-1">
                  <Input aria-label={`Checklist item ${index + 1}`} aria-invalid={!!errors.checklist?.[index]?.label} {...form.register(`checklist.${index}.label`)} />
                  {errors.checklist?.[index]?.label && <p className="mt-1 text-xs text-danger">{errors.checklist[index]!.label!.message}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => checklist.remove(index)} disabled={checklist.fields.length === 1} aria-label={`Remove item ${index + 1}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          {errors.checklist?.root?.message && <p className="mt-1 text-xs text-danger">{errors.checklist.root.message}</p>}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => checklist.append({ label: '' })}>
            <Plus /> Add item
          </Button>
        </fieldset>

        <label className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={form.watch('active')} onCheckedChange={(v) => form.setValue('active', v, { shouldDirty: true })} />
          <span className="text-sm">Active — paused schedules don't generate work orders</span>
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {schedule ? 'Save changes' : 'Create schedule'}
        </Button>
      </DialogFooter>
    </form>
  )
}
