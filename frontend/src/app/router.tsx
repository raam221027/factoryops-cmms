import { createBrowserRouter, Navigate } from 'react-router'
import { FullPageSpinner } from '@/features/auth/RequireRole'
import { adminPrintRoutes, adminRoutes, equipmentLinkRoute, operatorRoutes, supervisorRoutes, technicianRoutes } from '@/roles/routes'
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    // Shown while a lazily loaded screen is fetched on first page load
    hydrateFallbackElement: <FullPageSpinner />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', lazy: () => import('@/features/auth/LoginPage').then((m) => ({ Component: m.LoginPage })) },
      adminRoutes,
      adminPrintRoutes,
      supervisorRoutes,
      technicianRoutes,
      operatorRoutes,
      equipmentLinkRoute,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
