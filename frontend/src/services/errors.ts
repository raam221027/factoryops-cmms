export type ApiErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'network' | 'server'

/** Error shape every service implementation throws, so the UI handles mock and API failures alike. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status ?? STATUS_BY_CODE[code]
  }
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  network: 0,
  server: 500,
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
