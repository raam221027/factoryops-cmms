import { LogOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { MobileShell } from '@/components/layout/MobileShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MOBILE_NAV } from '@/config/navigation'
import { useAuth } from '@/features/auth/context'
import { KIOSK_IDLE_SECONDS, KIOSK_WARNING_SECONDS } from '@/features/auth/kiosk'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/** Operator app frame. On a shared kiosk it adds a visible sign-out and an idle timeout. */
export function OperatorLayout() {
  const { kiosk } = useAuth()
  const signOut = useKioskSignOut()
  return (
    <>
      <MobileShell
        items={MOBILE_NAV.Operator ?? []}
        highlight="/operator/report"
        headerAction={
          kiosk && (
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut /> Done
            </Button>
          )
        }
      />
      {kiosk && <IdleGuard onTimeout={signOut} />}
    </>
  )
}

function useKioskSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return useCallback(async () => {
    await signOut()
    navigate('/login?mode=pin', { replace: true })
  }, [signOut, navigate])
}

/**
 * Signs the operator out after a period without interaction so the next person at the
 * kiosk does not report under the wrong name. Warns first with a countdown.
 */
function IdleGuard({ onTimeout }: { onTimeout: () => void }) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now()
    }
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, touch, { passive: true })
    const timer = window.setInterval(() => {
      const idle = (Date.now() - lastActivity.current) / 1000
      const left = Math.ceil(KIOSK_IDLE_SECONDS - idle)
      if (left <= 0) {
        window.clearInterval(timer)
        onTimeout()
      } else {
        setRemaining(left <= KIOSK_WARNING_SECONDS ? left : null)
      }
    }, 1000)
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, touch)
      window.clearInterval(timer)
    }
  }, [onTimeout])

  return (
    <Dialog
      open={remaining !== null}
      onOpenChange={(open) => {
        if (!open) {
          lastActivity.current = Date.now()
          setRemaining(null)
        }
      }}
    >
      <DialogContent size="sm" role="alertdialog">
        <DialogHeader>
          <DialogTitle>Are you still there?</DialogTitle>
          <DialogDescription aria-live="assertive">
            For the next person at this station, you will be signed out in <strong className="tabular-nums text-foreground">{remaining}</strong> seconds.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onTimeout}>
            Sign out now
          </Button>
          <Button
            size="lg"
            onClick={() => {
              lastActivity.current = Date.now()
              setRemaining(null)
            }}
          >
            I'm still here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
