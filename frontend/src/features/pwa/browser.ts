import { useSyncExternalStore } from 'react'

/*
 * Browser capabilities for the installed-app experience: connectivity and the install prompt.
 * Both are module-level so events fired before React mounts are not missed.
 */

// ── Connectivity ────────────────────────────────────────────────────────

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

// ── Install prompt (Chromium browsers; iOS uses Share → Add to Home Screen) ──

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Call once at startup, before the browser fires `beforeinstallprompt`. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

function subscribeInstall(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Returns an install action while the browser offers one, otherwise null. */
export function useInstallPrompt(): (() => Promise<boolean>) | null {
  const available = useSyncExternalStore(subscribeInstall, () => deferred !== null, () => false)
  if (!available) return null
  return async () => {
    const event = deferred
    if (!event) return false
    deferred = null
    notify()
    await event.prompt()
    return (await event.userChoice).outcome === 'accepted'
  }
}
