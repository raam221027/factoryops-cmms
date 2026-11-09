import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hasPermission, type Permission } from '@/domain/permissions'
import type { SessionUser } from '@/domain/types'
import { ApiError, authService, isDemoAuth } from '@/services'
import { AuthContext, type AuthContextValue } from './context'
import { readKioskFlag, writeKioskDevice, writeKioskFlag } from './kiosk'

const demo = isDemoAuth(authService) ? authService : null

function requireDemo() {
  if (!demo) throw new ApiError('forbidden', 'Demo sign-in is disabled in this build.')
  return demo
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [kiosk, setKiosk] = useState(readKioskFlag)

  useEffect(() => {
    let cancelled = false
    authService
      .currentUser()
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setInitializing(false))
    return () => {
      cancelled = true
    }
  }, [])

  /** A new identity must never see cached data from the previous one. */
  const startSession = useCallback(
    (u: SessionUser, asKiosk = false) => {
      queryClient.clear()
      writeKioskFlag(asKiosk)
      writeKioskDevice(asKiosk)
      setKiosk(asKiosk)
      setUser(u)
      return u
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    await authService.signOut()
    queryClient.clear()
    writeKioskFlag(false)
    setKiosk(false)
    setUser(null)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      kiosk,
      demo,
      signIn: (email, password) => authService.signIn({ email, password }).then((u) => startSession(u)),
      signInAs: (userId) => requireDemo().signInAs(userId).then((u) => startSession(u)),
      signInWithPin: (pin) => requireDemo().signInWithPin(pin).then((u) => startSession(u, true)),
      signOut,
      can: (permission: Permission) => !!user && hasPermission(user.role, permission),
    }),
    [user, initializing, kiosk, startSession, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
