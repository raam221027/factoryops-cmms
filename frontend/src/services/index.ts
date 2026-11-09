import { env } from '@/config/env'
import type { AuthService, DataServices } from './contracts'
import { ApiError } from './errors'
import { demoAuth, type DemoAuthService } from './mock/auth'
import { mockServices } from './mock'

/*
 * Single switch point between the in-browser demo data and the real API.
 * The API implementations are not written yet. Selecting them yields services whose every
 * call fails with a clear message, so the app still loads and explains what is missing
 * instead of rendering a blank page.
 */

const NOT_CONNECTED = 'The FactoryOps API is not connected yet: the API service implementations have not been written.'

/** A service object whose every method rejects with NOT_CONNECTED. */
function unavailable<T extends object>(): T {
  return new Proxy({} as T, {
    get: (_target, prop) => (prop === 'then' ? undefined : () => Promise.reject(new ApiError('server', NOT_CONNECTED))),
  })
}

const unavailableCache = new Map<PropertyKey, object>()

export const services: DataServices =
  env.dataSource === 'mock'
    ? mockServices
    : new Proxy({} as DataServices, {
        get: (_target, name) => {
          if (!unavailableCache.has(name)) unavailableCache.set(name, unavailable())
          return unavailableCache.get(name)
        },
      })

const apiAuth: AuthService = {
  currentUser: async () => null,
  signIn: () => Promise.reject(new ApiError('server', NOT_CONNECTED)),
  signOut: async () => {},
}

export const authService: AuthService | DemoAuthService = env.demoAuth ? demoAuth : apiAuth

export function isDemoAuth(auth: AuthService | DemoAuthService): auth is DemoAuthService {
  return 'isDemo' in auth && auth.isDemo
}

export { ApiError, errorMessage } from './errors'
export type * from './contracts'
