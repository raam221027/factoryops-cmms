import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import { env } from '@/config/env'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { PwaPrompts } from '@/features/pwa/PwaPrompts'
import { ApiError } from '@/services'
import { router } from './router'

/** A 401 from any request means the session is gone: send the user back to sign in. */
function handleUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.code === 'unauthorized' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

/*
 * Demo data lives on the device, so it keeps working offline. API reads pause while offline and
 * keep showing cached data; API writes fail straight away with a clear message rather than
 * waiting silently in memory.
 */
const QUERY_NETWORK_MODE = env.dataSource === 'mock' ? 'always' : 'online'

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Do not retry errors the server answered deliberately (permissions, validation, missing data).
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      networkMode: QUERY_NETWORK_MODE,
    },
    mutations: { networkMode: 'always' },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <PwaPrompts />
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'text-sm' }} />
    </QueryClientProvider>
  )
}
