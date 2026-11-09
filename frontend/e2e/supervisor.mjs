// end-to-end check against `vite preview` (production build with VITE_DEMO_AUTH=true).
import { BASE, launch, report, shotsDir } from './lib.mjs'

const OUT = shotsDir('supervisor')
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
const toast = (p, text) => p.locator('[data-sonner-toast]', { hasText: text }).first().waitFor({ timeout: 6000 }).then(() => true, () => false)
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('factoryops.demo-db')))

async function drag(p, source, target) {
  await source.scrollIntoViewIfNeeded()
  const a = await source.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox()
  await p.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40), { steps: 12 })
  await p.waitForTimeout(150)
  await p.mouse.up()
}

try {
  const p = await newPage({ width: 1440, height: 900 })
  await login(p, 'Supervisor / Planner')
  await p.getByText('Requests to review').waitFor()
  check('dashboard panels', await p.getByText('Team right now').isVisible())
  check('dashboard KPIs link', (await p.locator('a[href="/supervisor/work-orders?view=overdue"]').count()) > 0)
  await p.screenshot({ path: `${OUT}01-dashboard.png`, fullPage: true })

  // ── Approve a request ──────────────────────────────────────────────
  await p.goto(`${BASE}/supervisor/requests`)
  await p.locator('tbody tr').first().waitFor()
  const awaitingBefore = Number(await p.getByRole('tab', { name: /Awaiting review/ }).locator('span').last().textContent())
  await p.locator('tbody tr').first().click()
  const dlg = p.getByRole('dialog')
  await dlg.getByText('What the operator saw').waitFor()
  await p.screenshot({ path: `${OUT}02-review.png` })
  await dlg.locator('label:has(input[type=radio])').nth(1).click()
  await dlg.getByRole('button', { name: /^Approve/ }).click()
  check('request approved', await toast(p, 'Approved'))
  await p.waitForTimeout(400)
  const awaitingAfter = Number(await p.getByRole('tab', { name: /Awaiting review/ }).locator('span').last().textContent())
  check('queue count decreases', awaitingAfter === awaitingBefore - 1, `${awaitingBefore} → ${awaitingAfter}`)
  const state1 = await db(p)
  const approved = state1.requests.find((r) => r.status === 'Approved' && r.reviewedAtUtc && Date.now() - Date.parse(r.reviewedAtUtc) < 60000)
  const createdWo = approved && state1.workOrders.find((w) => w.id === approved.workOrderId)
  check('approval created assigned work order', createdWo?.status === 'Assigned' && !!createdWo.assigneeId, createdWo?.number)
  check('technician notified', state1.notifications.some((n) => n.userId === createdWo?.assigneeId && n.body.includes(createdWo.number)))

  // ── Reject a request (validation, then success) ──────────────────────
  await p.locator('tbody tr').first().click()
  await dlg.getByText('What the operator saw').waitFor()
  await dlg.getByRole('radio', { name: 'Reject' }).click()
  await dlg.getByLabel(/^Reason/).fill('')
  await dlg.getByRole('button', { name: 'Reject request' }).click()
  check('reject requires reason', await dlg.getByText('Give the requester a reason').isVisible())
  await dlg.getByLabel(/^Reason/).fill('Normal noise after changeover; no fault found.')
  await dlg.getByRole('button', { name: 'Reject request' }).click()
  check('request rejected', await toast(p, 'rejected'))

  // ── Create, assign, note, edit, cancel ─────────────────────────────
  await p.goto(`${BASE}/supervisor/work-orders`)
  await p.locator('tbody tr').first().waitFor()
  await p.getByRole('button', { name: 'New work order' }).click()
  await dlg.getByRole('button', { name: 'Create work order' }).click()
  check('create validation', await dlg.getByText('Choose the equipment').isVisible())
  await dlg.getByLabel(/^Equipment/).selectOption({ index: 3 })
  await dlg.getByLabel(/^Title/).fill('Inspect guard interlock')
  await dlg.getByLabel(/^Description/).fill('Guard interlock intermittently fails to latch on the operator side.')
  await dlg.getByRole('button', { name: 'Add step' }).click()
  await dlg.getByLabel('Checklist step 1').fill('Lockout / tagout')
  await dlg.getByRole('button', { name: 'Create work order' }).click()
  await p.waitForURL(/\/supervisor\/work-orders\/[0-9a-f-]{36}$/)
  check('work order created', await p.getByRole('heading', { name: 'Inspect guard interlock' }).waitFor({ timeout: 5000 }).then(() => true, () => false))
  await p.getByRole('button', { name: 'Assign' }).click()
  await dlg.locator('label:has(input[type=radio])').nth(2).click()
  await dlg.getByLabel('Planned day').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  await dlg.getByRole('button', { name: 'Save' }).click()
  check('assigned via dialog', await toast(p, 'planned'))
  await p.waitForTimeout(300)
  check('status assigned', await p.locator('h1 + p').getByText('Assigned').isVisible())
  await p.getByLabel('Add a note').fill('Spare interlock switch is in cabinet B4.')
  await p.getByRole('button', { name: 'Add note' }).click()
  check('note in activity', await p.getByText('Spare interlock switch is in cabinet B4.').waitFor({ timeout: 5000 }).then(() => true, () => false))
  await p.getByRole('button', { name: 'Edit' }).click()
  await dlg.getByLabel('Priority').selectOption('High')
  await dlg.getByRole('button', { name: 'Save changes' }).click()
  check('edited priority', await toast(p, 'updated'))
  await p.screenshot({ path: `${OUT}03-wo-detail.png`, fullPage: true })
  await p.getByRole('button', { name: 'Status' }).click()
  await p.getByRole('menuitem', { name: /Cancel work order/ }).click()
  await dlg.getByRole('button', { name: 'Cancel work order' }).click()
  check('cancel requires reason', await dlg.getByText('Give a short reason').isVisible())
  await dlg.getByLabel(/^Reason/).fill('Duplicate of an existing job')
  await dlg.getByRole('button', { name: 'Cancel work order' }).click()
  check('cancelled', await toast(p, 'cancelled'))

  // ── URL filters ────────────────────────────────────────────────────
  await p.goto(`${BASE}/supervisor/work-orders?view=overdue`)
  await p.locator('tbody tr').first().waitFor()
  check('overdue view selected', (await p.getByRole('tab', { name: 'Overdue' }).getAttribute('data-state')) === 'active')
  check('overdue rows flagged', (await p.locator('tbody tr').filter({ hasText: 'Overdue' }).count()) === (await p.locator('tbody tr').count()))

  // ── Kanban board ───────────────────────────────────────────────────
  await p.goto(`${BASE}/supervisor/board`)
  const newCol = p.locator('section[aria-label^="Assigned,"]')
  await newCol.waitFor()
  const newCount = await newCol.locator('[aria-roledescription="draggable"]').count()
  const card = newCol.locator('[aria-roledescription="draggable"]').first()
  const cardLabel = await card.getAttribute('aria-label')
  await p.screenshot({ path: `${OUT}04-board.png` })
  await drag(p, card, p.locator('section[aria-label^="Pending,"]'))
  check('drag Assigned → Pending', await toast(p, 'moved to pending'), cardLabel)
  check('card now in Pending', await p.locator(`section[aria-label^="Pending,"] [aria-label="${cardLabel}"]`).waitFor({ timeout: 4000 }).then(() => true, () => false))
  check('Assigned column shrank', (await newCol.locator('[aria-roledescription="draggable"]').count()) === newCount - 1)
  const pendingCard = p.locator(`section[aria-label^="Pending,"] [aria-label="${cardLabel}"]`)
  await drag(p, pendingCard, p.locator('section[aria-label^="In progress,"]'))
  check('drop on In progress refused', await toast(p, 'done by the assigned technician'))
  // Menu alternative to dragging
  // The drag handle is labelled 'Move WO-…: title'; the card's menu button is 'Actions for WO-…'
  const number = cardLabel.match(/WO-\d+/)[0]
  await p.getByRole('button', { name: `Actions for ${number}`, exact: true }).click()
  await p.getByRole('menuitem', { name: 'Assigned' }).click()
  check('move via menu', await toast(p, 'moved to assigned'))

  // ── Schedule ───────────────────────────────────────────────────────
  await p.goto(`${BASE}/supervisor/schedule`)
  const tray = p.locator('section[aria-label="Not scheduled"] [aria-roledescription="draggable"]')
  await p.locator('[role=table]').waitFor()
  const trayCount = await tray.count()
  check('tray lists unscheduled work', trayCount > 0, `${trayCount}`)
  await p.screenshot({ path: `${OUT}05-schedule.png`, fullPage: true })
  if (trayCount) {
    const chipLabel = await tray.first().getAttribute('aria-label')
    const target = p.locator('[role=cell]').nth(8)
    const targetLabel = await target.getAttribute('aria-label')
    await drag(p, tray.first(), target)
    check('drag to technician/day', await toast(p, 'planned for'), `${chipLabel} → ${targetLabel}`)
    const state = await db(p)
    const moved = state.workOrders.find((w) => chipLabel.startsWith(w.number + ':'))
    check('plan persisted', !!moved?.scheduledDate && !!moved.assigneeId, `${moved?.scheduledDate} ${moved?.status}`)
  }
  await p.getByRole('tab', { name: 'Month' }).click()
  check('month view', await p.getByRole('button', { name: 'Previous month' }).isVisible())

  // ── Technicians & equipment ────────────────────────────────────────
  await p.goto(`${BASE}/supervisor/technicians`)
  await p.getByText('Working now').waitFor()
  check('technician cards', (await p.getByText(/^Queue \(/).count()) >= 3)
  await p.screenshot({ path: `${OUT}06-technicians.png`, fullPage: true })
  await p.goto(`${BASE}/supervisor/equipment`)
  await p.getByText('Down right now').waitFor()
  const tiles = p.locator('a[href^="/supervisor/equipment/"]')
  check('equipment tiles', (await tiles.count()) >= 30, `${await tiles.count()}`)
  await p.screenshot({ path: `${OUT}07-equipment.png`, fullPage: true })
  await tiles.first().click()
  await p.getByText('Maintenance history').first().waitFor()
  check('supervisor equipment detail: no admin edit', (await p.getByRole('link', { name: 'Edit' }).count()) === 0)
  check('supervisor equipment detail: new WO', await p.getByRole('button', { name: 'New work order' }).isVisible())
  const assetId = (await p.locator('h1 + p .font-mono').first().textContent()).trim()
  await p.goto(`${BASE}/equipment/${assetId}`)
  await p.waitForURL(/\/supervisor\/equipment\/[0-9a-f-]{36}$/)
  check('QR link resolves for supervisor', true)

  // ── RBAC ───────────────────────────────────────────────────────────
  await p.goto(`${BASE}/admin`)
  await p.waitForLoadState('networkidle')
  check('supervisor blocked from /admin', !new URL(p.url()).pathname.startsWith('/admin') || (await p.getByText(/not have access|don.t have access/i).count()) > 0, p.url())

  const t = await newPage({ width: 390, height: 844 })
  await login(t, 'Technician')
  await t.goto(`${BASE}/supervisor/board`)
  await t.waitForLoadState('networkidle')
  check('technician blocked from /supervisor', (await t.locator('section[aria-label^="New,"]').count()) === 0, t.url())

  // ── Phone width ────────────────────────────────────────────────────
  const m = await newPage({ width: 390, height: 844 })
  await login(m, 'Supervisor / Planner')
  for (const path of ['/supervisor', '/supervisor/requests', '/supervisor/board', '/supervisor/schedule', '/supervisor/technicians', '/supervisor/equipment']) {
    await m.goto(`${BASE}${path}`)
    await m.waitForLoadState('networkidle')
    await m.waitForTimeout(300)
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`no page scroll at 390px: ${path}`, overflow <= 0, `${overflow}px`)
  }
  await m.goto(`${BASE}/supervisor`)
  await m.waitForLoadState('networkidle')
  await m.screenshot({ path: `${OUT}08-phone-dashboard.png`, fullPage: true })
} catch (e) {
  results.push(`FAIL  script error — ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
report(results, errors)
