import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'

export interface FieldSpec {
  name: string
  label: string
  /** Codes are uppercased and restricted to letters, digits and dashes */
  kind?: 'text' | 'code' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  hint?: string
}

type Values = Record<string, string>

function buildSchema(fields: FieldSpec[]) {
  const shape: Record<string, z.ZodType<string, string>> = {}
  for (const f of fields) {
    let s = z.string().trim().max(120)
    if (f.kind === 'code') s = s.toUpperCase().regex(/^[A-Z0-9-]{1,12}$/, 'Use up to 12 letters, digits or dashes')
    shape[f.name] = f.required ? s.min(1, `${f.label} is required`) : s
  }
  return z.object(shape)
}

/**
 * Create/edit dialog for simple reference records (facilities, departments, areas,
 * categories) described by a field list.
 */
export function RecordDialog({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  fields: FieldSpec[]
  initial?: Values
  saving: boolean
  onSubmit: (values: Values) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">{open && <RecordForm title={title} fields={fields} initial={initial} saving={saving} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function RecordForm({ title, fields, initial, saving, onSubmit, onCancel }: { title: string; fields: FieldSpec[]; initial?: Values; saving: boolean; onSubmit: (v: Values) => void; onCancel: () => void }) {
  const schema = useMemo(() => buildSchema(fields), [fields])
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? ''])),
  })
  const { errors } = form.formState

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {fields.map((f) => {
          const id = `rec-${f.name}`
          const error = errors[f.name]?.message
          return (
            <FormField key={f.name} label={f.label} htmlFor={id} error={typeof error === 'string' ? error : undefined} hint={f.hint} required={f.required}>
              {f.kind === 'select' ? (
                <NativeSelect id={id} aria-invalid={!!error} {...form.register(f.name)}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input id={id} aria-invalid={!!error} placeholder={f.placeholder} className={f.kind === 'code' ? 'font-mono uppercase' : undefined} {...form.register(f.name)} />
              )}
            </FormField>
          )
        })}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
