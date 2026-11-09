export type DataSource = 'mock' | 'api'

const rawSource = import.meta.env.VITE_DATA_SOURCE as string | undefined

export const env = {
  dataSource: (rawSource === 'api' ? 'api' : 'mock') as DataSource,
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
  /**
   * Demo sign-in is on by default in development and must be opted into explicitly
   * for any other build. It is never a substitute for backend authentication.
   */
  demoAuth:
    import.meta.env.VITE_DEMO_AUTH === 'true' || (import.meta.env.DEV && import.meta.env.VITE_DEMO_AUTH !== 'false'),
} as const
