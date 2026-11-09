import { createBrowserRouter, Navigate } from 'react-router'
import { LoginPage } from '@/features/auth/LoginPage'
import { adminRoutes, operatorRoutes, supervisorRoutes, technicianRoutes } from '@/roles/routes'
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      adminRoutes,
      supervisorRoutes,
      technicianRoutes,
      operatorRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
