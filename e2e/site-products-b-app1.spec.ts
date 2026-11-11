import { expect, type Locator, type Page, test } from '@playwright/test'
import { hydrateIsland, waitForNav } from './site-islands'

/**
 * Per-demo interaction on five app product pages (table, virtual, dnd, toast,
 * rx), against the production SSG build, by KEYBOARD and by POINTER. Page-level
 * checks (hydration adoption, widths, contrast, heavy-chunk timing) live in
 * site-products-b.spec.ts.
 *
 * A demo is a Zero island that hydrates when it nears the viewport, so each
 * test first scrolls to it and waits for a client-only sign that its handlers
 * are attached before it operates the demo.
 */
test.use({ viewport: { width: 1440, height: 900 } })

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
  })
  return errors
}

async function openDemo(page: Page, id: string): Promise<Locator> {
  await page.goto(`/products/${id}`)
  await waitForNav(page)
  const demo = page.locator('#demo')
  await demo.locator('pyreon-island').scrollIntoViewIfNeeded()
  await hydrateIsland(page, '#demo pyreon-island')
  return demo
}

/** The values of a `Meters` list, by label. */
async function meter(demo: Locator, listLabel: string, rowLabel: string): Promise<string> {
  const row = demo.locator(`ul[aria-label="${listLabel}"] li`, { hasText: rowLabel })
  return (await row.locator('b').textContent()) ?? ''
}

// ─── table ──────────────────────────────────────────────────────────────────

test.describe('table demo', () => {
  async function ready(page: Page) {
    const demo = await openDemo(page, 'table')
    // The server renders the first 40 rows; the rest arrive once the island mounts.
    await expect(demo.locator('tbody tr')).toHaveCount(1000)
    return demo
  }
  const header = (demo: Locator, name: string) => demo.locator('th', { has: demo.page().getByRole('button', { name }) })
  const column = (demo: Locator, n: number) => demo.locator(`tbody tr td:nth-child(${n})`)

  test('the server renders a first page of rows, the client completes it', async ({ request }) => {
    const html = await (await request.get('/products/table')).text()
    const rows = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>')).match(/<tr/g) ?? []
    expect(rows.length).toBe(40)
  })

  test('sort headers work by Enter and by click, with aria-sort and row order', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await ready(page)
    await expect(header(demo, 'Product')).toHaveAttribute('aria-sort', 'ascending')
    await expect(column(demo, 1).first()).toHaveText('Cable 107')

    // Keyboard: Enter on the Price header sorts by price (numbers start descending).
    await demo.getByRole('button', { name: 'Price' }).focus()
    await page.keyboard.press('Enter')
    await expect(header(demo, 'Price')).toHaveAttribute('aria-sort', 'descending')
    await expect(header(demo, 'Product')).toHaveAttribute('aria-sort', 'none')
    const desc = (await column(demo, 3).allTextContents()).slice(0, 5).map((t) => Number(t.slice(1)))
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    expect(desc[0]).toBe(488)

    // Pointer: a click flips it to ascending.
    await demo.getByRole('button', { name: 'Price' }).click()
    await expect(header(demo, 'Price')).toHaveAttribute('aria-sort', 'ascending')
    await expect(column(demo, 3).first()).toHaveText('$9')
    expect(errors).toEqual([])
  })

  test('the filter narrows the rows and the count', async ({ page }) => {
    const demo = await ready(page)
    await demo.getByLabel('Filter products').fill('kitchen')
    await expect(demo.locator('tbody tr')).toHaveCount(250)
    await expect.poll(() => meter(demo, 'What the last edit cost', 'rows shown')).toBe('250')
    await demo.getByLabel('Filter products').fill('Monitor 1088')
    await expect(demo.locator('tbody tr')).toHaveCount(1)
  })

  test('a keyboard price edit re-runs one row and writes one DOM node', async ({ page }) => {
    const demo = await ready(page)
    const price = demo.locator('td.price button').nth(3)
    await price.focus()
    await page.keyboard.press('Enter')
    const input = demo.getByRole('spinbutton')
    await expect(input).toBeFocused()
    await page.keyboard.type('55')
    await page.keyboard.press('Enter')
    await expect(input).toHaveCount(0)
    await expect(price).toHaveText('$55')
    await expect(price).toBeFocused()
    await expect.poll(() => meter(demo, 'What the last edit cost', 'cells re-run')).toBe('4')
    expect(await meter(demo, 'What the last edit cost', 'DOM writes')).toBe('1')
  })

  test('a double-clicked price edit commits on blur; Escape cancels', async ({ page }) => {
    const demo = await ready(page)
    const price = demo.locator('td.price button').nth(1)
    await price.dblclick()
    await page.keyboard.type('321')
    await demo.getByLabel('Filter products').focus()
    await expect(price).toHaveText('$321')

    const other = demo.locator('td.price button').nth(2)
    const before = await other.textContent()
    await other.dblclick()
    await page.keyboard.type('1')
    await page.keyboard.press('Escape')
    await expect(demo.getByRole('spinbutton')).toHaveCount(0)
    await expect(other).toHaveText(before ?? '')
  })
})

// ─── virtual ────────────────────────────────────────────────────────────────

test.describe('virtual demo', () => {
  async function ready(page: Page) {
    const demo = await openDemo(page, 'virtual')
    await expect.poll(() => meter(demo, 'Rows, measured', 'rows in the DOM')).not.toBe('0')
    return demo
  }
  /** The first row whose box is inside the scroller's viewport. */
  const firstVisible = (demo: Locator) =>
    demo.evaluate((d) => {
      const box = d.querySelector('.vt-box') as HTMLElement
      const top = box.getBoundingClientRect().top
      const rows = [...box.querySelectorAll('.vt-row')].filter((r) => r.getBoundingClientRect().bottom > top + 1)
      rows.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      return rows[0]?.querySelector('span')?.textContent ?? ''
    })

  test('keyboard: End and Page Down move the visible rows; the DOM stays small', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await ready(page)
    expect(await meter(demo, 'Rows, measured', 'total rows')).toBe('100,000')
    await expect(demo.locator('li.vt-row').first()).toHaveAttribute('aria-setsize', '100000')
    expect(await firstVisible(demo)).toContain('#100000')

    await demo.getByRole('region', { name: /Orders, 100,000 rows/ }).focus()
    await page.keyboard.press('End')
    await expect.poll(() => firstVisible(demo)).toMatch(/#1999\d\d/)
    expect(await demo.locator('li.vt-row').count()).toBeLessThan(40)
    expect(Number(await meter(demo, 'Rows, measured', 'rows in the DOM'))).toBeLessThan(40)

    await page.keyboard.press('Home')
    await expect.poll(() => firstVisible(demo)).toContain('#100000')
    await page.keyboard.press('PageDown')
    await expect.poll(() => firstVisible(demo)).not.toContain('#100000')
    expect(await demo.locator('li.vt-row').count()).toBeLessThan(40)
    expect(errors).toEqual([])
  })

  test('pointer: the wheel scrolls it and the jump button lands mid-list', async ({ page }) => {
    const demo = await ready(page)
    await demo.locator('.vt-box').hover()
    await page.mouse.wheel(0, 4000)
    await expect.poll(() => firstVisible(demo)).toMatch(/#100(09\d|[1-9]\d\d)/) // order #100090–#100999: scrolled roughly 90–999 rows
    await demo.getByRole('button', { name: 'scrollToIndex(50000)' }).click()
    await expect.poll(() => firstVisible(demo)).toMatch(/#1499\d\d/)
    expect(await demo.locator('li.vt-row').count()).toBeLessThan(40)
    expect(Number(await meter(demo, 'Rows, measured', 'rows added or removed'))).toBeGreaterThan(0)
  })
})

// ─── dnd ────────────────────────────────────────────────────────────────────

test.describe('dnd demo', () => {
  async function ready(page: Page) {
    const demo = await openDemo(page, 'dnd')
    // useSortable makes the rows focusable once it registers them on the client.
    await expect(demo.locator('li').first()).toHaveAttribute('tabindex', '0')
    return demo
  }
  const order = (demo: Locator) => demo.locator('li span').allTextContents()
  const heard = (demo: Locator) => demo.locator('p[aria-hidden="true"]')

  test('keyboard: Space, arrows, Space reorders and announces', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await ready(page)
    expect(await order(demo)).toEqual(['Design review', 'Ship onboarding', 'Write release notes', 'Fix Safari bug'])
    await demo.locator('li').first().focus()
    await page.keyboard.press('Space')
    await expect(heard(demo)).toContainText('Picked up Design review')
    await expect(demo.locator('li[data-lifted="true"]')).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => order(demo)).toEqual(['Ship onboarding', 'Write release notes', 'Design review', 'Fix Safari bug'])
    await page.keyboard.press('Space')
    await expect(heard(demo)).toContainText('Dropped Design review at position 3 of 4')
    await expect(demo.locator('li[data-lifted="true"]')).toHaveCount(0)
    await expect(demo.locator('pre code')).toContainText("{ id: 2, title: 'Ship onboarding' },\n  { id: 3")
    // The polite live region the package writes is what the line above mirrors.
    await expect(page.locator('[data-pyreon-announcer="polite"]')).toHaveText(/Dropped Design review/)

    // Escape puts a picked-up row back.
    await demo.locator('li').first().focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect.poll(() => order(demo)).toEqual(['Ship onboarding', 'Write release notes', 'Design review', 'Fix Safari bug'])
    expect(errors).toEqual([])
  })

  test('pointer: dragging the last row to the top reorders the list', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await ready(page)
    const items = demo.locator('li')
    const src = await items.nth(3).boundingBox()
    const dst = await items.nth(0).boundingBox()
    if (!src || !dst) throw new Error('rows have no box')
    await page.mouse.move(src.x + 40, src.y + src.height / 2)
    await page.mouse.down()
    await page.mouse.move(src.x + 45, src.y + src.height / 2 - 10, { steps: 5 })
    await page.mouse.move(dst.x + 45, dst.y + 5, { steps: 15 })
    await expect(items.first()).toHaveAttribute('data-edge', 'top')
    await page.mouse.up()
    await expect.poll(() => order(demo)).toEqual(['Fix Safari bug', 'Design review', 'Ship onboarding', 'Write release notes'])
    await expect(heard(demo)).toContainText('Dropped Fix Safari bug at position 1 of 4')
    expect(errors).toEqual([])
  })
})

// ─── toast ──────────────────────────────────────────────────────────────────

test.describe('toast demo', () => {
  async function ready(page: Page) {
    const demo = await openDemo(page, 'toast')
    // The demo mounts its Toaster after hydration.
    await expect(page.locator('.pyreon-toast-container')).toHaveCount(1)
    return demo
  }
  const button = (demo: Locator, text: string) => demo.locator('button', { hasText: text }).first()
  const shown = (page: Page) => page.locator('.pyreon-toast:not(.pyreon-toast--exiting)')

  test('fire by click and by keyboard; at most three are on screen', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await ready(page)
    await button(demo, "toast.success('Saved')").click()
    await button(demo, 'toast.error').focus()
    await page.keyboard.press('Enter')
    await button(demo, 'toast.info').focus()
    await page.keyboard.press('Space')
    await expect(shown(page)).toHaveCount(3)
    await expect(page.locator('.pyreon-toast--error')).toHaveAttribute('role', 'alert')

    await button(demo, 'toast.loading').click()
    await button(demo, 'toast.promise').click()
    await expect(shown(page)).toHaveCount(3)
    expect(await meter(demo, 'Toasts', 'in the store')).toBe('5')
    expect(await meter(demo, 'Toasts', 'on screen')).toBe('3')
    // The newest three are the ones on screen.
    await expect(shown(page).locator('.pyreon-toast__message')).toHaveText(['New version available', 'Saving draft…', 'Publishing…'])
    await expect(page.getByText('Saved revision #42')).toBeVisible()
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the Retry action works by keyboard; dismiss clears the stack', async ({ page }) => {
    const demo = await ready(page)
    await button(demo, 'toast.error').click()
    await page.locator('.pyreon-toast__action').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Reconnected')).toBeVisible()
    await button(demo, 'toast.info').click()
    await button(demo, 'toast.dismiss()').click()
    await expect(shown(page)).toHaveCount(0)
    await expect.poll(() => meter(demo, 'Toasts', 'in the store')).toBe('0')
  })

  test('hovering the stack pauses the countdown', async ({ page }) => {
    const demo = await ready(page)
    await button(demo, "toast.success('Saved')").click()
    await page.locator('.pyreon-toast').hover()
    await page.waitForTimeout(4600)
    await expect(shown(page)).toHaveCount(1)
    await page.mouse.move(10, 600)
    await expect(shown(page)).toHaveCount(0, { timeout: 6000 })
  })
})

// ─── rx ─────────────────────────────────────────────────────────────────────

test.describe('rx demo', () => {
  const recomputes = async (demo: Locator) => Number(await meter(demo, 'Pipe', 'pipe recomputes'))
  // The result list (the meters are a labelled list too).
  const names = (demo: Locator) => demo.locator('ul:not([aria-label]) > li > span').evaluateAll((s) => s.map((x) => x.firstChild?.textContent ?? ''))
  const prices = (demo: Locator) => demo.locator('ul:not([aria-label]) > li > b').evaluateAll((b) => b.map((x) => Number(x.textContent?.slice(1))))
  const option = (demo: Locator, group: string, name: string) =>
    demo.locator(`fieldset[aria-label="${group}"]`).getByRole('button', { name, exact: true })

  test('each input change re-runs the pipe once; order follows the chosen sort', async ({ page }) => {
    const errors = collectErrors(page)
    const demo = await openDemo(page, 'rx')
    // A click before hydration is swallowed: retry until the island answers.
    await expect(async () => {
      await option(demo, 'Sort by', 'price').click()
      await expect(option(demo, 'Sort by', 'price')).toHaveAttribute('aria-pressed', 'true', { timeout: 500 })
    }).toPass()
    const p = await prices(demo)
    expect(p).toEqual([...p].sort((a, b) => a - b))
    let n = await recomputes(demo)

    // Pointer: direction desc.
    await option(demo, 'Direction', 'desc').click()
    await expect.poll(() => recomputes(demo)).toBe(n + 1)
    const d = await prices(demo)
    expect(d).toEqual([...d].sort((a, b) => b - a))
    expect(d[0]).toBe(489)
    n += 1

    // The same option again changes nothing and re-runs nothing.
    await option(demo, 'Direction', 'desc').click()
    await page.waitForTimeout(200)
    expect(await recomputes(demo)).toBe(n)

    // Keyboard: sort by name, then type a query one key at a time.
    await option(demo, 'Sort by', 'name').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => recomputes(demo)).toBe(n + 1)
    n += 1
    const byName = await names(demo)
    expect(byName).toEqual([...byName].sort((a, b) => b.localeCompare(a)))
    await demo.getByLabel('Search products').focus()
    await page.keyboard.type('de', { delay: 60 })
    await expect.poll(() => recomputes(demo)).toBe(n + 2)
    n += 2
    expect(await names(demo)).toEqual(['Standing desk', 'Desk mat', 'Desk lamp', 'Coffee grinder'])
    await expect(demo.getByText('4 of 12 products')).toBeVisible()

    // Grouping by category: one more run, one heading per category.
    await demo.getByLabel('Search products').fill('')
    await expect.poll(() => recomputes(demo)).toBe(n + 1)
    n += 1
    await option(demo, 'Group by', 'category').click()
    await expect.poll(() => recomputes(demo)).toBe(n + 1)
    await expect(demo.locator('h3')).toHaveCount(4)
    await expect(demo.locator('pre code')).toContainText('grouped() = true')
    expect(errors).toEqual([])
  })
})
