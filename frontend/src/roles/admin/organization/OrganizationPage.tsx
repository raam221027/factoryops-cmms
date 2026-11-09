import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FormField } from '@/components/shared/FormField'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Organization } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { useEquipmentList, useLookups, useOrganization } from '@/features/shared/queries'
import { services } from '@/services'
import { RecordDialog, type FieldSpec } from './RecordDialog'

type Kind = 'facility' | 'department' | 'location' | 'category'
type Editing = { kind: Kind; id?: string; initial?: Record<string, string> } | null

const TITLES: Record<Kind, string> = { facility: 'facility', department: 'department', location: 'production area', category: 'equipment category' }
const PLURALS: Record<Kind, string> = { facility: 'facilities', department: 'departments', location: 'production areas', category: 'equipment categories' }

export function OrganizationPage() {
  const { lookups, ready, error } = useLookups()
  const equipment = useEquipmentList()
  const [editing, setEditing] = useState<Editing>(null)

  const facilityOptions = [...lookups.facilities.values()].map((f) => ({ value: f.id, label: `${f.name}` }))
  const departmentOptions = [...lookups.departments.values()].map((d) => ({ value: d.id, label: `${d.name} (${lookups.facilities.get(d.facilityId)?.code ?? ''})` }))

  const fields: Record<Kind, FieldSpec[]> = {
    facility: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Plant 3 — Finishing' },
      { name: 'code', label: 'Code', kind: 'code', required: true, placeholder: 'P3' },
      { name: 'address', label: 'Address' },
    ],
    department: [
      { name: 'name', label: 'Name', required: true },
      { name: 'code', label: 'Code', kind: 'code', required: true },
      { name: 'facilityId', label: 'Facility', kind: 'select', options: facilityOptions, required: true },
    ],
    location: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Assembly Line 3' },
      { name: 'code', label: 'Code', kind: 'code', required: true, placeholder: 'P1-AL3' },
      { name: 'departmentId', label: 'Department', kind: 'select', options: departmentOptions, required: true, hint: 'The facility is taken from the department.' },
    ],
    category: [
      { name: 'name', label: 'Name', required: true },
      { name: 'code', label: 'Code', kind: 'code', required: true, hint: 'Used as the asset ID prefix, e.g. CNC-001.' },
    ],
  }

  const save = useServiceMutation(
    ({ kind, id, v }: { kind: Kind; id?: string; v: Record<string, string> }) => {
      switch (kind) {
        case 'facility':
          return services.organization.saveFacility({ id, name: v.name!, code: v.code!, address: v.address ?? '' })
        case 'department':
          return services.organization.saveDepartment({ id, name: v.name!, code: v.code!, facilityId: v.facilityId! })
        case 'location':
          return services.organization.saveLocation({ id, name: v.name!, code: v.code!, departmentId: v.departmentId!, facilityId: lookups.departments.get(v.departmentId!)?.facilityId ?? '' })
        case 'category':
          return services.organization.saveCategory({ id, name: v.name!, code: v.code! })
      }
    },
    { invalidates: ['org'], success: (_r, { kind, id }) => `${TITLES[kind][0]!.toUpperCase()}${TITLES[kind].slice(1)} ${id ? 'updated' : 'added'}`, onSuccess: () => setEditing(null) },
  )

  const counts = useMemo(() => {
    const by = (key: 'departmentId' | 'locationId' | 'categoryId') => {
      const m = new Map<string, number>()
      for (const e of equipment.data ?? []) m.set(e[key], (m.get(e[key]) ?? 0) + 1)
      return m
    }
    return { department: by('departmentId'), location: by('locationId'), category: by('categoryId') }
  }, [equipment.data])

  const addButton = (kind: Kind) => (
    <Button size="sm" onClick={() => setEditing({ kind })} disabled={!ready}>
      <Plus /> Add {TITLES[kind]}
    </Button>
  )

  type Row = { id: string; name: string; code: string; parent?: string; count?: number; initial: Record<string, string> }
  const columns = (parentLabel?: string, countLabel?: string): ColumnDef<Row, unknown>[] => [
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: 'name', header: 'Name' },
    ...(parentLabel ? [{ accessorKey: 'parent', header: parentLabel } as ColumnDef<Row, unknown>] : []),
    ...(countLabel ? [{ accessorKey: 'count', header: countLabel } as ColumnDef<Row, unknown>] : []),
  ]

  const facilities: Row[] = [...lookups.facilities.values()].map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    parent: f.address,
    count: [...lookups.departments.values()].filter((d) => d.facilityId === f.id).length,
    initial: { name: f.name, code: f.code, address: f.address },
  }))
  const departments: Row[] = [...lookups.departments.values()].map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    parent: lookups.facilities.get(d.facilityId)?.name,
    count: counts.department.get(d.id) ?? 0,
    initial: { name: d.name, code: d.code, facilityId: d.facilityId },
  }))
  const locations: Row[] = [...lookups.locations.values()].map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    parent: lookups.departments.get(l.departmentId)?.name,
    count: counts.location.get(l.id) ?? 0,
    initial: { name: l.name, code: l.code, departmentId: l.departmentId },
  }))
  const categories: Row[] = [...lookups.categories.values()].map((c) => ({ id: c.id, name: c.name, code: c.code, count: counts.category.get(c.id) ?? 0, initial: { name: c.name, code: c.code } }))

  const table = (kind: Kind, rows: Row[], parentLabel?: string, countLabel?: string) => (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>
          {rows.length} {rows.length === 1 ? TITLES[kind] : PLURALS[kind]}
        </CardTitle>
        {addButton(kind)}
      </CardHeader>
      <DataTable
        data={ready ? rows : undefined}
        columns={columns(parentLabel, countLabel)}
        getRowId={(r) => r.id}
        error={error}
        onRowClick={(r) => setEditing({ kind, id: r.id, initial: r.initial })}
        initialSorting={[{ id: 'code', desc: false }]}
      />
    </Card>
  )

  return (
    <>
      <PageHeader title="Organization" description="Company details, sites and the structure equipment is organised by." />
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="locations">Production areas</TabsTrigger>
          <TabsTrigger value="categories">Equipment categories</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <OrganizationDetails />
        </TabsContent>
        <TabsContent value="facilities">{table('facility', facilities, 'Address', 'Departments')}</TabsContent>
        <TabsContent value="departments">{table('department', departments, 'Facility', 'Equipment')}</TabsContent>
        <TabsContent value="locations">{table('location', locations, 'Department', 'Equipment')}</TabsContent>
        <TabsContent value="categories">{table('category', categories, undefined, 'Equipment')}</TabsContent>
      </Tabs>

      {editing && (
        <RecordDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={`${editing.id ? 'Edit' : 'Add'} ${TITLES[editing.kind]}`}
          fields={fields[editing.kind]}
          initial={editing.initial}
          saving={save.isPending}
          onSubmit={(v) => save.mutate({ kind: editing.kind, id: editing.id, v })}
        />
      )}
    </>
  )
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Use 2–8 letters or digits'),
  address: z.string().trim().max(200),
  timezone: z.string().trim().min(1, 'Enter a time zone'),
})
type OrgValues = z.input<typeof orgSchema>

function OrganizationDetails() {
  const org = useOrganization()
  if (org.isPending) return <ListSkeleton rows={3} />
  if (org.error) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />
  return <OrganizationForm org={org.data} />
}

function OrganizationForm({ org }: { org: Organization }) {
  const form = useForm<OrgValues>({ resolver: zodResolver(orgSchema), defaultValues: { name: org.name, code: org.code, address: org.address, timezone: org.timezone } })
  const { errors, isDirty } = form.formState
  const save = useServiceMutation((v: OrgValues) => services.organization.updateOrganization(v), {
    invalidates: ['org'],
    success: 'Organization details saved',
    onSuccess: (o) => form.reset({ name: o.name, code: o.code, address: o.address, timezone: o.timezone }),
  })
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [org.timezone]), [org.timezone])

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="max-w-2xl">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Company name" htmlFor="org-name" error={errors.name?.message} required className="sm:col-span-2">
            <Input id="org-name" aria-invalid={!!errors.name} {...form.register('name')} />
          </FormField>
          <FormField label="Short code" htmlFor="org-code" error={errors.code?.message} required>
            <Input id="org-code" className="font-mono uppercase" aria-invalid={!!errors.code} {...form.register('code')} />
          </FormField>
          <FormField label="Time zone" htmlFor="org-tz" error={errors.timezone?.message} hint="Used for due dates and reports.">
            <Input id="org-tz" list="org-timezones" {...form.register('timezone')} />
            <datalist id="org-timezones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Address" htmlFor="org-address" error={errors.address?.message} className="sm:col-span-2">
            <Input id="org-address" {...form.register('address')} />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save details
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
