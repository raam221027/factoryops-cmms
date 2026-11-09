import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ApiError } from '@/services'
import { router } from './router'

/** A 401 from any request means the session is gone: send the user back to sign in. */
function handleUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.code === 'unauthorized' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Do not retry errors the server answered deliberately (permissions, validation, missing data).
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'text-sm' }} />
    </QueryClientProvider>
  )
}
