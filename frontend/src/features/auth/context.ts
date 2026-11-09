import { createContext, useContext } from 'react'
import type { SessionUser } from '@/domain/types'
import type { DemoAuthService } from '@/services/mock/auth'
import type { Permission } from '@/domain/permissions'

export interface AuthContextValue {
  user: SessionUser | null
  /** True until the stored session has been checked on startup */
  initializing: boolean
  signIn(email: string, password: string): Promise<SessionUser>
  signOut(): Promise<void>
  can(permission: Permission): boolean
  /** Present only when development demo auth is enabled */
  demo: DemoAuthService | null
  /** Demo helpers that also refresh the session */
  signInAs(userId: string): Promise<SessionUser>
  signInWithPin(pin: string): Promise<SessionUser>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For screens that only render behind <RequireRole>, where a user is guaranteed. */
export function useSessionUser(): SessionUser {
  const { user } = useAuth()
  if (!user) throw new Error('useSessionUser called without a signed-in user')
  return user
}
