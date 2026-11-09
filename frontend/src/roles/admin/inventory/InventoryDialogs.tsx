import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { INVENTORY_TRANSACTION_TYPES, type InventoryTransactionType } from '@/domain/enums'
import type { SparePart } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { services } from '@/services'

const partSchema = z.object({
  partNumber: z.string().trim().min(2, 'Enter the part number').max(30),
  name: z.string().trim().min(2, 'Enter the part name').max(120),
  category: z.string().trim().min(2, 'Enter a category').max(40),
  unit: z.string().trim().min(1, 'Enter the unit').max(12),
  unitCost: z.coerce.number().min(0, 'Cost cannot be negative'),
  minimumStock: z.coerce.number().int('Whole numbers only').min(0),
  quantityOnHand: z.coerce.number().int('Whole numbers only').min(0),
  storageLocation: z.string().trim().max(40),
})
type PartValues = z.input<typeof partSchema>
type PartParsed = z.output<typeof partSchema>

export function PartDialog({ open, onOpenChange, part, categories }: { open: boolean; onOpenChange: (o: boolean) => void; part?: SparePart; categories: string[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <PartForm part={part} categories={categories} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function PartForm({ part, categories, onDone }: { part?: SparePart; categories: string[]; onDone: () => void }) {
  const form = useForm<PartValues, unknown, PartParsed>({
    resolver: zodResolver(partSchema),
    defaultValues: part ?? { partNumber: '', name: '', category: '', unit: 'pcs', unitCost: 0, minimumStock: 0, quantityOnHand: 0, storageLocation: '' },
  })
  const { errors } = form.formState
  const save = useServiceMutation((v: PartParsed) => services.inventory.savePart(part ? { ...v, id: part.id, quantityOnHand: undefined } : v), {
    invalidates: ['inventory'],
    success: (p) => `${p.partNumber} saved`,
    onSuccess: onDone,
  })

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{part ? `Edit ${part.partNumber}` : 'Add spare part'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <FormField label="Part number" htmlFor="p-number" error={errors.partNumber?.message} required>
          <Input id="p-number" className="font-mono" aria-invalid={!!errors.partNumber} {...form.register('partNumber')} />
        </FormField>
        <FormField label="Category" htmlFor="p-category" error={errors.category?.message} required>
          <Input id="p-category" list="part-categories" aria-invalid={!!errors.category} {...form.register('category')} />
          <datalist id="part-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Name" htmlFor="p-name" error={errors.name?.message} required className="sm:col-span-2">
          <Input id="p-name" aria-invalid={!!errors.name} {...form.register('name')} />
        </FormField>
        <FormField label="Unit" htmlFor="p-unit" error={errors.unit?.message} required>
          <Input id="p-unit" {...form.register('unit')} />
        </FormField>
        <FormField label="Unit cost (USD)" htmlFor="p-cost" error={errors.unitCost?.message}>
          <Input id="p-cost" type="number" step="0.01" min={0} inputMode="decimal" {...form.register('unitCost')} />
        </FormField>
        <FormField label="Minimum stock" htmlFor="p-min" error={errors.minimumStock?.message} hint="A low-stock alert is raised at or below this level.">
          <Input id="p-min" type="number" min={0} inputMode="numeric" {...form.register('minimumStock')} />
        </FormField>
        {!part && (
          <FormField label="Opening quantity" htmlFor="p-qty" error={errors.quantityOnHand?.message}>
            <Input id="p-qty" type="number" min={0} inputMode="numeric" {...form.register('quantityOnHand')} />
          </FormField>
        )}
        <FormField label="Storage location" htmlFor="p-loc" error={errors.storageLocation?.message}>
          <Input id="p-loc" placeholder="e.g. Store A-3-2" {...form.register('storageLocation')} />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {part ? 'Save changes' : 'Add part'}
        </Button>
      </DialogFooter>
    </form>
  )
}

const TYPE_HELP: Record<InventoryTransactionType, string> = {
  Receipt: 'Stock received from a supplier. Adds to the quantity on hand.',
  Issue: 'Stock taken out without a work order. Subtracts from the quantity on hand.',
  Adjustment: 'Correction after a stock count. Use a negative number to reduce stock.',
}

const stockSchema = z.object({
  type: z.enum(INVENTORY_TRANSACTION_TYPES),
  quantity: z.coerce.number().int('Whole numbers only').refine((n) => n !== 0, 'Enter a quantity'),
  note: z.string().trim().max(200),
})
type StockValues = z.input<typeof stockSchema>
type StockParsed = z.output<typeof stockSchema>

export function StockDialog({ part, onOpenChange }: { part: SparePart | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!part} onOpenChange={onOpenChange}>
      <DialogContent size="sm">{part && <StockForm part={part} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function StockForm({ part, onDone }: { part: SparePart; onDone: () => void }) {
  const form = useForm<StockValues, unknown, StockParsed>({ resolver: zodResolver(stockSchema), defaultValues: { type: 'Receipt', quantity: '', note: '' } })
  const { errors } = form.formState
  const type = form.watch('type')
  const save = useServiceMutation((v: StockParsed) => services.inventory.adjustStock(part.id, v.type, v.quantity, v.note), {
    invalidates: ['inventory', 'notifications'],
    success: (p) => `${p.name}: ${p.quantityOnHand} ${p.unit} on hand`,
    onSuccess: onDone,
  })

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {part.partNumber} · {part.name} — {part.quantityOnHand} {part.unit} on hand
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FormField label="Movement" htmlFor="s-type" hint={TYPE_HELP[type]}>
          <NativeSelect id="s-type" {...form.register('type')}>
            {INVENTORY_TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={`Quantity (${part.unit})`} htmlFor="s-qty" error={errors.quantity?.message} required>
          <Input id="s-qty" type="number" inputMode="numeric" min={type === 'Adjustment' ? undefined : 1} aria-invalid={!!errors.quantity} autoFocus {...form.register('quantity')} />
        </FormField>
        <FormField label="Reference / note" htmlFor="s-note" error={errors.note?.message}>
          <Input id="s-note" placeholder={type === 'Receipt' ? 'e.g. PO-48211' : 'Reason'} {...form.register('note')} />
        </FormField>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Record movement
        </Button>
      </DialogFooter>
    </form>
  )
}
