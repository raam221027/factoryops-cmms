// end-to-end check against `vite preview` (production build with VITE_DEMO_AUTH=true).
import { BASE, launch, report, shotsDir } from './lib.mjs'

const OUT = shotsDir('admin')
const browser = await launch()
const errors = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text().slice(0, 300)}`))
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  return p
}
async function login(p, role) {
  await p.goto(`${BASE}/login`)
  await p.locator('div.rounded-lg.border', { hasText: role }).first().getByRole('button', { name: 'Enter' }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
  await p.waitForLoadState('networkidle')
}
const toast = (p, text) => p.locator('[data-sonner-toast]', { hasText: text }).first().waitFor({ timeout: 5000 }).then(() => true, () => false)

try {
  const p = await newPage({ width: 1440, height: 900 })
  await login(p, 'Admin / Manager')
  await p.locator('.recharts-surface').nth(4).waitFor({ timeout: 10000 })
  check('dashboard renders charts', (await p.locator('.recharts-surface').count()) >= 5, `${await p.locator('.recharts-surface').count()} charts`)
  check('dashboard KPIs', await p.getByText('PM compliance').first().isVisible())
  await p.screenshot({ path: `${OUT}01-dashboard.png`, fullPage: true })

  // Create equipment
  await p.goto(`${BASE}/admin/equipment/new`)
  await p.getByLabel('Name').fill('Test Coolant Pump #9')
  await p.getByLabel('Category').selectOption({ label: 'Pump' })
  await p.getByLabel('Serial number').fill('TST-000123')
  await p.getByLabel('Department').selectOption({ label: 'Machining (P1)' })
  await p.getByLabel('Production area').selectOption({ label: 'CNC Cell A' })
  await p.getByRole('button', { name: 'Register equipment' }).click()
  await p.waitForURL(/\/admin\/equipment\/[0-9a-f-]{36}$/)
  const assetId = (await p.locator('h1 + p .font-mono').first().textContent())?.trim()
  check('equipment created', !!assetId && assetId.startsWith('PMP-'), assetId)
  await p.locator('[aria-label^="QR code for"] svg').waitFor()
  check('QR code rendered', true)
  await p.screenshot({ path: `${OUT}02-equipment-detail.png`, fullPage: true })

  // Validation: empty form shows errors
  await p.goto(`${BASE}/admin/equipment/new`)
  await p.getByRole('button', { name: 'Register equipment' }).click()
  check('form validation messages', await p.getByText('Enter the equipment name').isVisible())

  await p.goto(`${BASE}/admin/equipment`)
  await p.getByPlaceholder('Search name, asset ID, serial…').fill('Test Coolant')
  check('new equipment in list', await p.getByRole('cell', { name: assetId }).waitFor({ timeout: 5000 }).then(() => true, () => false))

  // QR deep link
  await p.goto(`${BASE}/equipment/${assetId}`)
  await p.waitForURL(/\/admin\/equipment\/[0-9a-f-]{36}$/)
  check('QR deep link resolves for admin', true)

  // PM schedule + generate work order
  await p.goto(`${BASE}/admin/pm`)
  await p.getByRole('button', { name: 'New schedule' }).click()
  await p.getByRole('dialog').getByLabel(/^Name/).fill('Monthly PM — Test Coolant Pump #9')
  await p.getByRole('dialog').getByLabel(/^Equipment/).selectOption({ label: `${assetId} · Test Coolant Pump #9` })
  await p.getByRole('dialog').getByLabel('Checklist item 1').fill('Inspect seal for leakage')
  await p.getByRole('button', { name: 'Create schedule' }).click()
  check('PM schedule created', await toast(p, 'Schedule created'))
  await p.getByPlaceholder('Search schedule or equipment…').fill('Test Coolant')
  await p.getByRole('button', { name: 'Actions for Monthly PM — Test Coolant Pump #9' }).click()
  await p.getByRole('menuitem', { name: 'Generate work order' }).click()
  check('PM work order generated', await toast(p, 'WO-'))
  await p.getByRole('tab', { name: 'Calendar' }).click()
  await p.screenshot({ path: `${OUT}03-pm-calendar.png`, fullPage: true })

  // Inventory receipt
  await p.goto(`${BASE}/admin/inventory`)
  const firstRow = p.locator('tbody tr').first()
  const before = (await firstRow.locator('td').nth(3).textContent())?.trim()
  await firstRow.getByRole('button', { name: 'Stock' }).click()
  await p.getByLabel(/Quantity/).fill('5')
  await p.getByLabel('Reference / note').fill('PO-TEST-1')
  await p.getByRole('button', { name: 'Record movement' }).click()
  await toast(p, 'on hand')
  const after = (await firstRow.locator('td').nth(3).textContent())?.trim()
  check('stock receipt updates quantity', before !== after, `${before} -> ${after}`)
  await p.getByRole('tab', { name: 'Stock movements' }).click()
  check('receipt in movement history', await p.getByRole('cell', { name: 'PO-TEST-1' }).waitFor({ timeout: 5000 }).then(() => true, () => false))

  // Reports + CSV export
  await p.goto(`${BASE}/admin/reports`)
  const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export CSV' }).click()])
  check('CSV export downloads', download.suggestedFilename().endsWith('.csv'), download.suggestedFilename())
  for (const tab of ['Downtime', 'MTTR', 'Maintenance cost', 'PM compliance', 'Technician performance', 'Equipment reliability']) {
    await p.getByRole('tab', { name: tab }).click()
    await p.waitForTimeout(150)
  }
  check('all report tabs render', (await p.locator('table').count()) > 0)
  await p.screenshot({ path: `${OUT}04-reports-reliability.png`, fullPage: true })

  // Settings persist
  await p.goto(`${BASE}/admin/settings`)
  await p.getByLabel('Labor rate (USD/h)').fill('52')
  await p.getByRole('button', { name: 'Save settings' }).click()
  await toast(p, 'Settings saved')
  await p.reload()
  check('settings persist after reload', (await p.getByLabel('Labor rate (USD/h)').inputValue()) === '52')

  // Organization: add production area
  await p.goto(`${BASE}/admin/organization`)
  await p.getByRole('tab', { name: 'Production areas' }).click()
  await p.getByRole('button', { name: 'Add production area' }).click()
  await p.getByRole('dialog').getByLabel(/^Name/).fill('Assembly Line 3')
  await p.getByRole('dialog').getByLabel(/^Code/).fill('p1-al3')
  await p.getByRole('dialog').getByLabel(/^Department/).selectOption({ label: 'Assembly (P1)' })
  await p.getByRole('button', { name: 'Save' }).click()
  check('production area added', await toast(p, 'Production area added'))

  // Users: deactivate an operator
  await p.goto(`${BASE}/admin/users`)
  await p.getByRole('button', { name: 'Actions for Hannah Weber' }).click()
  await p.getByRole('menuitem', { name: 'Deactivate' }).click()
  await p.getByRole('button', { name: 'Deactivate', exact: true }).click()
  check('user deactivated', await toast(p, 'deactivated'))
  await p.getByRole('cell', { name: /Elena Petrova/ }).first().click()
  check('user activity dialog', await p.getByText('Recent activity').isVisible())
  await p.screenshot({ path: `${OUT}05-user-detail.png` })
  await p.keyboard.press('Escape')

  // Labels print view
  await p.goto(`${BASE}/admin/equipment`)
  await p.getByRole('checkbox', { name: 'Select row' }).nth(0).check()
  await p.getByRole('checkbox', { name: 'Select row' }).nth(1).check()
  await p.getByRole('button', { name: /QR labels \(2\)/ }).click()
  await p.locator('[aria-label^="QR code for"] svg').nth(1).waitFor()
  check('label sheet renders 2 labels', (await p.locator('[aria-label^="QR code for"]').count()) === 2)
  await p.screenshot({ path: `${OUT}06-labels.png` })

  // Role guard
  const s = await newPage({ width: 1280, height: 800 })
  await login(s, 'Supervisor / Planner')
  await s.goto(`${BASE}/admin/users`)
  await s.waitForTimeout(500)
  check('supervisor blocked from /admin', new URL(s.url()).pathname === '/supervisor', s.url())

  // Responsive
  const t = await newPage({ width: 820, height: 1180 })
  await login(t, 'Admin / Manager')
  await t.locator('.recharts-surface').first().waitFor()
  await t.screenshot({ path: `${OUT}07-tablet-dashboard.png`, fullPage: true })
  const m = await newPage({ width: 390, height: 844 })
  await login(m, 'Admin / Manager')
  await m.goto(`${BASE}/admin/equipment`)
  await m.locator('tbody tr').first().waitFor()
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('phone: no page-level horizontal scroll', overflow <= 0, `${overflow}px`)
  await m.screenshot({ path: `${OUT}08-phone-equipment.png`, fullPage: true })
  await m.goto(`${BASE}/admin`)
  await m.locator('.recharts-surface').first().waitFor()
  await m.screenshot({ path: `${OUT}09-phone-dashboard.png`, fullPage: true })
} catch (e) {
  check('script completed', false, e.message.split('\n')[0])
}

await browser.close()
report(results, errors)
