// Shared setup for the end-to-end suites. They run against a demo build served by `vite preview`
// (see run-all.mjs) and drive the installed Google Chrome through playwright-core.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
/** Build output the suites run against (the PWA suite edits sw.js there to simulate an update). */
export const DIST = fileURLToPath(new URL('../dist-e2e/', import.meta.url))

/** Launches Chrome: CHROME_PATH if set, otherwise the installed stable channel. */
export function launch() {
  return process.env.CHROME_PATH ? chromium.launch({ executablePath: process.env.CHROME_PATH }) : chromium.launch({ channel: 'chrome' })
}

/** Screenshot folder for a suite, under e2e/screenshots (git-ignored). */
export function shotsDir(name) {
  const dir = fileURLToPath(new URL(`./screenshots/${name}/`, import.meta.url))
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Prints results and sets the exit code so the runner can tell pass from fail. */
export function report(results, errors) {
  console.log(results.join('\n'))
  console.log(errors.length ? `\nConsole errors:\n${[...new Set(errors)].join('\n')}` : '\nNo console errors')
  if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1
}
