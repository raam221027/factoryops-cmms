/*
 * Kiosk sessions: an operator signed in with a PIN on a shared device. The flag lives in
 * sessionStorage so it ends with the browser tab, and drives automatic sign-out.
 */

const KEY = 'factoryops.kiosk'

export function readKioskFlag(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeKioskFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: kiosk behaviour lasts for this page load only
  }
}

const DEVICE_KEY = 'factoryops.kiosk-device'

/**
 * Whether this browser is a shared kiosk, remembered across sign-outs so the login screen
 * opens on the PIN pad for the next operator. Set by PIN sign-in, cleared by any other.
 */
export function readKioskDevice(): boolean {
  try {
    return localStorage.getItem(DEVICE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeKioskDevice(on: boolean) {
  try {
    if (on) localStorage.setItem(DEVICE_KEY, '1')
    else localStorage.removeItem(DEVICE_KEY)
  } catch {
    // storage blocked: the login screen falls back to its default tab
  }
}

/** Seconds of inactivity before a kiosk session signs itself out. */
export const KIOSK_IDLE_SECONDS = 90
/** Seconds of warning shown before that happens. */
export const KIOSK_WARNING_SECONDS = 15
