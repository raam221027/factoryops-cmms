import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { ROLE_LABELS, ROLES } from '@/domain/enums'
import type { User } from '@/domain/types'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups } from '@/features/shared/queries'
import { services, type UserInput } from '@/services'

const SHIFTS = ['Day shift', 'Night shift', 'Rotating'] as const

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(80),
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().max(30),
  role: z.enum(ROLES),
  title: z.string().trim().min(2, 'Enter a job title').max(80),
  departmentId: z.string(),
  skills: z.string().trim().max(200),
  shift: z.string(),
})
type FormValues = z.input<typeof schema>
type Parsed = z.output<typeof schema>

export function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: User }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <UserForm user={user} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const { lookups } = useLookups()
  const form = useForm<FormValues, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'Technician',
      title: user?.title ?? '',
      departmentId: user?.departmentId ?? '',
      skills: user?.skills.join(', ') ?? '',
      shift: user?.shift ?? 'Day shift',
    },
  })
  const { errors } = form.formState
  const role = form.watch('role')

  const save = useServiceMutation(
    (v: Parsed) => {
      const technician = v.role === 'Technician'
      const input: UserInput = {
        name: v.name,
        email: v.email.toLowerCase(),
        phone: v.phone || undefined,
        role: v.role,
        title: v.title,
        departmentId: v.departmentId || undefined,
        active: user?.active ?? true,
        skills: technician ? v.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
        shift: technician ? v.shift || undefined : undefined,
      }
      return user ? services.users.update(user.id, input) : services.users.create(input)
    },
    { invalidates: ['users'], success: (u) => `${u.name} ${user ? 'updated' : 'added'}`, onSuccess: onDone },
  )

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{user ? `Edit ${user.name}` : 'Add user'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="u-name" error={errors.name?.message} required>
          <Input id="u-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register('name')} />
        </FormField>
        <FormField label="Job title" htmlFor="u-title" error={errors.title?.message} required>
          <Input id="u-title" aria-invalid={!!errors.title} {...form.register('title')} />
        </FormField>
        <FormField label="Email" htmlFor="u-email" error={errors.email?.message} required>
          <Input id="u-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register('email')} />
        </FormField>
        <FormField label="Phone" htmlFor="u-phone" error={errors.phone?.message}>
          <Input id="u-phone" type="tel" {...form.register('phone')} />
        </FormField>
        <FormField label="Role" htmlFor="u-role" hint="Determines which experience and permissions the user gets.">
          <NativeSelect id="u-role" {...form.register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Department" htmlFor="u-dept">
          <NativeSelect id="u-dept" {...form.register('departmentId')}>
            <option value="">None</option>
            {[...lookups.departments.values()].map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {role === 'Technician' && (
          <>
            <FormField label="Skills" htmlFor="u-skills" error={errors.skills?.message} hint="Comma separated, e.g. Electrical, PLC, Hydraulics">
              <Input id="u-skills" {...form.register('skills')} />
            </FormField>
            <FormField label="Shift" htmlFor="u-shift">
              <NativeSelect id="u-shift" {...form.register('shift')}>
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </>
        )}
        {!user && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Sign-in credentials are issued by the identity provider once the API is connected; this only creates the user profile.
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {user ? 'Save changes' : 'Add user'}
        </Button>
      </DialogFooter>
    </form>
  )
}
