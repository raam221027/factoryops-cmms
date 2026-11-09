import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { CRITICALITIES, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUSES } from '@/domain/enums'
import type { Equipment } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups } from '@/features/shared/queries'
import { services, type EquipmentInput } from '@/services'

const optionalDate = z.union([z.literal(''), z.iso.date('Enter a valid date')])

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter the equipment name').max(120),
    categoryId: z.string().min(1, 'Choose a category'),
    assetId: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2–20 letters, digits or dashes')]),
    serialNumber: z.string().trim().min(1, 'Enter the serial number').max(60),
    manufacturer: z.string().trim().max(80),
    model: z.string().trim().max(80),
    departmentId: z.string().min(1, 'Choose a department'),
    locationId: z.string().min(1, 'Choose a production area'),
    installationDate: optionalDate,
    warrantyExpiry: optionalDate,
    status: z.enum(EQUIPMENT_STATUSES),
    criticality: z.enum(CRITICALITIES),
  })
  .refine((v) => !v.installationDate || !v.warrantyExpiry || v.warrantyExpiry >= v.installationDate, {
    path: ['warrantyExpiry'],
    message: 'Warranty must end after installation',
  })

type FormValues = z.input<typeof schema>
type Parsed = z.output<typeof schema>

const EMPTY: FormValues = {
  name: '',
  categoryId: '',
  assetId: '',
  serialNumber: '',
  manufacturer: '',
  model: '',
  departmentId: '',
  locationId: '',
  installationDate: '',
  warrantyExpiry: '',
  status: 'Operational',
  criticality: 'Medium',
}

function toValues(e: Equipment): FormValues {
  return {
    name: e.name,
    categoryId: e.categoryId,
    assetId: e.assetId,
    serialNumber: e.serialNumber,
    manufacturer: e.manufacturer ?? '',
    model: e.model ?? '',
    departmentId: e.departmentId,
    locationId: e.locationId,
    installationDate: e.installationDate ?? '',
    warrantyExpiry: e.warrantyExpiry ?? '',
    status: e.status,
    criticality: e.criticality,
  }
}

function toInput(v: Parsed): EquipmentInput {
  return {
    ...v,
    assetId: v.assetId || undefined,
    manufacturer: v.manufacturer || undefined,
    model: v.model || undefined,
    installationDate: v.installationDate || undefined,
    warrantyExpiry: v.warrantyExpiry || undefined,
  }
}

export function EquipmentFormPage() {
  const { id } = useParams()
  const editing = !!id
  const existing = useQuery({ queryKey: ['equipment', 'detail', id], queryFn: () => services.equipment.get(id!), enabled: editing })

  if (editing && existing.isPending) return <ListSkeleton rows={6} />
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
  return <EquipmentForm key={id ?? 'new'} existing={existing.data} />
}

function EquipmentForm({ existing }: { existing?: Equipment }) {
  const navigate = useNavigate()
  const { lookups, ready } = useLookups()
  const form = useForm<FormValues, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: existing ? toValues(existing) : EMPTY })
  const { errors } = form.formState
  const categoryId = form.watch('categoryId')
  const departmentId = form.watch('departmentId')

  const save = useServiceMutation((v: Parsed) => (existing ? services.equipment.update(existing.id, toInput(v)) : services.equipment.create(toInput(v))), {
    invalidates: ['equipment'],
    success: (e) => `${e.assetId} saved`,
    onSuccess: (e) => navigate(`/admin/equipment/${e.id}`),
  })

  // Suggest the next asset ID for the chosen category when registering new equipment.
  const suggested = useQuery({
    queryKey: ['equipment', 'next-asset-id', categoryId],
    queryFn: () => services.equipment.nextAssetId(categoryId),
    enabled: !existing && !!categoryId,
  })

  // Keep the production area consistent with the department.
  useEffect(() => {
    const loc = lookups.locations.get(form.getValues('locationId'))
    if (loc && loc.departmentId !== departmentId) form.setValue('locationId', '')
  }, [departmentId, form, lookups.locations])

  const locations = [...lookups.locations.values()].filter((l) => !departmentId || l.departmentId === departmentId)
  const title = existing ? `Edit ${existing.name}` : 'Register equipment'

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: 'Equipment', to: '/admin/equipment' }, ...(existing ? [{ label: existing.assetId, to: `/admin/equipment/${existing.id}` }] : []), { label: existing ? 'Edit' : 'New' }]}
      />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Identification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2">
              <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} placeholder="e.g. Vertical Machining Center #6" />
            </FormField>
            <FormField label="Category" htmlFor="categoryId" error={errors.categoryId?.message} required>
              <NativeSelect id="categoryId" aria-invalid={!!errors.categoryId} {...form.register('categoryId')} disabled={!ready}>
                <option value="">Select…</option>
                {[...lookups.categories.values()].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Asset ID"
              htmlFor="assetId"
              error={errors.assetId?.message}
              hint={existing ? 'Changing the asset ID invalidates printed QR labels.' : suggested.data ? `Leave empty to use ${suggested.data}` : 'Generated from the category if left empty'}
            >
              <Input id="assetId" className="font-mono uppercase" aria-invalid={!!errors.assetId} placeholder={suggested.data ?? ''} {...form.register('assetId')} />
            </FormField>
            <FormField label="Serial number" htmlFor="serialNumber" error={errors.serialNumber?.message} required>
              <Input id="serialNumber" aria-invalid={!!errors.serialNumber} {...form.register('serialNumber')} />
            </FormField>
            <FormField label="Manufacturer" htmlFor="manufacturer" error={errors.manufacturer?.message}>
              <Input id="manufacturer" {...form.register('manufacturer')} />
            </FormField>
            <FormField label="Model" htmlFor="model" error={errors.model?.message}>
              <Input id="model" {...form.register('model')} />
            </FormField>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Location & lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Department" htmlFor="departmentId" error={errors.departmentId?.message} required>
              <NativeSelect id="departmentId" aria-invalid={!!errors.departmentId} {...form.register('departmentId')} disabled={!ready}>
                <option value="">Select…</option>
                {[...lookups.departments.values()].map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({lookups.facilities.get(d.facilityId)?.code})
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Production area" htmlFor="locationId" error={errors.locationId?.message} required>
              <NativeSelect id="locationId" aria-invalid={!!errors.locationId} {...form.register('locationId')} disabled={!ready || !departmentId}>
                <option value="">{departmentId ? 'Select…' : 'Choose a department first'}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Installation date" htmlFor="installationDate" error={errors.installationDate?.message}>
              <Input id="installationDate" type="date" {...form.register('installationDate')} />
            </FormField>
            <FormField label="Warranty until" htmlFor="warrantyExpiry" error={errors.warrantyExpiry?.message}>
              <Input id="warrantyExpiry" type="date" aria-invalid={!!errors.warrantyExpiry} {...form.register('warrantyExpiry')} />
            </FormField>
            <FormField label="Status" htmlFor="status" error={errors.status?.message}>
              <NativeSelect id="status" {...form.register('status')}>
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EQUIPMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Criticality" htmlFor="criticality" hint="High-criticality assets are prioritised in planning.">
              <NativeSelect id="criticality" {...form.register('criticality')}>
                {CRITICALITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline" asChild>
              <Link to={existing ? `/admin/equipment/${existing.id}` : '/admin/equipment'}>Cancel</Link>
            </Button>
            <Button type="submit" loading={save.isPending}>
              {existing ? 'Save changes' : 'Register equipment'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  )
}
