import type { ComponentType } from 'react'
import { Outlet, type RouteObject } from 'react-router'
import { DesktopShell } from '@/components/layout/DesktopShell'
import { MobileShell } from '@/components/layout/MobileShell'
import { DESKTOP_NAV, MOBILE_NAV } from '@/config/navigation'
import { ROLES } from '@/domain/enums'
import { RequireRole } from '@/features/auth/RequireRole'
import { OperatorLayout } from './operator/OperatorLayout'

/*
 * One route tree per role experience, each behind its own guard and layout. Screens are
 * lazy-loaded so each role only downloads what it uses (charts stay out of the phone bundle).
 */

const page = <M,>(load: () => Promise<M>, pick: (m: M) => ComponentType) => () => load().then((m) => ({ Component: pick(m) }))

export const adminRoutes: RouteObject = {
  path: '/admin',
  element: (
    <RequireRole roles={['Admin']}>
      <DesktopShell sections={DESKTOP_NAV.Admin ?? []} workspaceLabel="Administration" />
    </RequireRole>
  ),
  children: [
    { index: true, lazy: page(() => import('./admin/dashboard/AdminDashboard'), (m) => m.AdminDashboard) },
    { path: 'reports', lazy: page(() => import('./admin/reports/ReportsPage'), (m) => m.ReportsPage) },
    { path: 'equipment', lazy: page(() => import('./admin/equipment/EquipmentListPage'), (m) => m.EquipmentListPage) },
    { path: 'equipment/new', lazy: page(() => import('./admin/equipment/EquipmentFormPage'), (m) => m.EquipmentFormPage) },
    { path: 'equipment/:id', lazy: page(() => import('@/features/equipment/EquipmentDetailPage'), (m) => m.EquipmentDetailPage) },
    { path: 'equipment/:id/edit', lazy: page(() => import('./admin/equipment/EquipmentFormPage'), (m) => m.EquipmentFormPage) },
    { path: 'pm', lazy: page(() => import('./admin/pm/PmPage'), (m) => m.PmPage) },
    { path: 'inventory', lazy: page(() => import('./admin/inventory/InventoryPage'), (m) => m.InventoryPage) },
    { path: 'organization', lazy: page(() => import('./admin/organization/OrganizationPage'), (m) => m.OrganizationPage) },
    { path: 'users', lazy: page(() => import('./admin/users/UsersPage'), (m) => m.UsersPage) },
    { path: 'settings', lazy: page(() => import('./admin/settings/SettingsPage'), (m) => m.SettingsPage) },
  ],
}

/** Admin print views render without the app shell. */
export const adminPrintRoutes: RouteObject = {
  path: '/admin/equipment/labels',
  element: (
    <RequireRole roles={['Admin']}>
      <Outlet />
    </RequireRole>
  ),
  children: [{ index: true, lazy: page(() => import('./admin/equipment/QrLabelsPage'), (m) => m.QrLabelsPage) }],
}

/** QR label landing route, available to every signed-in role. */
export const equipmentLinkRoute: RouteObject = {
  path: '/equipment/:assetId',
  lazy: page(
    () => import('@/features/equipment/EquipmentLinkResolver'),
    (m) =>
      function GuardedResolver() {
        return (
          <RequireRole roles={ROLES}>
            <m.EquipmentLinkResolver />
          </RequireRole>
        )
      },
  ),
}

export const supervisorRoutes: RouteObject = {
  path: '/supervisor',
  element: (
    <RequireRole roles={['Supervisor']}>
      <DesktopShell sections={DESKTOP_NAV.Supervisor ?? []} workspaceLabel="Maintenance planning" />
    </RequireRole>
  ),
  children: [
    { index: true, lazy: page(() => import('./supervisor/dashboard/SupervisorDashboard'), (m) => m.SupervisorDashboard) },
    { path: 'requests', lazy: page(() => import('./supervisor/requests/RequestsPage'), (m) => m.RequestsPage) },
    { path: 'work-orders', lazy: page(() => import('./supervisor/work-orders/WorkOrdersPage'), (m) => m.WorkOrdersPage) },
    { path: 'work-orders/:id', lazy: page(() => import('./supervisor/work-orders/WorkOrderDetailPage'), (m) => m.WorkOrderDetailPage) },
    { path: 'board', lazy: page(() => import('./supervisor/board/BoardPage'), (m) => m.BoardPage) },
    { path: 'schedule', lazy: page(() => import('./supervisor/schedule/SchedulePage'), (m) => m.SchedulePage) },
    { path: 'technicians', lazy: page(() => import('./supervisor/technicians/TechniciansPage'), (m) => m.TechniciansPage) },
    { path: 'equipment', lazy: page(() => import('./supervisor/equipment/EquipmentMonitorPage'), (m) => m.EquipmentMonitorPage) },
    { path: 'equipment/:id', lazy: page(() => import('@/features/equipment/EquipmentDetailPage'), (m) => m.EquipmentDetailPage) },
  ],
}

export const technicianRoutes: RouteObject = {
  path: '/tech',
  element: (
    <RequireRole roles={['Technician']}>
      <MobileShell items={MOBILE_NAV.Technician ?? []} profilePath="/tech/profile" highlight="/tech/scan" />
    </RequireRole>
  ),
  children: [
    { index: true, lazy: page(() => import('./technician/home/TechnicianHome'), (m) => m.TechnicianHome) },
    { path: 'jobs', lazy: page(() => import('./technician/jobs/JobsPage'), (m) => m.JobsPage) },
    { path: 'jobs/:id', lazy: page(() => import('./technician/jobs/JobDetailPage'), (m) => m.JobDetailPage) },
    { path: 'scan', lazy: page(() => import('./technician/scan/ScanPage'), (m) => m.ScanPage) },
    { path: 'report', lazy: page(() => import('./technician/report/ReportPage'), (m) => m.TechReportPage) },
    { path: 'equipment/:id', lazy: page(() => import('./technician/equipment/TechEquipmentPage'), (m) => m.TechEquipmentPage) },
    { path: 'history', lazy: page(() => import('./technician/history/HistoryPage'), (m) => m.HistoryPage) },
    { path: 'profile', lazy: page(() => import('./technician/profile/ProfilePage'), (m) => m.ProfilePage) },
  ],
}

export const operatorRoutes: RouteObject = {
  path: '/operator',
  element: (
    <RequireRole roles={['Operator']}>
      <OperatorLayout />
    </RequireRole>
  ),
  children: [
    { index: true, lazy: page(() => import('./operator/OperatorHome'), (m) => m.OperatorHome) },
    { path: 'report', lazy: page(() => import('./operator/ReportPage'), (m) => m.ReportPage) },
    { path: 'requests', lazy: page(() => import('./operator/requests/MyRequestsPage'), (m) => m.MyRequestsPage) },
    { path: 'requests/:id', lazy: page(() => import('./operator/requests/RequestDetailPage'), (m) => m.RequestDetailPage) },
  ],
}
