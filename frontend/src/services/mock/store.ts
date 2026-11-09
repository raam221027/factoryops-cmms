import { hasPermission, type Permission } from '@/domain/permissions'
import type { User } from '@/domain/types'
import { createSeed } from '@/mocks/seed'
import { ApiError } from '../errors'
import { DEMO_DB_VERSION, type DemoDb } from './schema'

/*
 * In-browser demo database. Lives in memory and is mirrored to localStorage so demo changes
 * survive a reload. Every read returns a copy so UI code can never mutate the store directly.
 */

const STORAGE_KEY = 'factoryops.demo-db'
const SESSION_KEY = 'factoryops.demo-session'

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb
      if (parsed.version === DEMO_DB_VERSION) return parsed
    }
  } catch {
    // storage unavailable or corrupt: fall through to a fresh seed
  }
  return createSeed()
}

let db: DemoDb = load()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // quota exceeded or storage blocked: keep working in memory
  }
}

export function resetDemoData() {
  db = createSeed()
  persist()
}

/** Simulated network latency so loading states behave as they will against the API. */
export function latency(ms = 120 + Math.random() * 180): Promise<void> {
  // Unit tests run the demo services without the artificial delay.
  if (import.meta.env.MODE === 'test') return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function read<T>(fn: (db: DemoDb) => T): Promise<T> {
  await latency()
  return structuredClone(fn(db))
}

export async function write<T>(fn: (db: DemoDb) => T): Promise<T> {
  await latency()
  const result = fn(db)
  persist()
  return structuredClone(result)
}

// ── Session (who is calling) ───────────────────────────────────────────────

export function getSessionUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return memorySession
  }
}

let memorySession: string | null = null

export function setSessionUserId(userId: string | null) {
  memorySession = userId
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // in-memory session only
  }
}

/** The calling user, as an API would resolve it from the bearer token. */
export function actor(d: DemoDb): User {
  const id = getSessionUserId()
  const user = id ? d.users.find((u) => u.id === id && u.active) : undefined
  if (!user) throw new ApiError('unauthorized', 'Your session has expired. Please sign in again.')
  return user
}

/** Server-side style authorization check, so the demo behaves like the real API would. */
export function authorize(d: DemoDb, ...anyOf: Permission[]): User {
  const user = actor(d)
  if (!anyOf.some((p) => hasPermission(user.role, p))) {
    throw new ApiError('forbidden', 'You do not have permission to perform this action.')
  }
  return user
}

export function findOrThrow<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((x) => x.id === id)
  if (!item) throw new ApiError('not_found', `${label} not found`)
  return item
}
