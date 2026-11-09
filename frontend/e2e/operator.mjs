// end-to-end check (operator + kiosk, phone viewport) against `vite preview` with VITE_DEMO_AUTH=true.
import { BASE, launch, report, shotsDir } from './lib.mjs'

const OUT = shotsDir('operator')
const browser = await launch()
const errors = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')

async function newPage(viewport = { width: 390, height: 844 }, clock = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  if (clock) await p.clock.install()
  p.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text().slice(0, 300)}`))
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  return p
}
async function pin(p, code) {
  await p.goto(`${BASE}/login?mode=pin&switch=1`)
  for (const d of code) await p.getByRole('button', { name: d, exact: true }).click()
  await p.waitForURL(/\/operator/)
  await p.waitForLoadState('networkidle')
}
async function switchTo(p, role) {
  await p.goto(`${BASE}/login?switch=1`)
  await p.locator('div.rounded-lg.border', { hasText: role }).first().getByRole('button', { name: 'Enter' }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
  await p.waitForLoadState('networkidle')
}
const visible = (loc, timeout = 5000) => loc.first().waitFor({ timeout }).then(() => true, () => false)
const toast = (p, text) => visible(p.locator('[data-sonner-toast]', { hasText: text }), 6000)
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('factoryops.demo-db')))
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const nav = (p, name) => p.locator('nav[aria-label=Main]').getByRole('link', { name }).click()
const next = (p) => p.getByRole('button', { name: /^Next/ })

try {
  const p = await newPage()
  await p.goto(`${BASE}/login?mode=pin`)
  check('kiosk tab preselected', (await p.getByRole('tab', { name: 'Operator kiosk' }).getAttribute('aria-selected')) === 'true')
  await pin(p, '1111')
  check('PIN sign-in lands on operator home', await visible(p.getByText('Report a problem')))
  check('kiosk "Done" sign-out visible', await p.getByRole('button', { name: 'Done' }).isVisible())
  await p.screenshot({ path: `${OUT}01-home.png`, fullPage: true })

  // ── Report: step 1 ────────────────────────────────────────────────
  await p.getByRole('link', { name: /Report a problem/ }).click()
  await p.getByText('Step 1 of 3').waitFor()
  check('next disabled without machine', await next(p).isDisabled())
  check('my area list shown', await visible(p.getByRole('region', { name: 'My area' })))
  await p.screenshot({ path: `${OUT}02-step1.png`, fullPage: true })
  await p.getByPlaceholder('Machine name or asset ID').fill('belt conveyor #2')
  await p.getByRole('radio').first().click()
  check('machine selected', await visible(p.getByRole('button', { name: 'Change machine' })))
  const state0 = await db(p)
  const machine = state0.equipment.find((e) => e.name === 'Belt Conveyor #2')
  await next(p).click()

  // ── Step 2 ─────────────────────────────────────────────────────────
  await p.getByText('Step 2 of 3').waitFor()
  check('next disabled without problem', await next(p).isDisabled())
  await p.getByRole('radio', { name: 'Abnormal noise' }).click()
  check('severity still required', await next(p).isDisabled())
  await p.getByRole('radio', { name: /Running, but badly/ }).click()
  await p.screenshot({ path: `${OUT}03-step2.png`, fullPage: true })
  await next(p).click()

  // ── Step 3 ─────────────────────────────────────────────────────────
  await p.getByText('Step 3 of 3').waitFor()
  await p.getByLabel(/What did you see/).fill('noisy')
  await p.getByRole('button', { name: 'Send report' }).click()
  check('short description rejected', await visible(p.getByText('Please describe the problem in a few words.')))
  await p.getByLabel(/What did you see/).fill('Loud squeal from the tail pulley when the belt starts.')
  const chooser = p.waitForEvent('filechooser')
  await p.getByRole('button', { name: 'Add photo' }).click()
  await (await chooser).setFiles({ name: 'noise.png', mimeType: 'image/png', buffer: PNG })
  check('photo attached', await visible(p.getByAltText('Photo 1')))
  await p.screenshot({ path: `${OUT}04-step3.png`, fullPage: true })
  await p.getByRole('button', { name: 'Send report' }).click()
  check('report sent', await visible(p.getByRole('heading', { name: 'Report sent' })))
  const number = (await p.locator('p.font-mono').first().textContent()).trim()
  check('kiosk confirmation offers sign out', await p.getByRole('button', { name: /Finish & sign out/ }).isVisible())
  await p.screenshot({ path: `${OUT}05-sent.png`, fullPage: true })
  let state = await db(p)
  const req = state.requests.find((r) => r.number === number)
  check('request stored with photo', req?.equipmentId === machine.id && req.attachments.length === 1 && req.severity === 'High', number)
  check('supervisors notified with deep link', state.notifications.some((n) => n.link === `/supervisor/requests?id=${req.id}`))

  // ── Duplicate warning ──────────────────────────────────────────────
  await p.getByRole('button', { name: 'Report another problem' }).click()
  await p.getByPlaceholder('Machine name or asset ID').fill('belt conveyor #2')
  await p.getByRole('radio').first().click()
  const dup = p.getByRole('status').filter({ hasText: 'Already reported' })
  check('duplicate warning shows my report', await visible(dup.filter({ hasText: number })), number)
  check('duplicate marked "by you"', await dup.getByText('by you').first().isVisible())

  // ── Leaving mid-report asks first ──────────────────────────────────
  await nav(p, 'My reports')
  check('discard prompt on leave', await visible(p.getByRole('dialog', { name: 'Discard this report?' })))
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  check('stays on report after cancel', /\/operator\/report/.test(p.url()))
  await nav(p, 'My reports')
  await p.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
  await p.waitForURL(/\/operator\/requests$/)
  check('discard leaves', true)

  // ── My reports / detail ────────────────────────────────────────────
  check('open list has report', await visible(p.getByRole('link', { name: new RegExp(number) })))
  await p.getByRole('link', { name: new RegExp(number) }).click()
  check('timeline: review is current', await visible(p.locator('[aria-current=step]', { hasText: 'Supervisor review' })))
  await p.screenshot({ path: `${OUT}06-detail-review.png`, fullPage: true })

  // ── Supervisor approves and assigns Daniel ─────────────────────────
  await p.setViewportSize({ width: 1280, height: 860 })
  await switchTo(p, 'Supervisor / Planner')
  await p.goto(`${BASE}/supervisor/requests?id=${req.id}`)
  const dlg = p.getByRole('dialog')
  await dlg.getByText('What the operator saw').waitFor()
  await dlg.locator('label:has(input[type=radio])', { hasText: 'Daniel Reyes' }).click()
  await dlg.getByRole('button', { name: /^Approve/ }).click()
  check('supervisor approved', await toast(p, 'Approved'))
  state = await db(p)
  const wo = state.workOrders.find((w) => w.requestId === req.id)

  // ── Operator sees technician assigned ──────────────────────────────
  await p.setViewportSize({ width: 390, height: 844 })
  await pin(p, '1111')
  await p.goto(`${BASE}/operator/requests/${req.id}`)
  check('timeline: technician assigned', await visible(p.getByText('Technician assigned: Daniel Reyes')))
  check('approval notification links to request', state.notifications.some((n) => n.title === 'Request approved' && n.link === `/operator/requests/${req.id}`))

  // ── Technician fixes it ────────────────────────────────────────────
  await switchTo(p, 'Technician')
  await p.goto(`${BASE}/tech/jobs/${wo.id}`)
  await p.getByRole('button', { name: 'Start job' }).click()
  await toast(p, 'Job started')
  await p.getByRole('button', { name: 'Complete' }).click()
  const c = p.getByRole('dialog')
  await c.getByLabel(/^Hours worked/).fill('0.75')
  await c.getByLabel(/^Root cause/).fill('Dry tail pulley bearing')
  await c.getByLabel(/^What did you do/).fill('Greased and replaced tail pulley bearing, tested.')
  await c.getByRole('button', { name: 'Complete job' }).click()
  check('technician completed', await toast(p, 'completed'))

  await pin(p, '1111')
  await p.goto(`${BASE}/operator/requests/${req.id}`)
  check('operator sees "Fixed"', await visible(p.getByText('Fixed').first()))
  await p.screenshot({ path: `${OUT}07-detail-fixed.png`, fullPage: true })
  state = await db(p)
  check('repair-complete notification to operator', state.notifications.some((n) => n.title === 'Repair completed' && n.link === `/operator/requests/${req.id}`))
  await nav(p, 'My reports')
  await p.getByRole('tab', { name: /Closed/ }).click()
  check('report moves to closed', await visible(p.getByRole('link', { name: new RegExp(number) })))

  // ── Critical report takes machine out of service ───────────────────
  await p.goto(`${BASE}/equipment/CNC-002`)
  await p.waitForURL(/\/operator\/report\?equipment=/)
  check('QR link opens report with machine', await visible(p.getByText('Step 2 of 3')))
  await p.getByRole('radio', { name: 'Electrical problem' }).click()
  await p.getByRole('radio', { name: /Machine stopped or unsafe/ }).click()
  await next(p).click()
  await p.getByLabel(/What did you see/).fill('Smoke and burning smell from the electrical cabinet.')
  await p.getByRole('button', { name: 'Send report' }).click()
  check('critical warning on confirmation', await visible(p.getByText('marked out of service')))
  state = await db(p)
  check('machine out of service', state.equipment.find((e) => e.assetId === 'CNC-002').status === 'OutOfService')

  // ── Kiosk finish & RBAC ────────────────────────────────────────────
  await p.getByRole('button', { name: /Finish & sign out/ }).click()
  await p.waitForURL(/\/login\?mode=pin/)
  check('finish & sign out returns to PIN pad', true)
  await pin(p, '2222')
  await p.goto(`${BASE}/supervisor`)
  await p.waitForLoadState('networkidle')
  check('operator blocked from /supervisor', !new URL(p.url()).pathname.startsWith('/supervisor'), p.url())

  // ── Phone layout ───────────────────────────────────────────────────
  for (const path of ['/operator', '/operator/report', '/operator/requests', `/operator/requests/${req.id}`]) {
    await p.goto(`${BASE}${path}`)
    await p.waitForLoadState('networkidle')
    await p.waitForTimeout(250)
    const o = await noScroll(p)
    check(`no page scroll at 390px: ${path.replace(/[0-9a-f-]{36}/, ':id')}`, o <= 0, `${o}px`)
  }
  await p.setViewportSize({ width: 320, height: 640 })
  await p.goto(`${BASE}/operator/report`)
  await p.waitForLoadState('networkidle')
  check('no page scroll at 320px: report', (await noScroll(p)) <= 0)

  // ── Technician reports from a machine ──────────────────────────────
  await p.setViewportSize({ width: 390, height: 844 })
  await switchTo(p, 'Technician')
  await p.goto(`${BASE}/tech/equipment/${machine.id}`)
  await p.getByRole('link', { name: /Report a new problem/ }).click()
  await p.getByText('Step 2 of 3').waitFor()
  await p.getByRole('radio', { name: 'Leakage' }).click()
  await p.getByRole('radio', { name: /Running normally/ }).click()
  await next(p).click()
  await p.getByLabel(/What did you see/).fill('Small oil drip from gearbox output seal.')
  await p.getByRole('button', { name: 'Send report' }).click()
  check('technician can report a fault', await visible(p.getByRole('heading', { name: 'Report sent' })))

  // ── Kiosk idle timeout (controlled clock) ──────────────────────────
  const k = await newPage(undefined, true)
  await pin(k, '3333')
  await k.clock.fastForward('01:17')
  check('idle warning appears', await visible(k.getByRole('alertdialog', { name: 'Are you still there?' })))
  await k.screenshot({ path: `${OUT}08-idle.png` })
  await k.getByRole('button', { name: "I'm still here" }).click()
  check('warning dismissed', await k.getByRole('alertdialog').isHidden())
  await k.goto(`${BASE}/operator/requests`)
  await k.waitForLoadState('networkidle')
  await k.clock.fastForward('01:35')
  await k.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {})
  check('idle sign-out shows PIN pad', await visible(k.getByRole('tab', { name: 'Operator kiosk', selected: true })), k.url())
  for (const d of '4444') await k.getByRole('button', { name: d, exact: true }).click()
  await k.waitForURL(/\/operator/)
  check('next operator starts at their home', new URL(k.url()).pathname === '/operator', k.url())
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
report(results, errors)
