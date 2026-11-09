import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { env } from '@/config/env'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from './browser'

const UPDATE_CHECK_MS = 60 * 60_000
const UPDATE_TOAST = 'pwa-update'

/**
 * Registers the service worker and asks before switching to a new version, since reloading
 * mid-task would lose what someone is typing. Also checks for updates hourly, because
 * kiosks and shift phones keep the app open for days.
 */
export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) window.setInterval(() => void registration.update().catch(() => {}), UPDATE_CHECK_MS)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    toast.success('FactoryOps is ready to open without a connection.', { duration: 4000 })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  useEffect(() => {
    if (!needRefresh) return
    toast('A new version of FactoryOps is available', {
      id: UPDATE_TOAST,
      description: 'Finish what you are doing, then update. It takes a second.',
      duration: Infinity,
      icon: <RefreshCw className="size-4" />,
      action: { label: 'Update now', onClick: () => void updateServiceWorker(true) },
      cancel: { label: 'Later', onClick: () => setNeedRefresh(false) },
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}

/**
 * Thin bar under the app header while the device is offline. What still works depends on
 * where data lives: the demo keeps everything on the device; the API needs a connection.
 */
export function ConnectivityBanner({ className }: { className?: string }) {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-center text-xs font-medium text-white', className)}>
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      {env.dataSource === 'mock'
        ? "You're offline. The demo keeps working with data on this device."
        : "You're offline. Showing the last loaded data; changes can't be saved until you reconnect."}
    </div>
  )
}
