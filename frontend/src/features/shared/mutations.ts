import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/services'
import { useInvalidate, type Domain } from './queries'

/**
 * Standard write: on success refresh the affected domains and confirm with a toast; on
 * failure show the server's message. Callers can still await `mutateAsync` to react further.
 */
export function useServiceMutation<TVars, TResult>(
  mutationFn: (vars: TVars) => Promise<TResult>,
  options: { invalidates: Domain[]; success?: string | ((result: TResult, vars: TVars) => string); onSuccess?: (result: TResult, vars: TVars) => void },
) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn,
    onSuccess: async (result, vars) => {
      await invalidate(...options.invalidates)
      const message = typeof options.success === 'function' ? options.success(result, vars) : options.success
      if (message) toast.success(message)
      options.onSuccess?.(result, vars)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}
