import { expect, type Page, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { hydrateIsland, waitForNav } from './site-islands'

/**
 * Interaction for the four visual demos (charts, flow, editor, document) in
 * real Chromium against the production build: each is operated by keyboard
 * AND by pointer and the visible result is asserted. Page-level checks
 * (hydration, widths, contrast, heavy-chunk timing) are in
 * site-products-b.spec.ts.
 */
test.use({ viewport: { width: 1440, height: 900 } })

/**
 * Load the product page, scroll to the demo and wait until its island has
 * hydrated. The server HTML already holds the controls (a canvas, the flow
 * nodes, the format buttons), so "visible" is not enough: each demo waits
 * for something only the client does.
 */
const HYDRATED: Record<string, (page: Page) => Promise<void>> = {
  // The chart's first canvas paint removes the server frame placeholder.
  charts: (page) => expect(page.locator('#demo [data-pyreon-chart-frame]')).toHaveCount(0),
  // The demo fits the graph to its box on mount, moving the viewport off its server transform.
  // (The server renders `translate(0px, 0px) scale(1)`.)
  flow: (page) =>
    expect
      .poll(() => page.locator('#demo .pyreon-flow-viewport').evaluate((e) => (e as HTMLElement).style.transform))
      .not.toBe('translate(0px, 0px) scale(1)'),
  // TipTap's contenteditable exists only on the client.
  editor: (page) => expect(page.locator('#demo .ProseMirror')).toBeVisible(),
  // The first render() lands in the preview frame after mount.
  document: (page) => expect(page.frameLocator('#demo iframe').locator('body')).toContainText('Sales report'),
}

async function openDemo(page: Page, id: string, ready: string): Promise<void> {
  await page.goto(`/products/${id}`)
  await waitForNav(page)
  await page.locator('#demo').scrollIntoViewIfNeeded()
  await hydrateIsland(page, '#demo pyreon-island')
  await page.locator(`#demo ${ready}`).first().waitFor({ state: 'visible' })
  await HYDRATED[id]?.(page)
}

test.describe('charts', () => {
  test('keyboard: Tab into the canvas and the arrow keys move the spoken datum', async ({ page }) => {
    await openDemo(page, 'charts', 'canvas[role="img"]')
    const canvas = page.locator('#demo canvas[role="img"]')
    const live = page.locator('#demo canvas[role="img"] ~ [role="status"]')
    // Reach it by keyboard: focus the last mark switch, then Tab to the canvas.
    await page.getByRole('button', { name: 'users', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(canvas).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(live).toContainText('Jan')
    await page.keyboard.press('ArrowRight')
    await expect(live).toContainText('Feb')
    await expect(live).toContainText('1.9k')
  })

  // #4400: hydrating the server-rendered chart used to append a second
  // tooltip, live region and data table after the server's own.
  test('the hydrated chart keeps one live region and one data table', async ({ page }) => {
    await openDemo(page, 'charts', 'canvas[role="img"]')
    await expect(page.locator('#demo canvas[role="img"] ~ [role="status"]')).toHaveCount(1)
    await expect(page.locator('#demo canvas[role="img"] ~ * table')).toHaveCount(1)
  })

  test('pointer: the mark and field switches change the chart and the code', async ({ page }) => {
    await openDemo(page, 'charts', 'canvas[role="img"]')
    const canvas = page.locator('#demo canvas[role="img"]')
    await expect(canvas).toHaveAttribute('aria-label', /revenue, bars/)
    await page.getByRole('button', { name: 'Line', exact: true }).click()
    await page.getByRole('button', { name: 'users', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Line', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas).toHaveAttribute('aria-label', /users, line/)
    await expect(page.locator('#demo pre').first()).toContainText('<Line y="users" label="users" />')
  })
})

test.describe('flow', () => {
  const transform = (page: Page, id: string) => page.locator(`#demo [data-nodeid="${id}"]`).evaluate((e) => (e as HTMLElement).style.transform)
  const counter = (page: Page) => page.locator('#demo p[aria-live] b').first()

  test('pointer: dragging a node moves it and re-runs no node component', async ({ page }) => {
    await openDemo(page, 'flow', '[data-nodeid="d"]')
    const before = await transform(page, 'd')
    const box = await page.locator('#demo [data-nodeid="d"]').boundingBox()
    if (!box) throw new Error('node d has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2 + i * 5)
    await page.mouse.up()
    expect(await transform(page, 'd')).not.toBe(before)
    await expect(page.locator('#demo [data-nodeid="d"]')).toHaveClass(/selected/)
    await expect(counter(page)).toHaveText('0')
  })

  test('keyboard: Enter selects a node, the arrows move it and the live region says so', async ({ page }) => {
    await openDemo(page, 'flow', '[data-nodeid="a"]')
    const before = await transform(page, 'a')
    await page.locator('#demo [data-nodeid="a"]').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    expect(await transform(page, 'a')).not.toBe(before)
    await expect(page.locator('#demo .pyreon-flow-a11y-live')).toHaveText(/^Moved Webhook \(trigger\) to /)
  })

  test('auto-layout lines the nodes up in layers and re-runs no node component', async ({ page }) => {
    await openDemo(page, 'flow', '[data-nodeid="a"]')
    await page.getByRole('button', { name: 'Scramble' }).click()
    await page.getByRole('button', { name: 'Auto-layout' }).focus()
    await page.keyboard.press('Enter')
    // Layered, left to right: the chain Webhook → Validate → Score lead shares one row.
    await expect
      .poll(async () => {
        const ys = await Promise.all(['a', 'b', 'd'].map((id) => transform(page, id).then((t) => t.split(',')[1])))
        return new Set(ys).size
      })
      .toBe(1)
    await expect(counter(page)).toHaveText('0')
  })
})

test.describe('editor', () => {
  const meters = (page: Page) => page.locator('#demo ul[aria-label] li b')

  test('keyboard: typing updates the counts and Mod+B sets Bold pressed', async ({ page }) => {
    await openDemo(page, 'editor', '.ProseMirror')
    const words = meters(page).nth(0)
    await expect(words).toHaveText('12')
    await page.locator('#demo .ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(' Three more words')
    await expect(words).toHaveText('15')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type(' bold')
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await expect(meters(page).nth(3)).toHaveText('true')
    await expect(page.locator('#demo .ProseMirror strong').last()).toHaveText('bold')
  })

  test('pointer: the toolbar sets Bold and makes a bulleted list', async ({ page }) => {
    await openDemo(page, 'editor', '.ProseMirror')
    await page.locator('#demo .ProseMirror p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    await page.getByRole('button', { name: 'Bold' }).click()
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Bulleted list' }).click()
    await expect(page.locator('#demo .ProseMirror ul li').last()).toHaveText('Edit this text.')
    await expect(page.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true')
    // The read-only code editor shows the same document.
    await expect(page.locator('#demo .cm-content')).toContainText('"bulletList"')
  })

  test('Load from outside replaces the document without an onChange echo', async ({ page }) => {
    await openDemo(page, 'editor', '.ProseMirror')
    await page.getByRole('button', { name: 'Load from outside' }).click()
    await expect(page.locator('#demo .ProseMirror')).toContainText('A draft saved on another device.')
    await expect(page.locator('#demo .ProseMirror ul li')).toHaveCount(3)
    await expect(page.locator('#demo p[aria-live]').first()).toHaveText(/onChange calls from the load: 0\./)
  })
})

test.describe('document', () => {
  const source = (page: Page) => page.locator('#demo pre').first()

  test('pointer: each format renders the same report', async ({ page }) => {
    await openDemo(page, 'document', 'iframe')
    await expect(page.frameLocator('#demo iframe').locator('h1, h2').first()).toHaveText('Sales report')
    await page.getByRole('button', { name: 'md', exact: true }).click()
    await expect(source(page)).toContainText('# Sales report')
    await page.getByRole('button', { name: 'csv', exact: true }).click()
    await expect(source(page)).toHaveText(/^Region,Revenue\s+US,\$1M\s+EU,\$800K\s+APAC,\$420K\s*$/)
    await page.getByRole('button', { name: 'slack', exact: true }).click()
    await expect(source(page)).toContainText('"type": "header"')
    await page.getByRole('button', { name: 'json', exact: true }).click()
    await expect(source(page)).toContainText('"type": "document"')
  })

  test('keyboard: switching format and quarter re-renders', async ({ page }) => {
    await openDemo(page, 'document', 'iframe')
    await page.getByRole('button', { name: 'csv', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(source(page)).toContainText('US,$1M')
    await page.getByRole('button', { name: 'Q3', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(source(page)).toContainText('US,$910K')
    await expect(page.getByRole('button', { name: 'Q3', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('the PDF download is a real PDF of the chosen quarter', async ({ page }) => {
    await openDemo(page, 'document', 'iframe')
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), page.getByRole('button', { name: 'Download .pdf' }).click()])
    expect(download.suggestedFilename()).toBe('q4-sales-report.pdf')
    const path = await download.path()
    expect(readFileSync(path).subarray(0, 4).toString('latin1')).toBe('%PDF')
    await expect(page.locator('#demo p[aria-live]').last()).toHaveText('Saved q4-sales-report.pdf, rendered in this tab.')
  })
})
