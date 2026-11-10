/**
 * Correctness gate: proves each arm does the same observable work before any
 * number from it is reported. Every check can fail a no-op arm:
 *
 *  1. `/items` HTML (server-rendered, no JS) holds all 100 seeded names, 100
 *     links to `/items/:id`, the counter button and a POST form.
 *  2. `/items/7` holds item 7's name and description; `/items/9999` is a 404.
 *  3. Real Chromium: the counter is interactive (click → "Count: 1").
 *  4. Real Chromium: submitting a 2-character name shows the validation error;
 *     submitting a valid name lands on `/items/101` showing it, and a fresh
 *     server GET of `/items` (no JS) now lists it — the POST changed state.
 */
import type { Browser } from 'playwright'
import { expectedNames, type RunningServer, type StackManifest } from './stacks'

export const READY_MARK = 'stacks:island-ready'

export interface GateResult {
  ok: boolean
  failures: string[]
  notes: string[]
}

export async function runGate(
  m: StackManifest,
  srv: RunningServer,
  browser: Browser,
): Promise<GateResult> {
  const failures: string[] = []
  const notes: string[] = []
  const fail = (s: string) => failures.push(s)
  const names = await expectedNames()

  // 1. /items SSR HTML
  const res = await fetch(`${srv.base}/items`, { headers: { 'accept-encoding': 'identity' } })
  const html = await res.text()
  if (res.status !== 200) fail(`/items status ${res.status}`)
  const missing = names.filter((n) => !html.includes(n))
  if (missing.length > 0) fail(`/items HTML missing ${missing.length}/100 names (first: ${missing[0]})`)
  const links = new Set([...html.matchAll(/href="(?:\.?\/)?items\/(\d+)"/g)].map((x) => x[1]))
  if (links.size < 100) fail(`/items HTML has ${links.size} distinct /items/:id links (want ≥100)`)
  if (!/id="counter"/.test(html)) fail('/items HTML has no id="counter" button')
  if (!/<form[^>]*method="post"/i.test(html)) fail('/items HTML has no <form method="post">')
  if (res.headers.get('content-encoding')) {
    notes.push(`/items content-encoding=${res.headers.get('content-encoding')} with identity request`)
  }

  // 2. detail + 404
  const d = await fetch(`${srv.base}/items/7`)
  const dh = await d.text()
  if (d.status !== 200) fail(`/items/7 status ${d.status}`)
  if (!dh.includes(names[6] as string)) fail('/items/7 HTML lacks item 7 name')
  if (!dh.includes('is item number 7 in the seeded catalogue')) fail('/items/7 HTML lacks item 7 description')
  const nf = await fetch(`${srv.base}/items/9999`)
  await nf.arrayBuffer()
  if (nf.status !== 404) fail(`/items/9999 status ${nf.status} (want 404)`)

  // 3 + 4. Chromium
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  try {
    await page.goto(`${srv.base}/items`, { waitUntil: 'load' })
    if (m.hydration !== 'resumable') {
      await page
        .waitForFunction((mark) => performance.getEntriesByName(mark).length > 0, READY_MARK, {
          timeout: 15_000,
        })
        .catch(() => fail(`no "${READY_MARK}" performance mark within 15 s`))
    }
    const btn = page.locator('#counter')
    const before = (await btn.textContent())?.trim()
    if (before !== 'Count: 0') fail(`counter text before click "${before}" (want "Count: 0")`)
    await btn.click()
    await page
      .waitForFunction(() => document.getElementById('counter')?.textContent?.trim() === 'Count: 1', undefined, {
        timeout: 10_000,
      })
      .catch(() => fail('counter did not become "Count: 1" after a click'))

    // validation error
    await page.fill('input[name="name"]', 'ab')
    await page.locator('form[method="post" i] [type="submit"]').first().click()
    await page
      .waitForFunction(
        () => document.getElementById('form-error')?.textContent?.includes('Name must be 3-60 characters'),
        undefined,
        { timeout: 10_000 },
      )
      .catch(() => fail('invalid name did not render #form-error "Name must be 3-60 characters"'))

    // valid submit → /items/101
    const newName = `Gate Item ${Date.now() % 100000}`
    await page.fill('input[name="name"]', newName)
    await page.locator('form[method="post" i] [type="submit"]').first().click()
    await page
      .waitForFunction(
        (n) => /\/items\/101\/?$/.test(location.pathname) && document.body.textContent?.includes(n),
        newName,
        { timeout: 10_000 },
      )
      .catch(async () => fail(`valid submit did not land on /items/101 showing the name (at ${page.url()})`))
    const after = await (await fetch(`${srv.base}/items`)).text()
    if (!after.includes(newName)) fail('server GET /items after the POST does not list the new item')
  } catch (e) {
    fail(`browser gate threw: ${String(e)}`)
  } finally {
    if (pageErrors.length > 0) notes.push(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`)
    await ctx.close()
  }
  return { ok: failures.length === 0, failures, notes }
}
