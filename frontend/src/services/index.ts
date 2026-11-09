import { env } from '@/config/env'
import type { AuthService, DataServices } from './contracts'
import { ApiError } from './errors'
import { demoAuth, type DemoAuthService } from './mock/auth'
import { mockServices } from './mock'

/*
 * Single switch point between the in-browser demo data and the real API.
 * The API implementations are not written yet, so selecting them fails loudly instead of
 * pretending to work.
 */

function notImplemented(): never {
  throw new ApiError('server', 'VITE_DATA_SOURCE=api is not available yet: the API service implementations have not been written.')
}

export const services: DataServices = env.dataSource === 'mock' ? mockServices : notImplemented()

export const authService: AuthService | DemoAuthService = env.demoAuth ? demoAuth : notImplemented()

export function isDemoAuth(auth: AuthService | DemoAuthService): auth is DemoAuthService {
  return 'isDemo' in auth && auth.isDemo
}

export { ApiError, errorMessage } from './errors'
export type * from './contracts'
