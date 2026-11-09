import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Lock, Minus } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { WorkOrderStatusBadge } from '@/components/shared/badges'
import { FormField } from '@/components/shared/FormField'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table'
import { Switch } from '@/components/ui/toggles'
import { PRIORITIES, PROBLEM_CATEGORIES, PROBLEM_CATEGORY_LABELS, ROLE_LABELS, ROLES, WORK_ORDER_STATUSES } from '@/domain/enums'
import { PERMISSIONS, hasPermission, type Permission } from '@/domain/permissions'
import type { SystemSettings } from '@/domain/types'
import { WORK_ORDER_TRANSITIONS } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import { useSettings } from '@/features/shared/queries'
import { services } from '@/services'

const prefix = z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, '1–5 letters')
const hours = z.coerce.number().positive('Must be more than 0').max(2000)

const schema = z.object({
  workOrderPrefix: prefix,
  requestPrefix: prefix,
  laborRatePerHour: z.coerce.number().min(0, 'Cannot be negative').max(10_000),
  prioritySlaHours: z.object({ Low: hours, Medium: hours, High: hours, Critical: hours }),
  notifyOnNewRequest: z.boolean(),
  notifyOnAssignment: z.boolean(),
  notifyOnOverdue: z.boolean(),
  lowStockAlerts: z.boolean(),
})
type FormValues = z.input<typeof schema>
type Parsed = z.output<typeof schema>

const NOTIFICATIONS: { name: keyof Pick<Parsed, 'notifyOnNewRequest' | 'notifyOnAssignment' | 'lowStockAlerts'>; label: string; hint: string }[] = [
  { name: 'notifyOnNewRequest', label: 'New maintenance requests', hint: 'Notify supervisors when an operator reports a problem.' },
  { name: 'notifyOnAssignment', label: 'Work assignment', hint: 'Notify technicians when work is assigned to them.' },
  { name: 'lowStockAlerts', label: 'Low stock alerts', hint: 'Notify admins when a part reaches its minimum stock.' },
]

const PERMISSION_LABELS: Record<Permission, string> = {
  'workorder.view.all': 'View all work orders',
  'workorder.view.assigned': 'View assigned work orders',
  'workorder.create': 'Create work orders',
  'workorder.edit': 'Edit and plan work orders',
  'workorder.assign': 'Assign technicians',
  'workorder.execute': 'Execute work (start, complete, log parts)',
  'request.create': 'Report problems',
  'request.view.own': 'View own requests',
  'request.review': 'Approve or reject requests',
  'equipment.view': 'View equipment',
  'equipment.manage': 'Manage equipment register',
  'technician.view': 'View technician workload',
  'pm.view': 'View PM schedules',
  'pm.manage': 'Manage PM schedules',
  'inventory.view': 'View inventory',
  'inventory.manage': 'Manage inventory',
  'user.manage': 'Manage users',
  'org.manage': 'Manage organization',
  'reports.view': 'View reports',
  'settings.manage': 'Manage settings',
}

export function SettingsPage() {
  const settings = useSettings()
  return (
    <>
      <PageHeader title="Settings" description="Numbering, response targets, cost rates and notifications." />
      {settings.isPending ? (
        <ListSkeleton rows={5} />
      ) : settings.error ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="space-y-4">
          <SettingsForm settings={settings.data} />
          <RulesReference />
        </div>
      )}
    </>
  )
}

function SettingsForm({ settings }: { settings: SystemSettings }) {
  const form = useForm<FormValues, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: settings })
  const { errors, isDirty } = form.formState
  const save = useServiceMutation((v: Parsed) => services.settings.update(v), {
    invalidates: ['settings'],
    success: 'Settings saved',
    onSuccess: (s) => form.reset(s),
  })

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Work orders</CardTitle>
            <CardDescription>Document numbering, response targets and labor cost.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Work order prefix" htmlFor="s-wo" error={errors.workOrderPrefix?.message} hint="e.g. WO-10421">
            <Input id="s-wo" className="font-mono uppercase" aria-invalid={!!errors.workOrderPrefix} {...form.register('workOrderPrefix')} />
          </FormField>
          <FormField label="Request prefix" htmlFor="s-mr" error={errors.requestPrefix?.message} hint="e.g. MR-2088">
            <Input id="s-mr" className="font-mono uppercase" aria-invalid={!!errors.requestPrefix} {...form.register('requestPrefix')} />
          </FormField>
          <FormField label="Labor rate (USD/h)" htmlFor="s-rate" error={errors.laborRatePerHour?.message} hint="Used in cost reports">
            <Input id="s-rate" type="number" min={0} step="0.5" inputMode="decimal" {...form.register('laborRatePerHour')} />
          </FormField>
          <fieldset className="sm:col-span-3">
            <legend className="text-sm font-medium">Target completion time by priority</legend>
            <p className="mb-2 text-xs text-muted-foreground">Sets the due date of new work orders. Changes apply to work created from now on.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PRIORITIES.map((p) => (
                <FormField key={p} label={`${p} (hours)`} htmlFor={`s-sla-${p}`} error={errors.prioritySlaHours?.[p]?.message}>
                  <Input id={`s-sla-${p}`} type="number" min={1} inputMode="numeric" aria-invalid={!!errors.prioritySlaHours?.[p]} {...form.register(`prioritySlaHours.${p}`)} />
                </FormField>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>In-app notifications. Email and push delivery will be configured on the server.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-1">
          {NOTIFICATIONS.map((n) => (
            <Controller
              key={n.name}
              control={form.control}
              name={n.name}
              render={({ field }) => (
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-1 py-2 hover:bg-accent/50">
                  <span>
                    <span className="block text-sm font-medium">{n.label}</span>
                    <span className="block text-xs text-muted-foreground">{n.hint}</span>
                  </span>
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          ))}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="outline" disabled={!isDirty || save.isPending} onClick={() => form.reset()}>
            Discard
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

function ReadOnlyNote() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="size-3" aria-hidden /> System-defined
    </span>
  )
}

/**
 * Roles, permissions, the work order lifecycle and problem categories are rules the API must
 * enforce identically, so they are shown here for reference rather than edited in the browser.
 */
function RulesReference() {
  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Roles & permissions</CardTitle>
            <CardDescription>Assign a role to each user on the Users page. Custom roles require server-side support and are not configurable here.</CardDescription>
          </div>
          <ReadOnlyNote />
        </CardHeader>
        <Table>
          <THead>
            <Tr>
              <Th>Permission</Th>
              {ROLES.map((r) => (
                <Th key={r} className="text-center">
                  {ROLE_LABELS[r]}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {PERMISSIONS.map((p) => (
              <Tr key={p}>
                <Td className="py-1.5">{PERMISSION_LABELS[p]}</Td>
                {ROLES.map((r) => (
                  <Td key={r} className="py-1.5 text-center">
                    {hasPermission(r, p) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not allowed" />}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Work order lifecycle</CardTitle>
              <CardDescription>Allowed status changes.</CardDescription>
            </div>
            <ReadOnlyNote />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {WORK_ORDER_STATUSES.map((s) => (
                <li key={s} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-28 shrink-0">
                    <WorkOrderStatusBadge status={s} />
                  </span>
                  <span className="text-muted-foreground">→</span>
                  {WORK_ORDER_TRANSITIONS[s].length ? (
                    WORK_ORDER_TRANSITIONS[s].map((t) => <WorkOrderStatusBadge key={t} status={t} />)
                  ) : (
                    <span className="text-xs text-muted-foreground">Closed</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Problem categories</CardTitle>
              <CardDescription>Shown to operators when reporting a breakdown.</CardDescription>
            </div>
            <ReadOnlyNote />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PROBLEM_CATEGORIES.map((c) => (
              <Badge key={c} tone="primary">
                {PROBLEM_CATEGORY_LABELS[c]}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
