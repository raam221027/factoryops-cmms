// end-to-end check (technician, phone viewport) against `vite preview` with VITE_DEMO_AUTH=true.
import { BASE, launch, report, shotsDir } from './lib.mjs'

const OUT = shotsDir('technician')
const browser = await launch()
const errors = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
// 8x8 red PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true })
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
const toast = (p, text) => p.locator('[data-sonner-toast]', { hasText: text }).first().waitFor({ timeout: 6000 }).then(() => true, () => false)
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('factoryops.demo-db')))
const session = (p) => p.evaluate(() => localStorage.getItem('factoryops.demo-session'))
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

try {
  const p = await newPage({ width: 390, height: 844 })
  await login(p, 'Technician')
  await p.getByRole('heading', { level: 1 }).waitFor()
  await p.getByText(/^Today/).first().waitFor()
  check('home loads', await p.getByRole('link', { name: 'Scan' }).first().isVisible())
  check('bottom nav has 5 items', (await p.locator('nav[aria-label=Main] a').count()) === 5)
  await p.locator('a[href^="/tech/jobs/"]').first().waitFor()
  await p.screenshot({ path: `${OUT}01-home.png`, fullPage: true })
  {
    const seed = await db(p)
    const now = new Date(Date.now() + 60000).toISOString()
    const future = [...seed.workLogs.map((l) => l.atUtc), ...seed.workOrders.map((w) => w.createdAtUtc), ...seed.notifications.map((n) => n.atUtc)].filter((t) => t > now)
    check('seed has nothing dated in the future', future.length === 0, `${future.length}`)
  }
  check('home: no page scroll', (await noScroll(p)) <= 0)

  // Pick an Assigned job of mine with a checklist (fall back to any Assigned job)
  const me = await session(p)
  let state = await db(p)
  const mine = state.workOrders.filter((w) => w.assigneeId === me && w.status === 'Assigned')
  const job = mine.find((w) => w.checklist.length >= 2) ?? mine[0]
  check('technician has an assigned job', !!job, job?.number)

  await p.locator('nav[aria-label=Main]').getByRole('link', { name: 'Jobs' }).click()
  await p.getByRole('tab', { name: /All open/ }).click()
  check('jobs list', await p.locator(`a[href="/tech/jobs/${job.id}"]`).waitFor({ timeout: 5000 }).then(() => true, () => false))
  await p.getByPlaceholder('Search jobs or machines…').fill(job.number)
  check('jobs search', (await p.locator('a[href^="/tech/jobs/"]').count()) === 1)
  await p.screenshot({ path: `${OUT}02-jobs.png`, fullPage: true })
  await p.locator(`a[href="/tech/jobs/${job.id}"]`).click()

  // ── Start ──────────────────────────────────────────────────────────
  await p.getByRole('button', { name: 'Start job' }).click()
  check('start job', await toast(p, 'Job started'))
  await p.getByText('Working').first().waitFor()
  check('working banner', true)
  const bar = await p.getByRole('button', { name: 'Complete' }).boundingBox()
  const nav = await p.locator('nav[aria-label=Main]').boundingBox()
  check('action bar sits above bottom nav', bar.y + bar.height <= nav.y + 1, `${Math.round(bar.y + bar.height)} <= ${Math.round(nav.y)}`)

  // ── Checklist ──────────────────────────────────────────────────────
  if (job.checklist.length) {
    await p.getByRole('checkbox').first().click()
    await p.waitForTimeout(600)
    state = await db(p)
    check('checklist tick persisted', state.workOrders.find((w) => w.id === job.id).checklist[0].done === true)
  }

  // ── Photo ──────────────────────────────────────────────────────────
  const chooser = p.waitForEvent('filechooser')
  await p.getByRole('button', { name: 'Before' }).click()
  await (await chooser).setFiles({ name: 'before.png', mimeType: 'image/png', buffer: PNG })
  check('before photo uploaded', await toast(p, 'Before photo added'))
  check('photo thumbnail shown', await p.getByAltText('Before photo').waitFor({ timeout: 4000 }).then(() => true, () => false))

  // ── Part usage ─────────────────────────────────────────────────────
  await p.getByRole('button', { name: 'Log part' }).click()
  const dlg = p.getByRole('dialog')
  const select = dlg.getByLabel('Part')
  const optionValue = await select.locator('option:not([disabled]):not([value=""])').first().getAttribute('value')
  const stockBefore = state.parts.find((x) => x.id === optionValue).quantityOnHand
  await select.selectOption(optionValue)
  await dlg.getByRole('button', { name: 'Increase quantity' }).click()
  const qty = Number(await dlg.getByLabel('Quantity', { exact: true }).inputValue())
  await dlg.getByRole('button', { name: /^Log \d/ }).click()
  check('part logged', await toast(p, 'Logged'))
  state = await db(p)
  check('stock reduced', state.parts.find((x) => x.id === optionValue).quantityOnHand === stockBefore - qty, `${stockBefore} → ${stockBefore - qty}`)

  // ── Pause / resume ─────────────────────────────────────────────────
  await p.getByRole('button', { name: 'Pause' }).click()
  await dlg.getByRole('radio', { name: 'Waiting for parts' }).click()
  await dlg.getByRole('button', { name: 'Pause job' }).click()
  check('paused', await toast(p, 'Job paused'))
  check('pause banner', await p.getByText('Paused:').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await p.getByRole('button', { name: 'Resume job' }).click()
  check('resumed', await toast(p, 'Job resumed'))
  await p.getByRole('button', { name: 'Complete' }).waitFor()
  await p.screenshot({ path: `${OUT}03-job-inprogress.png`, fullPage: true })

  // ── Complete ───────────────────────────────────────────────────────
  await p.getByRole('button', { name: 'Complete' }).click()
  await dlg.getByLabel(/^Hours worked/).fill('')
  await dlg.getByRole('button', { name: 'Complete job' }).click()
  check('complete validation', await dlg.getByText('Describe what you did').isVisible())
  await p.screenshot({ path: `${OUT}04-complete-sheet.png` })
  await dlg.getByLabel(/^Hours worked/).fill('1.5')
  if (job.type === 'Corrective') await dlg.getByLabel(/^Root cause/).fill('Worn drive belt')
  await dlg.getByLabel(/^What did you do/).fill('Replaced belt, tensioned and test-ran for 15 minutes.')
  if (await dlg.getByText(/checklist step.* not ticked/).count()) await dlg.getByRole('checkbox').click()
  await dlg.getByRole('button', { name: 'Complete job' }).click()
  check('job completed', await toast(p, 'completed'))
  check('completed banner', await p.getByText(/^Completed /).first().waitFor({ timeout: 4000 }).then(() => true, () => false))
  state = await db(p)
  const done = state.workOrders.find((w) => w.id === job.id)
  check('completion persisted', done.status === 'Completed' && done.laborHours === 1.5)
  check('supervisor notified', state.notifications.some((n) => n.body.includes(`${job.number} completed`)))

  // ── History ────────────────────────────────────────────────────────
  await p.locator('nav[aria-label=Main]').getByRole('link', { name: 'History' }).click()
  check('history lists job', await p.locator(`a[href="/tech/jobs/${job.id}"]`).waitFor({ timeout: 5000 }).then(() => true, () => false))
  await p.screenshot({ path: `${OUT}05-history.png`, fullPage: true })

  // ── Scan (no camera in headless: manual entry) ─────────────────────
  await p.locator('nav[aria-label=Main]').getByRole('link', { name: 'Scan' }).click()
  check('camera fallback message', await p.getByText(/No camera|could not be started|secure/).waitFor({ timeout: 8000 }).then(() => true, () => false))
  await p.getByLabel(/type the asset ID/).fill('zzz-999')
  await p.getByRole('button', { name: 'Find' }).click()
  check('unknown asset message', await p.getByText('No equipment with asset ID "ZZZ-999"').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await p.screenshot({ path: `${OUT}06-scan.png`, fullPage: true })
  const asset = state.equipment.find((e) => e.id === job.equipmentId).assetId
  await p.getByLabel(/type the asset ID/).fill(asset.toLowerCase())
  await p.getByRole('button', { name: 'Find' }).click()
  await p.waitForURL(new RegExp(`/tech/equipment/${job.equipmentId}$`))
  check('manual asset lookup opens machine', true, asset)
  check('repair history includes my job', await p.getByText('Replaced belt, tensioned').waitFor({ timeout: 5000 }).then(() => true, () => false))
  await p.screenshot({ path: `${OUT}07-equipment.png`, fullPage: true })

  await p.goto(`${BASE}/equipment/${asset}`)
  await p.waitForURL(/\/tech\/equipment\//)
  check('QR deep link resolves for technician', true)

  // ── Profile ────────────────────────────────────────────────────────
  await p.locator('nav[aria-label=Main]').getByRole('link', { name: 'Profile' }).click()
  await p.getByText('Skills & certifications').waitFor()
  check('profile', await p.getByText('This month').isVisible())

  // ── Someone else's job ─────────────────────────────────────────────
  const other = state.workOrders.find((w) => w.assigneeId && w.assigneeId !== me)
  await p.goto(`${BASE}/tech/jobs/${other.id}`)
  check("other technician's job is refused", await p.getByText('not assigned to you').waitFor({ timeout: 5000 }).then(() => true, () => false))

  // ── Phone layout ───────────────────────────────────────────────────
  for (const path of ['/tech', '/tech/jobs', `/tech/jobs/${job.id}`, '/tech/scan', '/tech/history', '/tech/profile', `/tech/equipment/${job.equipmentId}`]) {
    await p.goto(`${BASE}${path}`)
    await p.waitForLoadState('networkidle')
    await p.waitForTimeout(250)
    const o = await noScroll(p)
    check(`no page scroll at 390px: ${path.replace(/[0-9a-f-]{36}/, ':id')}`, o <= 0, `${o}px`)
  }
  const small = await newPage({ width: 320, height: 640 })
  await login(small, 'Technician')
  check('no page scroll at 320px: /tech', (await noScroll(small)) <= 0)

  // Supervisor sees the completion
  // Same browser storage, so the supervisor sees the technician's changes
  const s = p
  await s.setViewportSize({ width: 1280, height: 800 })
  await s.goto(`${BASE}/login?switch=1`)
  await s.locator('div.rounded-lg.border', { hasText: 'Supervisor / Planner' }).first().getByRole('button', { name: 'Enter' }).click()
  await s.waitForURL((u) => u.pathname.startsWith('/supervisor'))
  await s.goto(`${BASE}/supervisor/work-orders?view=closed&q=${job.number}`)
  check('supervisor sees completed job', await s.locator('tbody tr', { hasText: job.number }).waitFor({ timeout: 5000 }).then(() => true, () => false))
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
report(results, errors)
