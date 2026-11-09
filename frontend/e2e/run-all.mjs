// Builds the app twice (demo data, and API mode with no API to simulate an outage), serves both
// with `vite preview`, runs every end-to-end suite and prints a summary.
//
//   npm run e2e                       all suites
//   npm run e2e -- technician admin   selected suites
//   npm run e2e -- --no-build         reuse the previous builds
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SUITES = ['admin', 'supervisor', 'technician', 'operator', 'pwa-responsive', 'accessibility', 'error-states']
const args = process.argv.slice(2)
const skipBuild = args.includes('--no-build')
const selected = args.filter((a) => !a.startsWith('--'))
const unknown = selected.filter((s) => !SUITES.includes(s))
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(', ')}. Available: ${SUITES.join(', ')}`)
  process.exit(2)
}
const suites = selected.length ? selected : SUITES

const VARIANTS = [
  { name: 'demo', outDir: 'dist-e2e', port: 4173, env: { VITE_DEMO_AUTH: 'true', VITE_DATA_SOURCE: 'mock' } },
  { name: 'api-outage', outDir: 'dist-e2e-api', port: 4174, env: { VITE_DEMO_AUTH: 'true', VITE_DATA_SOURCE: 'api' } },
]

async function buildVariant(v) {
  const saved = Object.fromEntries(Object.keys(v.env).map((k) => [k, process.env[k]]))
  Object.assign(process.env, v.env)
  try {
    await build({ root: ROOT, logLevel: 'error', build: { outDir: v.outDir, emptyOutDir: true } })
  } finally {
    for (const [k, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[k]
      else process.env[k] = val
    }
  }
}

function runSuite(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [fileURLToPath(new URL(`./${name}.mjs`, import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ name, code, out, seconds: Math.round((Date.now() - started) / 1000) }))
  })
}

const servers = []
let failed = 0
try {
  if (!skipBuild) {
    for (const v of VARIANTS) {
      console.log(`Building ${v.name} → ${v.outDir}`)
      await buildVariant(v)
    }
  }
  for (const v of VARIANTS) {
    servers.push(await preview({ root: ROOT, logLevel: 'warn', build: { outDir: v.outDir }, preview: { port: v.port, strictPort: true } }))
  }
  console.log(`Serving demo on :4173 and API-outage build on :4174\n`)

  for (const name of suites) {
    const r = await runSuite(name)
    const passed = (r.out.match(/^PASS /gm) ?? []).length
    const failures = r.out.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('      ') || l.includes('[pageerror]') || l.includes('[console]'))
    const ok = r.code === 0
    if (!ok) failed++
    console.log(`${ok ? '✔' : '✘'} ${name.padEnd(15)} ${String(passed).padStart(3)} checks passed  (${r.seconds}s)`)
    for (const line of failures) console.log(`    ${line}`)
  }
} finally {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.httpServer.close(resolve))))
}
console.log(failed ? `\n${failed} suite(s) failed. Screenshots: e2e/screenshots/` : '\nAll suites passed.')
process.exit(failed ? 1 : 0)
