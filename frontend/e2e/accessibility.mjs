// Accessibility: axe-core (WCAG 2.1 A/AA) on every screen and key interactive states, plus
// keyboard checks (skip link, dialog focus handling, keyboard drag on the board).
import { createRequire } from 'node:module'
import { BASE, launch, report } from './lib.mjs'

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const browser = await launch()
const errors = []
const results = []
const violations = new Map() // rule id → { impact, help, screens:Set, sample }
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const visible = (loc, timeout = 6000) => loc.first().waitFor({ timeout }).then(() => true, () => false)

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const p = await ctx.newPage()
p.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text().slice(0, 200)}`))
p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

async function enter(role) {
  await p.goto(`${BASE}/login?switch=1`)
  await p.locator('div.rounded-lg.border', { hasText: role }).first().getByRole('button', { name: 'Enter' }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
  await p.waitForLoadState('networkidle')
}

let scanned = 0
async function scan(label) {
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(250)
  if (!(await p.evaluate(() => 'axe' in window))) await p.addScriptTag({ path: AXE })
  const found = await p.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, target: v.nodes[0]?.target.join(' '), count: v.nodes.length }))
  }, TAGS)
  scanned++
  for (const v of found) {
    const entry = violations.get(v.id) ?? { impact: v.impact, help: v.help, screens: new Set(), sample: v.target }
    entry.screens.add(label)
    violations.set(v.id, entry)
  }
}

async function visit(path, label = path) {
  await p.goto(`${BASE}${path}`)
  await scan(label.replace(/[0-9a-f-]{36}/g, ':id'))
}

try {
  // ── Sign-in screens ─────────────────────────────────────────────────
  await p.goto(`${BASE}/login`)
  await scan('login: demo accounts')
  await p.getByRole('tab', { name: 'Operator kiosk' }).click()
  await scan('login: kiosk PIN')
  await p.getByRole('tab', { name: 'Email sign-in' }).click()
  await scan('login: email')

  await enter('Admin / Manager')
  const db = await p.evaluate(() => JSON.parse(localStorage.getItem('factoryops.demo-db')))
  const daniel = db.users.find((u) => u.email === 'daniel.reyes@northwind.example')
  const carlos = db.users.find((u) => u.email === 'carlos.mendoza@northwind.example')
  const eq = db.equipment[0]
  const live = db.workOrders.find((w) => w.assigneeId === daniel.id && w.status === 'InProgress')
  const submitted = db.requests.find((r) => r.status === 'Submitted')
  const myReq = db.requests.find((r) => r.requestedById === carlos.id)

  // ── Admin ───────────────────────────────────────────────────────────
  for (const path of ['/admin', '/admin/reports', '/admin/equipment', `/admin/equipment/${eq.id}`, '/admin/equipment/new', '/admin/pm', '/admin/inventory', '/admin/organization', '/admin/users', '/admin/settings']) await visit(path)
  await p.goto(`${BASE}/admin/pm`)
  await p.getByRole('button', { name: /New schedule/ }).click()
  await scan('admin: PM schedule dialog')
  await p.keyboard.press('Escape')

  // ── Supervisor ──────────────────────────────────────────────────────
  await enter('Supervisor / Planner')
  for (const path of ['/supervisor', '/supervisor/requests', '/supervisor/work-orders', `/supervisor/work-orders/${live.id}`, '/supervisor/board', '/supervisor/schedule', '/supervisor/technicians', '/supervisor/equipment']) await visit(path)
  await visit(`/supervisor/requests?id=${submitted.id}`, 'supervisor: request review dialog')
  await p.goto(`${BASE}/supervisor/work-orders`)
  await p.getByRole('button', { name: 'New work order' }).click()
  await scan('supervisor: work order form')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /^Notifications/ }).click()
  await scan('notifications menu')
  await p.keyboard.press('Escape')

  // ── Technician & operator (phone) ───────────────────────────────────
  await p.setViewportSize({ width: 390, height: 844 })
  await enter('Technician')
  for (const path of ['/tech', '/tech/jobs', `/tech/jobs/${live.id}`, '/tech/scan', '/tech/history', '/tech/profile', `/tech/equipment/${eq.id}`]) await visit(path)
  await p.goto(`${BASE}/tech/jobs/${live.id}`)
  await p.getByRole('button', { name: 'Complete' }).click()
  await scan('technician: complete sheet')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Pause' }).click()
  await scan('technician: pause sheet')
  await p.keyboard.press('Escape')

  await enter('Operator / Requester')
  for (const path of ['/operator', '/operator/requests', `/operator/requests/${myReq.id}`]) await visit(path)
  await p.goto(`${BASE}/operator/report`)
  await scan('operator: report step 1')
  await p.getByPlaceholder('Machine name or asset ID').fill('conveyor')
  await p.getByRole('radio').first().click()
  await p.getByRole('button', { name: /^Next/ }).click()
  await scan('operator: report step 2')
  await p.getByRole('radio', { name: 'Leakage' }).click()
  await p.getByRole('radio', { name: /Minor/ }).click()
  await p.getByRole('button', { name: /^Next/ }).click()
  await scan('operator: report step 3')

  check(`axe WCAG 2.1 AA: no violations on ${scanned} screens/states`, violations.size === 0, [...violations.keys()].join(', '))
  for (const [id, v] of violations) results.push(`      ${id} (${v.impact}): ${v.help} — e.g. ${v.sample} — on ${[...v.screens].slice(0, 4).join(', ')}${v.screens.size > 4 ? ` +${v.screens.size - 4} more` : ''}`)

  // ── Keyboard ────────────────────────────────────────────────────────
  await p.setViewportSize({ width: 1280, height: 860 })
  await enter('Supervisor / Planner')
  await p.goto(`${BASE}/supervisor/work-orders`)
  await p.waitForLoadState('networkidle')
  await p.keyboard.press('Tab')
  check('skip link is the first tab stop', (await p.evaluate(() => document.activeElement?.textContent?.trim())) === 'Skip to content')

  const trigger = p.getByRole('button', { name: 'New work order' })
  await trigger.focus()
  await p.keyboard.press('Enter')
  check('dialog takes focus', await p.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))
  for (let i = 0; i < 40; i++) await p.keyboard.press('Tab')
  check('focus stays inside the dialog', await p.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))
  await p.keyboard.press('Escape')
  check('Escape closes and focus returns to the trigger', (await p.getByRole('dialog').count()) === 0 && (await p.evaluate(() => document.activeElement?.textContent?.includes('New work order'))))

  await p.goto(`${BASE}/supervisor/board`)
  const card = p.locator('section[aria-label^="Assigned,"] [aria-roledescription="draggable"]').first()
  await card.waitFor()
  const label = await card.getAttribute('aria-label')
  await card.focus()
  await p.keyboard.press('Space')
  // One column is ~260px and each key press moves 25px; pace the keys like a person would
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('ArrowLeft')
    await p.waitForTimeout(50)
  }
  check('drag announces the column by name', await visible(p.locator('[id^=DndLiveRegion]', { hasText: 'is over Pending' })))
  await p.keyboard.press('Space')
  check('board card moves with the keyboard', await visible(p.locator(`section[aria-label^="Pending,"] [aria-label="${label}"]`)), label)
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
report(results, errors)
