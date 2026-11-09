// PWA (manifest, service worker, offline, update prompt) and a responsive sweep of every
// screen of every role at six viewport sizes. Runs against `vite preview` with VITE_DEMO_AUTH=true.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { BASE, DIST, launch, report, shotsDir } from './lib.mjs'

const OUT = shotsDir('pwa-responsive')
const browser = await launch()
const errors = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const visible = (loc, timeout = 6000) => loc.first().waitFor({ timeout }).then(() => true, () => false)
const watch = (p) => {
  p.on('console', (m) => m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) && errors.push(`[console] ${m.text().slice(0, 200)}`))
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
}
async function enter(p, role) {
  await p.goto(`${BASE}/login?switch=1`)
  await p.locator('div.rounded-lg.border', { hasText: role }).first().getByRole('button', { name: 'Enter' }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
  await p.waitForLoadState('networkidle')
}
const swOriginal = readFileSync(DIST + 'sw.js', 'utf8')

try {
  // ── Manifest & icons ────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  watch(p)
  await p.goto(`${BASE}/login`)
  // First visit installs the service worker and announces offline readiness
  check('offline-ready message on first visit', await visible(p.locator('[data-sonner-toast]', { hasText: 'ready to open without a connection' }), 10000))
  const manifestHref = await p.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await p.request.get(BASE + manifestHref)).json()
  check('manifest linked and valid', manifest.display === 'standalone' && manifest.start_url === '/' && manifest.name === 'FactoryOps CMMS')
  const iconChecks = await Promise.all(
    manifest.icons.map(async (i) => {
      const r = await p.request.get(BASE + i.src)
      const buf = await r.body()
      const w = buf.readUInt32BE(16)
      return r.ok() && `${w}x${w}` === i.sizes
    }),
  )
  check('manifest icons exist at declared sizes', iconChecks.every(Boolean), `${iconChecks.length} icons`)
  check('maskable icon provided', manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'))
  check('apple touch icon', (await p.request.get(`${BASE}/icons/apple-touch-icon.png`)).ok())

  // ── Service worker ──────────────────────────────────────────────────
  await enter(p, 'Technician')
  const controlled = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return !!reg.active
  })
  check('service worker active', controlled)
  await p.reload()
  await p.waitForLoadState('networkidle')
  check('page controlled by service worker', await p.evaluate(() => !!navigator.serviceWorker.controller))
  // Visit the job screens once online so their chunks are known to be cached by precache
  await p.goto(`${BASE}/tech/jobs`)
  await p.locator('a[href^="/tech/jobs/"]').first().waitFor()

  // ── Offline ─────────────────────────────────────────────────────────
  await ctx.setOffline(true)
  await p.reload()
  check('app opens offline', await visible(p.getByRole('heading', { name: 'My jobs' })))
  check('offline banner shown', await visible(p.getByRole('status').filter({ hasText: "You're offline" })))
  await p.locator('nav[aria-label=Main]').getByRole('link', { name: 'History' }).click()
  check('navigate to an unvisited screen offline', await visible(p.getByRole('heading', { name: 'My history' })))
  await p.locator('a[href^="/tech/jobs/"]').first().click()
  check('job detail offline (demo data on device)', await visible(p.getByText('Notes & activity')))
  await p.screenshot({ path: `${OUT}01-offline.png` })
  await p.goto(`${BASE}/tech/scan`).catch(() => {})
  check('deep link offline served from cache', await visible(p.getByRole('heading', { name: 'Scan equipment' })))
  await ctx.setOffline(false)
  check('banner clears when back online', await p.getByRole('status').filter({ hasText: "You're offline" }).isHidden({ timeout: 3000 }).catch(() => false) || (await p.getByRole('status').filter({ hasText: "You're offline" }).count()) === 0)

  // ── Update prompt ───────────────────────────────────────────────────
  appendFileSync(DIST + 'sw.js', `\n// test build ${Date.now()}\n`)
  await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
  check('update prompt appears for a new version', await visible(p.locator('[data-sonner-toast]', { hasText: 'A new version of FactoryOps is available' }), 15000))
  await p.screenshot({ path: `${OUT}02-update.png` })
  await p.getByRole('button', { name: 'Update now' }).click()
  await p.waitForLoadState('load')
  await p.waitForTimeout(1500)
  check('update applied and page reloaded', (await p.locator('[data-sonner-toast]', { hasText: 'A new version' }).count()) === 0)
  writeFileSync(DIST + 'sw.js', swOriginal)
  await ctx.close()

  // ── Responsive sweep ────────────────────────────────────────────────
  const VIEWPORTS = [
    { name: 'phone-320', width: 320, height: 640, mobile: true },
    { name: 'phone-390', width: 390, height: 844, mobile: true },
    { name: 'phone-landscape', width: 844, height: 390, mobile: true },
    { name: 'tablet-768', width: 768, height: 1024, mobile: true },
    { name: 'tablet-1024', width: 1024, height: 768, mobile: true },
    { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  ]
  const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  watch(s)
  await enter(s, 'Admin / Manager')
  const db = await s.evaluate(() => JSON.parse(localStorage.getItem('factoryops.demo-db')))
  const tech = db.users.find((u) => u.email === 'daniel.reyes@northwind.example')
  const carlos = db.users.find((u) => u.email === 'carlos.mendoza@northwind.example')
  const techJob = db.workOrders.find((w) => w.assigneeId === tech.id)
  const anyWo = db.workOrders[0]
  const eq = db.equipment[0]
  const myReq = db.requests.find((r) => r.requestedById === carlos.id)
  const ROUTES = {
    'Admin / Manager': ['/admin', '/admin/reports', '/admin/equipment', `/admin/equipment/${eq.id}`, `/admin/equipment/${eq.id}/edit`, '/admin/pm', '/admin/inventory', '/admin/organization', '/admin/users', '/admin/settings'],
    'Supervisor / Planner': ['/supervisor', '/supervisor/requests', '/supervisor/work-orders', `/supervisor/work-orders/${anyWo.id}`, '/supervisor/board', '/supervisor/schedule', '/supervisor/technicians', '/supervisor/equipment', `/supervisor/equipment/${eq.id}`],
    Technician: ['/tech', '/tech/jobs', `/tech/jobs/${techJob.id}`, '/tech/scan', '/tech/history', '/tech/profile', `/tech/equipment/${eq.id}`, '/tech/report'],
    'Operator / Requester': ['/operator', '/operator/report', '/operator/requests', `/operator/requests/${myReq.id}`],
  }
  let screens = 0
  for (const [role, routes] of Object.entries(ROUTES)) {
    const overflow = []
    if (role !== 'Admin / Manager') await enter(s, role)
    for (const vp of VIEWPORTS) {
      await s.setViewportSize({ width: vp.width, height: vp.height })
      for (const path of routes) {
        await s.goto(`${BASE}${path}`)
        await s.waitForLoadState('networkidle')
        await s.waitForTimeout(150)
        screens++
        const o = await s.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (o > 0) overflow.push(`${vp.name} ${path.replace(/[0-9a-f-]{36}/, ':id')} +${o}px`)
      }
    }
    check(`${role}: no horizontal page scroll at 6 sizes`, overflow.length === 0, overflow.join('; '))
  }
  check('screens swept', screens > 150, `${screens} screen renders`)

  // Desktop shell switches to the drawer below lg
  await enter(s, 'Supervisor / Planner')
  await s.setViewportSize({ width: 768, height: 1024 })
  await s.goto(`${BASE}/supervisor`)
  await s.getByRole('button', { name: 'Open navigation' }).click()
  check('tablet: navigation drawer opens', await visible(s.getByRole('dialog').getByRole('link', { name: 'Board', exact: true })))
  await s.getByRole('dialog').getByRole('link', { name: 'Board', exact: true }).click()
  await s.waitForURL(/\/supervisor\/board$/)
  check('tablet: drawer closes after navigating', await s.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false))
  await s.screenshot({ path: `${OUT}03-tablet-board.png` })
  await s.setViewportSize({ width: 844, height: 390 })
  await enter(s, 'Technician')
  await s.goto(`${BASE}/tech/jobs/${techJob.id}`)
  await s.waitForLoadState('networkidle')
  await s.screenshot({ path: `${OUT}04-phone-landscape-job.png` })
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  writeFileSync(DIST + 'sw.js', swOriginal)
  await browser.close()
}
report(results, errors)
