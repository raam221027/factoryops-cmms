/*
 * DEVELOPMENT ONLY. Demo sign-in data used by the demo auth adapter.
 * These are not credentials and never reach a real backend.
 */

export const DEMO_PRIMARY_TECHNICIAN_EMAIL = 'daniel.reyes@northwind.example'

/** Kiosk PINs for demo operator accounts, keyed by email. */
export const DEMO_OPERATOR_PINS: Record<string, string> = {
  'carlos.mendoza@northwind.example': '1111',
  'hannah.weber@northwind.example': '2222',
  'kenji.sato@northwind.example': '3333',
  'fatima.diallo@northwind.example': '4444',
}
