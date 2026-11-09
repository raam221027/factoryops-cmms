import type { SessionUser, User } from '@/domain/types'
import { DEMO_OPERATOR_PINS } from '@/mocks/demoAccounts'
import type { AuthService } from '../contracts'
import { ApiError } from '../errors'
import { getSessionUserId, read, resetDemoData, setSessionUserId, write } from './store'

/*
 * DEVELOPMENT ONLY. Signs in as any seeded user without a password so every role experience
 * can be previewed. Production builds use the API auth service instead (see services/index.ts).
 */

const toSession = (u: User): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  title: u.title,
  organizationId: u.organizationId,
})

export interface DemoAuthService extends AuthService {
  readonly isDemo: true
  listAccounts(): Promise<SessionUser[]>
  signInAs(userId: string): Promise<SessionUser>
  signInWithPin(pin: string): Promise<SessionUser>
  resetData(): Promise<void>
}

export const demoAuth: DemoAuthService = {
  isDemo: true,

  currentUser: () =>
    read((d) => {
      const id = getSessionUserId()
      const u = id ? d.users.find((x) => x.id === id && x.active) : undefined
      return u ? toSession(u) : null
    }),

  signIn: async () => {
    throw new ApiError('unauthorized', 'Password sign-in needs the FactoryOps API. In demo mode, choose a demo account below.')
  },

  signOut: async () => {
    setSessionUserId(null)
  },

  listAccounts: () => read((d) => d.users.filter((u) => u.active).map(toSession)),

  signInAs: (userId) =>
    write((d) => {
      const u = d.users.find((x) => x.id === userId && x.active)
      if (!u) throw new ApiError('unauthorized', 'This account is not available.')
      u.lastActiveAtUtc = new Date().toISOString()
      setSessionUserId(u.id)
      return toSession(u)
    }),

  signInWithPin: (pin) =>
    write((d) => {
      const email = Object.entries(DEMO_OPERATOR_PINS).find(([, p]) => p === pin)?.[0]
      const u = email ? d.users.find((x) => x.email === email && x.active) : undefined
      if (!u) throw new ApiError('unauthorized', 'PIN not recognised. Try again.')
      setSessionUserId(u.id)
      return toSession(u)
    }),

  resetData: async () => {
    resetDemoData()
    setSessionUserId(null)
  },
}
