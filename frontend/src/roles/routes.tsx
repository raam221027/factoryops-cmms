import type { RouteObject } from 'react-router'
import { DesktopShell } from '@/components/layout/DesktopShell'
import { MobileShell } from '@/components/layout/MobileShell'
import { DESKTOP_NAV, MOBILE_NAV } from '@/config/navigation'
import { RequireRole } from '@/features/auth/RequireRole'
import { AdminHome } from './admin/AdminHome'
import { OperatorHome } from './operator/OperatorHome'
import { SupervisorHome } from './supervisor/SupervisorHome'
import { TechnicianHome } from './technician/TechnicianHome'

/* One route tree per role experience, each behind its own guard and layout. */

export const adminRoutes: RouteObject = {
  path: '/admin',
  element: (
    <RequireRole roles={['Admin']}>
      <DesktopShell sections={DESKTOP_NAV.Admin ?? []} workspaceLabel="Administration" />
    </RequireRole>
  ),
  children: [{ index: true, element: <AdminHome /> }],
}

export const supervisorRoutes: RouteObject = {
  path: '/supervisor',
  element: (
    <RequireRole roles={['Supervisor']}>
      <DesktopShell sections={DESKTOP_NAV.Supervisor ?? []} workspaceLabel="Maintenance planning" />
    </RequireRole>
  ),
  children: [{ index: true, element: <SupervisorHome /> }],
}

export const technicianRoutes: RouteObject = {
  path: '/tech',
  element: (
    <RequireRole roles={['Technician']}>
      <MobileShell items={MOBILE_NAV.Technician ?? []} />
    </RequireRole>
  ),
  children: [{ index: true, element: <TechnicianHome /> }],
}

export const operatorRoutes: RouteObject = {
  path: '/operator',
  element: (
    <RequireRole roles={['Operator']}>
      <MobileShell items={MOBILE_NAV.Operator ?? []} />
    </RequireRole>
  ),
  children: [{ index: true, element: <OperatorHome /> }],
}
