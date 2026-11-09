import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { PRIORITIES, WORK_ORDER_TYPES } from '@/domain/enums'
import type { WorkOrder } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, useParts, useSettings, WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { services } from '@/services'
import { useTechnicianWorkloads } from './hooks'

const schema = z
  .object({
    type: z.enum(WORK_ORDER_TYPES),
    equipmentId: z.string().min(1, 'Choose the equipment'),
    title: z.string().trim().min(3, 'Give the work a short title').max(140),
    description: z.string().trim().min(5, 'Describe the work').max(2000),
    priority: z.enum(PRIORITIES),
    assigneeId: z.string(),
    scheduledDate: z.union([z.literal(''), z.iso.date('Not a valid date')]),
    dueDate: z.union([z.literal(''), z.iso.date('Not a valid date')]),
    instructions: z.string().trim().max(2000),
    checklist: z.array(z.object({ label: z.string().trim().min(1, 'Describe the step').max(200) })),
    parts: z.array(z.object({ partId: z.string().min(1, 'Choose a part'), quantity: z.coerce.number().int('Whole numbers').min(1, 'At least 1') })),
  })
  .refine((v) => !v.scheduledDate || !v.dueDate || v.scheduledDate <= v.dueDate, { path: ['scheduledDate'], message: 'Planned after the due date' })
  .refine((v) => new Set(v.parts.map((p) => p.partId)).size === v.parts.length, { path: ['parts'], message: 'Each part only once' })
type FormValues = z.input<typeof schema>
type Parsed = z.output<typeof schema>

function defaults(wo?: WorkOrder, preset?: Partial<FormValues>): FormValues {
  return {
    type: wo?.type ?? 'Corrective',
    equipmentId: wo?.equipmentId ?? '',
    title: wo?.title ?? '',
    description: wo?.description ?? '',
    priority: wo?.priority ?? 'Medium',
    assigneeId: wo?.assigneeId ?? '',
    scheduledDate: wo?.scheduledDate ?? '',
    dueDate: wo?.dueDate ?? '',
    instructions: wo?.instructions ?? '',
    checklist: wo ? wo.checklist.map((c) => ({ label: c.label })) : [],
    parts: wo ? wo.partsRequired.map((p) => ({ ...p })) : [],
    ...preset,
  }
}

/** Create a work order, or edit the plannable fields of an open one. */
export function WorkOrderFormDialog({
  open,
  onOpenChange,
  workOrder,
  preset,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrder?: WorkOrder
  preset?: Partial<FormValues>
  onCreated?: (wo: WorkOrder) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">{open && <WorkOrderForm workOrder={workOrder} preset={preset} onDone={() => onOpenChange(false)} onCreated={onCreated} />}</DialogContent>
    </Dialog>
  )
}

function WorkOrderForm({ workOrder, preset, onDone, onCreated }: { workOrder?: WorkOrder; preset?: Partial<FormValues>; onDone: () => void; onCreated?: (wo: WorkOrder) => void }) {
  const editing = !!workOrder
  const { lookups } = useLookups()
  const parts = useParts()
  const settings = useSettings()
  const { workloads } = useTechnicianWorkloads()
  const form = useForm<FormValues, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: defaults(workOrder, preset) })
  const checklist = useFieldArray({ control: form.control, name: 'checklist' })
  const partLines = useFieldArray({ control: form.control, name: 'parts' })
  const { errors } = form.formState
  const priority = form.watch('priority')

  const save = useServiceMutation(
    (v: Parsed) => {
      const common = {
        title: v.title,
        description: v.description,
        priority: v.priority,
        scheduledDate: v.scheduledDate || undefined,
        dueDate: v.dueDate || undefined,
        instructions: v.instructions || undefined,
        partsRequired: v.parts,
      }
      return workOrder
        ? services.workOrders.update(workOrder.id, common)
        : services.workOrders.create({ ...common, type: v.type, equipmentId: v.equipmentId, assigneeId: v.assigneeId || undefined, checklist: v.checklist.map((c) => c.label) })
    },
    {
      invalidates: WORK_ORDER_EFFECTS,
      success: (wo) => (editing ? `${wo.number} updated` : `${wo.number} created`),
      onSuccess: (wo) => {
        onDone()
        if (!editing) onCreated?.(wo)
      },
    },
  )

  const equipment = [...lookups.equipment.values()].filter((e) => e.status !== 'Retired').sort((a, b) => a.assetId.localeCompare(b.assetId))
  const sla = settings.data?.prioritySlaHours[priority]

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${workOrder.number}` : 'New work order'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <>
            <FormField label="Type" htmlFor="wo-type">
              <NativeSelect id="wo-type" {...form.register('type')}>
                {WORK_ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Equipment" htmlFor="wo-equipment" error={errors.equipmentId?.message} required>
              <NativeSelect id="wo-equipment" aria-invalid={!!errors.equipmentId} {...form.register('equipmentId')}>
                <option value="">Select…</option>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.assetId} · {e.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </>
        )}
        <FormField label="Title" htmlFor="wo-title" error={errors.title?.message} required className="sm:col-span-2">
          <Input id="wo-title" aria-invalid={!!errors.title} placeholder="e.g. Replace worn drive belt" {...form.register('title')} />
        </FormField>
        <FormField label="Description" htmlFor="wo-description" error={errors.description?.message} required className="sm:col-span-2">
          <Textarea id="wo-description" aria-invalid={!!errors.description} placeholder="What is wrong, or what needs doing" {...form.register('description')} />
        </FormField>
        <FormField label="Priority" htmlFor="wo-priority">
          <NativeSelect id="wo-priority" {...form.register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {!editing ? (
          <FormField label="Technician" htmlFor="wo-assignee" hint="Open jobs shown per technician">
            <NativeSelect id="wo-assignee" {...form.register('assigneeId')}>
              <option value="">Unassigned</option>
              {workloads?.map((w) => (
                <option key={w.technician.id} value={w.technician.id}>
                  {w.technician.name} — {w.open.length} open{w.overdue ? `, ${w.overdue} overdue` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : (
          <div className="hidden sm:block" />
        )}
        <FormField label="Planned day" htmlFor="wo-scheduled" error={errors.scheduledDate?.message}>
          <Input id="wo-scheduled" type="date" aria-invalid={!!errors.scheduledDate} {...form.register('scheduledDate')} />
        </FormField>
        <FormField
          label="Due date"
          htmlFor="wo-due"
          error={errors.dueDate?.message}
          hint={!editing && sla ? `Leave blank to use the ${sla}-hour target for ${priority.toLowerCase()} priority` : undefined}
        >
          <Input id="wo-due" type="date" aria-invalid={!!errors.dueDate} {...form.register('dueDate')} />
        </FormField>
        <FormField label="Instructions for the technician" htmlFor="wo-instructions" className="sm:col-span-2">
          <Textarea id="wo-instructions" placeholder="Safety notes, isolation points, tools to bring…" {...form.register('instructions')} />
        </FormField>

        {!editing && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Checklist</legend>
            {checklist.fields.length === 0 && <p className="text-xs text-muted-foreground">Optional. Steps the technician ticks off as they go.</p>}
            <ol className="space-y-2">
              {checklist.fields.map((field, index) => (
                <li key={field.id} className="flex items-start gap-2">
                  <span className="mt-2 w-5 text-right text-xs text-muted-foreground">{index + 1}.</span>
                  <div className="flex-1">
                    <Input aria-label={`Checklist step ${index + 1}`} aria-invalid={!!errors.checklist?.[index]?.label} {...form.register(`checklist.${index}.label`)} />
                    {errors.checklist?.[index]?.label && <p className="mt-1 text-xs text-danger">{errors.checklist[index]!.label!.message}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => checklist.remove(index)} aria-label={`Remove step ${index + 1}`}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => checklist.append({ label: '' })}>
              <Plus /> Add step
            </Button>
          </fieldset>
        )}

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Parts to bring</legend>
          {partLines.fields.length === 0 && <p className="text-xs text-muted-foreground">Optional. Reserved parts are listed on the technician's job.</p>}
          <ul className="space-y-2">
            {partLines.fields.map((field, index) => {
              const err = errors.parts?.[index]
              return (
                <li key={field.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <NativeSelect aria-label={`Part ${index + 1}`} aria-invalid={!!err?.partId} {...form.register(`parts.${index}.partId`)}>
                      <option value="">Select part…</option>
                      {parts.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.partNumber} · {p.name} ({p.quantityOnHand} {p.unit} in stock)
                        </option>
                      ))}
                    </NativeSelect>
                    {err?.partId && <p className="mt-1 text-xs text-danger">{err.partId.message}</p>}
                  </div>
                  <div className="w-20">
                    <Input type="number" min={1} inputMode="numeric" aria-label={`Quantity of part ${index + 1}`} aria-invalid={!!err?.quantity} {...form.register(`parts.${index}.quantity`)} />
                    {err?.quantity && <p className="mt-1 text-xs text-danger">{err.quantity.message}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => partLines.remove(index)} aria-label={`Remove part ${index + 1}`}>
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
          {errors.parts?.root?.message && <p className="mt-1 text-xs text-danger">{errors.parts.root.message}</p>}
          {errors.parts?.message && <p className="mt-1 text-xs text-danger">{errors.parts.message}</p>}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => partLines.append({ partId: '', quantity: 1 })}>
            <Plus /> Add part
          </Button>
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {editing ? 'Save changes' : 'Create work order'}
        </Button>
      </DialogFooter>
    </form>
  )
}
