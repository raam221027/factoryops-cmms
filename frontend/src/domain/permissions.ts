import type { Role } from './enums'

/*
 * Frontend permissions only decide what the UI shows. They are NOT a security boundary:
 * the API must authorize every request on its own.
 */

export const PERMISSIONS = [
  'workorder.view.all',
  'workorder.view.assigned',
  'workorder.create',
  'workorder.edit',
  'workorder.assign',
  'workorder.execute',
  'request.create',
  'request.view.own',
  'request.review',
  'equipment.view',
  'equipment.manage',
  'technician.view',
  'pm.view',
  'pm.manage',
  'inventory.view',
  'inventory.manage',
  'user.manage',
  'org.manage',
  'reports.view',
  'settings.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  Admin: PERMISSIONS,
  Supervisor: [
    'workorder.view.all',
    'workorder.create',
    'workorder.edit',
    'workorder.assign',
    'request.create',
    'request.review',
    'equipment.view',
    'technician.view',
    'pm.view',
    'inventory.view',
    'reports.view',
  ],
  Technician: [
    'workorder.view.assigned',
    'workorder.execute',
    'request.create',
    'equipment.view',
    'inventory.view',
  ],
  Operator: ['request.create', 'request.view.own'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Home route of each role experience. */
export const ROLE_HOME: Record<Role, string> = {
  Admin: '/admin',
  Supervisor: '/supervisor',
  Technician: '/tech',
  Operator: '/operator',
}
