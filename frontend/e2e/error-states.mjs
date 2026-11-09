// Resilience: with the data API unreachable (a build using VITE_DATA_SOURCE=api before the API
// exists behaves like a full outage), every screen must show an error with a retry, never crash,
// go blank, or show a loading skeleton forever.
import { launch, report } from './lib.mjs'

const BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:4174'
const FAKE_ID = '00000000-0000-4000-8000-000000000000'
const ROUTES = {
  'Admin / Manager': ['/admin', '/admin/reports', '/admin/equipment', `/admin/equipment/${FAKE_ID}`, '/admin/equipment/new', '/admin/pm', '/admin/inventory', '/admin/organization', '/admin/users', '/admin/settings'],
  'Supervisor / Planner': ['/supervisor', '/supervisor/requests', '/supervisor/work-orders', `/supervisor/work-orders/${FAKE_ID}`, '/supervisor/board', '/supervisor/schedule', '/supervisor/technicians', '/supervisor/equipment'],
  Technician: ['/tech', '/tech/jobs', `/tech/jobs/${FAKE_ID}`, '/tech/history', '/tech/profile', `/tech/equipment/${FAKE_ID}`, '/tech/report'],
  'Operator / Requester': ['/operator', '/operator/report', '/operator/requests', `/operator/requests/${FAKE_ID}`],
}

const browser = await launch()
const errors = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const p = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

try {
  for (const [role, routes] of Object.entries(ROUTES)) {
    await p.goto(`${BASE}/login?switch=1`)
    await p.locator('div.rounded-lg.border', { hasText: role }).first().getByRole('button', { name: 'Enter' }).click()
    await p.waitForURL((u) => !u.pathname.startsWith('/login'))
    const problems = []
    for (const path of routes) {
      await p.goto(`${BASE}${path}`)
      // Failed requests are retried twice with back-off before the error shows
      const shown = await p.getByRole('alert').filter({ hasText: /Could not load|not connected/i }).first().waitFor({ timeout: 12000 }).then(() => true, () => false)
      const stillLoading = await p.locator('[aria-busy=true]').count()
      const blank = (await p.locator('main').innerText().catch(() => '')).trim().length === 0
      const retry = await p.getByRole('button', { name: 'Try again' }).count()
      if (!shown || blank || !retry) problems.push(`${path.replace(FAKE_ID, ':id')} (${!shown ? 'no error message' : ''}${blank ? ' blank' : ''}${!retry ? ' no retry' : ''}${stillLoading ? ` ${stillLoading} still loading` : ''})`)
    }
    check(`${role}: every screen explains the outage and offers a retry`, problems.length === 0, problems.join('; '))
  }
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
report(results, errors)
