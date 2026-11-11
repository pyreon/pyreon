import { expect, type Locator, type Page, test } from '@playwright/test'
import { waitForHydration } from './hydration-barrier'

/**
 * Per-demo interaction for five app product pages (i18n, permissions,
 * urlstate, hotkeys, feature) against the production SSG build: each demo is
 * operated by keyboard and by pointer and the visible result is asserted.
 * Page-level checks (prerender, hydration adoption, widths, contrast, heavy
 * chunks) live in site-products-b.spec.ts.
 *
 * Teardown: a zero island is not disposed on client-side navigation, so the
 * urlstate, hotkeys and feature demos stop their own listeners once their root
 * leaves the document. The tests below navigate away by a site link and check
 * that what the demo registered is gone.
 */
test.use({ viewport: { width: 1280, height: 900 } })

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /hydrat|mismatch|\[Pyreon\]/i.test(m.text()))) errors.push(m.text())
  })
  return errors
}

/** Counts the live window listeners per event type (add minus remove). */
async function trackWindowListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Map<string, Set<unknown>>()
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (type: string, fn: unknown, opts?: unknown) {
      if (this === window && fn) (live.get(type) ?? live.set(type, new Set()).get(type))!.add(fn)
      return add.call(this, type, fn as EventListener, opts as AddEventListenerOptions)
    }
    EventTarget.prototype.removeEventListener = function (type: string, fn: unknown, opts?: unknown) {
      if (this === window) live.get(type)?.delete(fn)
      return remove.call(this, type, fn as EventListener, opts as EventListenerOptions)
    }
    ;(window as unknown as { __listeners: (t: string) => number }).__listeners = (t) => live.get(t)?.size ?? 0
  })
}

const listeners = (page: Page, type: string) =>
  page.evaluate((t) => (window as unknown as { __listeners: (t: string) => number }).__listeners(t), type)

/** Open a product page and wait until its demo island is hydrated and operable. */
async function openDemo(page: Page, id: string, ready: (demo: Locator) => Locator): Promise<Locator> {
  await page.goto(`/products/${id}`)
  await waitForHydration(page)
  const demo = page.locator('#demo')
  await demo.locator('pyreon-island').scrollIntoViewIfNeeded()
  await expect(ready(demo)).toBeVisible()
  // The island hydrates on visibility: wait until a control reacts.
  await page.waitForLoadState('networkidle')
  return demo
}

/** Click a site link (client-side navigation through the router). */
async function navigateBySiteLink(page: Page, href: string): Promise<void> {
  await page.evaluate((h) => {
    const a = [...document.querySelectorAll<HTMLAnchorElement>('a')].find((x) => x.getAttribute('href') === h)
    if (!a) throw new Error(`no link to ${h}`)
    a.click()
  }, href)
  await page.waitForURL((u) => u.pathname === href)
}

test.describe('i18n demo', () => {
  test('locale switch by keyboard and pointer; real plural categories', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await openDemo(page, 'i18n', (d) => d.getByRole('button', { name: 'Polski' }))
    const out = demo.locator('p[aria-live="polite"]').first()
    const category = demo.locator('p', { hasText: /^plural category:/ })
    const count = demo.getByLabel('Files')

    await expect(out).toHaveText('3 soubory')
    await expect(category).toHaveText('plural category: few')

    // Pointer: the quick picks.
    await demo.getByRole('button', { name: '1', exact: true }).click()
    await expect(out).toHaveText('1 soubor')
    await expect(category).toHaveText('plural category: one')
    await demo.getByRole('button', { name: '5', exact: true }).click()
    await expect(out).toHaveText('5 souborů')
    await demo.getByRole('button', { name: '1.5', exact: true }).click()
    await expect(out).toHaveText('1,5 souboru')
    await expect(category).toHaveText('plural category: many')

    // Keyboard: focus the Polski toggle and press Enter, then type the count.
    await demo.getByRole('button', { name: 'Polski' }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByRole('button', { name: 'Polski' })).toHaveAttribute('aria-pressed', 'true')
    await count.fill('22')
    await expect(out).toHaveText('22 pliki')
    await expect(category).toHaveText('plural category: few')
    await count.fill('25')
    await expect(out).toHaveText('25 plików')
    await expect(category).toHaveText('plural category: many')

    // Arabic: the two form, written right to left.
    await demo.getByRole('button', { name: 'العربية' }).click()
    await demo.getByRole('button', { name: '2', exact: true }).click()
    await expect(out).toHaveText('ملفان')
    await expect(out).toHaveAttribute('dir', 'rtl')
    await expect(out).toHaveAttribute('lang', 'ar')
    expect(errors).toEqual([])
  })
})

test.describe('permissions demo', () => {
  test('a role switch enables and disables the right actions', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await openDemo(page, 'permissions', (d) => d.getByRole('button', { name: 'Bo · viewer' }))
    const action = (name: string) => demo.getByRole('button', { name, exact: true })
    const expectActions = async (enabled: Record<string, boolean>) => {
      for (const [name, on] of Object.entries(enabled)) {
        if (on) await expect(action(name), name).toBeEnabled()
        else await expect(action(name), name).toBeDisabled()
      }
    }

    await expectActions({ Read: true, Edit: true, Delete: true, 'Manage users': false })
    // Keyboard.
    await demo.getByRole('button', { name: 'Bo · viewer' }).focus()
    await page.keyboard.press('Enter')
    await expectActions({ Read: true, Edit: false, Delete: false, 'Manage users': false })
    await expect(demo.getByText('Bo (viewer) can: read')).toBeVisible()
    // Pointer.
    await demo.getByRole('button', { name: 'Cy · admin' }).click()
    await expectActions({ Read: true, Edit: true, Delete: true, 'Manage users': true })
    await demo.getByRole('button', { name: 'Ada · editor' }).click()
    await expectActions({ Read: true, Edit: true, Delete: true, 'Manage users': false })
    expect(errors).toEqual([])
  })
})

test.describe('urlstate demo', () => {
  test('controls write shop- params with replaceState; reload restores them', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await openDemo(page, 'urlstate', (d) => d.getByRole('searchbox', { name: 'Search' }))
    const historyLength = await page.evaluate(() => history.length)
    const routerStamp = await page.evaluate(() => JSON.stringify(history.state))

    // Keyboard: type into the search (debounced 300 ms).
    await demo.getByRole('searchbox', { name: 'Search' }).pressSequentially('lamp', { delay: 30 })
    await expect.poll(() => page.evaluate(() => location.search)).toBe('?shop-q=lamp')
    // Pointer: sort, next page, in stock (one batched write that resets the page).
    await demo.getByRole('button', { name: 'price', exact: true }).click()
    await demo.getByRole('button', { name: 'Next page' }).click()
    await expect.poll(() => page.evaluate(() => location.search)).toBe('?shop-q=lamp&shop-sort=price&shop-page=2')
    await expect(demo.getByRole('list', { name: 'Products' }).getByRole('listitem')).toHaveText([/Arc floor lamp/])
    await demo.getByLabel('In stock').press('Space')
    await expect.poll(() => page.evaluate(() => location.search)).toBe('?shop-q=lamp&shop-sort=price&shop-stock=true')
    // Defaults leave the URL.
    await demo.getByRole('button', { name: 'name', exact: true }).click()
    await expect.poll(() => page.evaluate(() => location.search)).toBe('?shop-q=lamp&shop-stock=true')
    await expect(demo.getByLabel('Current page address')).toHaveText('/products/urlstate?shop-q=lamp&shop-stock=true')

    // replaceState only, and the router's history stamp is kept.
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
    expect(await page.evaluate(() => JSON.stringify(history.state))).toBe(routerStamp)

    await page.reload()
    await waitForHydration(page)
    await demo.locator('pyreon-island').scrollIntoViewIfNeeded()
    await expect(demo.getByRole('searchbox', { name: 'Search' })).toHaveValue('lamp')
    await expect(demo.getByLabel('In stock')).toBeChecked()
    await expect(demo.getByRole('button', { name: 'name', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(demo.getByRole('list', { name: 'Products' }).getByRole('listitem')).toHaveText([
      /Arc floor lamp/,
      /Globe pendant lamp/,
      /Halo wall lamp/,
    ])
    expect(errors).toEqual([])
  })

  test('leaving by a site link leaves no shop- params and no listeners behind', async ({ page }) => {
    await trackWindowListeners(page)
    await page.goto('/products/urlstate')
    await waitForHydration(page)
    const baseline = await listeners(page, 'popstate')
    const demo = page.locator('#demo')
    await demo.locator('pyreon-island').scrollIntoViewIfNeeded()
    await expect(demo.getByRole('searchbox', { name: 'Search' })).toBeVisible()
    await expect.poll(() => listeners(page, 'popstate')).toBeGreaterThan(baseline)

    // A debounced write is still pending when the link is clicked.
    await demo.getByRole('searchbox', { name: 'Search' }).fill('glo')
    await navigateBySiteLink(page, '/products/hotkeys')
    await page.waitForTimeout(700)
    expect(await page.evaluate(() => location.pathname + location.search)).toBe('/products/hotkeys')
    expect(await listeners(page, 'popstate')).toBe(baseline)
  })
})

test.describe('hotkeys demo', () => {
  test('keys fire inside the focused box and nowhere else', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await openDemo(page, 'hotkeys', (d) => d.getByRole('button', { name: /editor scope/ }))
    const box = demo.getByLabel('Hotkeys demo: focus here and press keys')
    const out = box.locator('p[aria-live="polite"]')
    const idle = 'Click here, then press a shortcut.'

    // Outside the box (focus on the page body): nothing fires.
    await page.locator('h1').first().click()
    await page.keyboard.press('ControlOrMeta+k')
    await page.keyboard.press('Shift+Slash')
    await page.keyboard.press('g')
    await page.keyboard.press('i')
    await expect(out).toHaveText(idle)

    // Pointer: click into the box, then the keys fire.
    await box.click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('ControlOrMeta+k')
    await expect(out).toHaveText(/fired: mod\+k\s+→\s+Open command palette/)
    await page.keyboard.press('g')
    await page.keyboard.press('i')
    await expect(out).toHaveText(/fired: g i\s+→\s+Go to inbox/)
    await page.keyboard.press('Shift+Slash')
    await expect(out).toHaveText(/fired: \?\s+→\s+Show shortcuts/)

    // The editor scope: off, mod+s is caught and explained; on (by keyboard), it saves.
    await page.keyboard.press('ControlOrMeta+s')
    await expect(out).toHaveText(/ignored: the editor scope is off/)
    await demo.getByRole('button', { name: /editor scope/ }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByRole('button', { name: /editor scope/ })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(out).toHaveText(/fired: mod\+s\s+→\s+Save/)
    await page.keyboard.press('Escape')
    await expect(out).toHaveText(/fired: escape\s+→\s+Close/)

    // Back outside: the same keys do nothing.
    await page.locator('h1').first().click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(out).toHaveText(/fired: escape/)
    expect(errors).toEqual([])
  })

  test('leaving the page releases the editor scope', async ({ page }) => {
    const demo = await openDemo(page, 'hotkeys', (d) => d.getByRole('button', { name: /editor scope/ }))
    await demo.getByRole('button', { name: /editor scope/ }).click()
    await expect(demo.getByLabel('Hotkey state')).toContainText('global, editor')
    await navigateBySiteLink(page, '/products/feature')
    await navigateBySiteLink(page, '/products/hotkeys')
    const again = page.locator('#demo')
    await again.locator('pyreon-island').scrollIntoViewIfNeeded()
    await expect(again.getByRole('button', { name: /editor scope/ })).toHaveAttribute('aria-pressed', 'false')
    // A scope leaked by the first visit would still be active here.
    await expect(again.getByLabel('Hotkey state')).toContainText(/active scopes\s*global$/)
  })
})

test.describe('feature demo', () => {
  test('create, duplicate (409) and delete through the generated hooks; no network', async ({ page }) => {
    const errors = collectErrors(page)
    const api: string[] = []
    page.on('request', (r) => {
      if (/\/api\//.test(new URL(r.url()).pathname)) api.push(r.url())
    })
    const demo = await openDemo(page, 'feature', (d) => d.getByRole('button', { name: 'useCreate()' }))
    const titles = demo.locator('tbody td:first-child')
    const input = demo.getByLabel('New post title')
    const error = demo.locator('#ft-demo-error')
    const requests = demo.getByLabel('Requests the mock API answered')

    await expect(titles).toHaveText(['Launch checklist', 'Q4 roadmap'])

    // Pointer: an empty title is refused by the schema.
    await demo.getByRole('button', { name: 'useCreate()' }).click()
    await expect(error).toHaveText('title: Enter a title')
    await expect(input).toHaveAttribute('aria-invalid', 'true')

    // Keyboard: type and press Enter; POST, then the list refetches.
    await input.fill('Hello world')
    await input.press('Enter')
    await expect(titles).toHaveText(['Launch checklist', 'Q4 roadmap', 'Hello world'])
    await expect(requests).toContainText(/GET \/api\/posts\s*2/)
    await expect(requests).toContainText(/POST \/api\/posts\s*1/)
    await expect(input).toHaveValue('')

    // A duplicate: the mock answers 409 and its message is shown.
    await input.fill('q4 roadmap')
    await input.press('Enter')
    await expect(error).toHaveText('A post called "q4 roadmap" already exists')
    await expect(titles).toHaveCount(3)

    // Delete by pointer, then by keyboard.
    await demo.getByRole('button', { name: 'Delete "Launch checklist" (useDelete)' }).click()
    await expect(titles).toHaveText(['Q4 roadmap', 'Hello world'])
    await demo.getByRole('button', { name: 'Delete "Hello world" (useDelete)' }).press('Enter')
    await expect(titles).toHaveText(['Q4 roadmap'])
    await expect(requests).toContainText(/DELETE \/api\/posts\/:id\s*2/)

    // The member picker, by keyboard.
    await demo.getByRole('button', { name: 'useSearch' }).press('Enter')
    await expect(demo.getByText(/posts\.useSearch · A search query that refetches when the term signal changes/)).toBeVisible()

    expect(api, 'the mock API never reaches the network').toEqual([])
    expect(errors).toEqual([])
  })

  test('leaving the page stops the query client listeners', async ({ page }) => {
    await trackWindowListeners(page)
    await page.goto('/products/feature')
    await waitForHydration(page)
    const baseline = await listeners(page, 'visibilitychange')
    const demo = page.locator('#demo')
    await demo.locator('pyreon-island').scrollIntoViewIfNeeded()
    await expect(demo.locator('tbody td:first-child')).toHaveText(['Launch checklist', 'Q4 roadmap'])
    expect(await listeners(page, 'visibilitychange')).toBeGreaterThan(baseline)
    await navigateBySiteLink(page, '/products/i18n')
    await expect.poll(() => listeners(page, 'visibilitychange')).toBe(baseline)
  })
})
