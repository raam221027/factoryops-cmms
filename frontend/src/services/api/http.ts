import { env } from '@/config/env'
import { ApiError, type ApiErrorCode } from '../errors'

/*
 * HTTP client for the FactoryOps API. Endpoint implementations of the service contracts
 * will be added here as the backend exposes them.
 */

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  400: 'validation',
  422: 'validation',
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError('network', 'Cannot reach the server. Check your connection and try again.')
  }
  if (!response.ok) {
    // ASP.NET Core returns RFC 7807 problem details: { title, detail, errors }
    const problem = (await response.json().catch(() => null)) as { title?: string; detail?: string } | null
    throw new ApiError(CODE_BY_STATUS[response.status] ?? 'server', problem?.detail ?? problem?.title ?? response.statusText, response.status)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
