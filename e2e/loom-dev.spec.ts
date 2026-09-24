/**
 * `loom dev` — the observatory served by the REAL CLI over the REAL Pyreon
 * monorepo (the richest workspace available: 140+ internal packages, 8 depth
 * levels, real drift findings). Every spec drives the UI the way a user does.
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loom-shell')).toBeVisible({ timeout: 30_000 })
})

test('the layered graph renders internal + external nodes with depth axes', async ({ page }) => {
  await expect(page.getByTestId('view-title')).toHaveText('Dependency graph')
  expect(await page.locator('[data-testid^="gnode-"]').count()).toBeGreaterThan(100)
  await expect(page.locator('svg text', { hasText: 'ENTRY' })).toBeVisible()
})

test('selecting a node fills the detail panel: metrics, deps, path', async ({ page }) => {
  await page.getByTestId('pkg-@pyreon/core').click()
  await expect(page.getByTestId('panel-name')).toHaveText('@pyreon/core')
  // core's one runtime dep is reactivity; the path block ends at core itself.
  await expect(page.getByTestId('loom-panel')).toContainText('@pyreon/reactivity')
  await expect(page.getByTestId('panel-path')).toContainText('@pyreon/core')
})

test('dep chips navigate the selection', async ({ page }) => {
  await page.getByTestId('pkg-@pyreon/core').click()
  await page.getByTestId('loom-panel').getByRole('button', { name: '@pyreon/reactivity', exact: true }).first().click()
  await expect(page.getByTestId('panel-name')).toHaveText('@pyreon/reactivity')
})

test('⌘K search is a lookup, not a filter: the sidebar behind it keeps every row', async ({ page }) => {
  // The palette owns its own query. It used to write the shared filter, so
  // every keystroke re-filtered (and emptied) the sidebar + graph behind it.
  const rows = await page.locator('[data-testid^="pkg-"]').count()
  await page.getByTestId('search-trigger').click()
  await page.getByTestId('loom-search').fill('rocketstyle')
  await expect(page.getByTestId('search-dialog').getByText('rocketstyle').first()).toBeVisible()
  expect(await page.locator('[data-testid^="pkg-"]').count()).toBe(rows)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('search-dialog')).toHaveCount(0)
  // Re-opening starts from an empty query.
  await page.getByTestId('search-trigger').click()
  await expect(page.getByTestId('loom-search')).toHaveValue('')
})

test('fulltext: a finding code surfaces flagged packages with the reason chip', async ({ page }) => {
  await page.getByTestId('search-trigger').click()
  await page.getByTestId('loom-search').fill('unused-dep')
  const dialog = page.getByTestId('search-dialog')
  // The workspace ships with unused-dep INFO findings — the hits are packages
  // whose FINDINGS matched, not whose names did, and the chip says so.
  await expect(dialog.getByText('finding · unused-dep').first()).toBeVisible()
  // Enter selects the top hit and closes — the detail rail follows.
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
})

test('fulltext: a package name surfaces its dependents via the edge chips', async ({ page }) => {
  await page.getByTestId('search-trigger').click()
  await page.getByTestId('loom-search').fill('@pyreon/reactivity')
  const dialog = page.getByTestId('search-dialog')
  // Hits are reactivity itself PLUS every package whose EDGES matched — the
  // chip names the relationship, so the row explains why it surfaced.
  await expect(dialog.getByText('depends on · @pyreon/reactivity').first()).toBeVisible()
})

test('kind filter narrows to externals', async ({ page }) => {
  await page.getByTestId('kind-external').click()
  expect(await page.locator('[data-testid^="pkg-@pyreon/"]').count()).toBe(0)
  await expect(page.getByTestId('pkg-vite')).toBeVisible()
})

test('matrix view renders the internal adjacency block', async ({ page }) => {
  await page.getByTestId('view-matrix').click()
  await expect(page.getByTestId('matrix-view')).toBeVisible()
  await expect(page.getByTestId('view-title')).toHaveText('Adjacency matrix')
})

test('cycles view reports the acyclic truth for this repo', async ({ page }) => {
  await page.getByTestId('view-cycles').click()
  // AGENTS.md's own claim, asserted through the UI: the runtime graph is clean.
  await expect(page.getByTestId('cycles-clean')).toBeVisible()
})

test('impact view ranks by reach with reactivity at the top', async ({ page }) => {
  await page.getByTestId('view-impact').click()
  const first = page.locator('[data-testid^="impact-@"]').first()
  // The foundation package every other depends on — rank 01 by construction.
  await expect(first).toHaveAttribute('data-testid', 'impact-@pyreon/reactivity')
})

test('manifest table renders every node as a row with a status badge', async ({ page }) => {
  await page.getByTestId('view-table').click()
  expect(await page.locator('[data-testid^="row-"]').count()).toBeGreaterThan(200)
  await expect(page.locator('[data-testid="row-@pyreon/core"]')).toContainText('current')
})

test('dark toggle flips the shell theme', async ({ page }) => {
  const shell = page.getByTestId('loom-shell')
  const before = await shell.evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.getByTestId('dark-toggle').click()
  await expect
    .poll(async () => shell.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(before)
})

test('keyboard ↑↓ walks the visible list', async ({ page }) => {
  await page.getByTestId('pkg-@pyreon/core').click()
  const before = await page.getByTestId('panel-name').textContent()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.getByTestId('panel-name').textContent()).not.toBe(before)
})

test('health pill reflects the fabric state', async ({ page }) => {
  // The repo currently carries real drift errors — the pill must say SOMETHING
  // truthful (error count or cycle count or clean), never render empty.
  await expect(page.getByTestId('loom-health')).not.toHaveText('')
})

// ── interaction performance: selection/hover must not rebuild the views ──

test('matrix: a selection change keeps every cell element (no rebuild) and moves the crosshair', async ({ page }) => {
  await page.getByTestId('view-matrix').click()
  const grid = page.getByTestId('matrix-grid')
  await expect(grid).toBeVisible()
  // Only edge cells render — never the n² blank grid.
  const cells = await grid.locator('button[aria-label]').count()
  expect(cells).toBeGreaterThan(100)
  expect(cells).toBeLessThan(5000)
  await page.evaluate(() => {
    ;(window as unknown as { __cells: Element[] }).__cells = [...document.querySelectorAll('[data-testid="matrix-grid"] button')]
  })
  await page.getByTestId('pkg-@pyreon/core').click()
  await page.getByTestId('pkg-@pyreon/router').click()
  await page.getByTestId('cycles-toggle').click()
  const same = await page.evaluate(() => {
    const before = (window as unknown as { __cells: Element[] }).__cells
    const now = [...document.querySelectorAll('[data-testid="matrix-grid"] button')]
    return now.length === before.length && now.every((el, i) => el === before[i])
  })
  expect(same).toBe(true)
  // The crosshair band is placed on the selected row.
  const band = await page.locator('.lm-mx-bandr').evaluate((el) => getComputedStyle(el).display)
  expect(band).toBe('block')
})

test('graph: hover and selection keep the node elements (no SVG rebuild)', async ({ page }) => {
  const node = page.getByTestId('gnode-@pyreon/core')
  const handle = await node.elementHandle()
  await page.getByTestId('pkg-@pyreon/router').click()
  await page.evaluate(() => {
    const m = (window as unknown as { __LOOM_MODEL__: { hoverId: { set(v: string | null): void } } }).__LOOM_MODEL__
    m.hoverId.set('@pyreon/core')
    m.hoverId.set(null)
  })
  expect(await page.evaluate((el) => el?.isConnected, handle)).toBe(true)
  expect(await node.evaluate((el, prev) => el === prev, handle)).toBe(true)
})

test('keyboard selection keeps the sidebar row on screen', async ({ page }) => {
  await page.getByTestId('pkg-@pyreon/docs').click()
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown')
  const id = await page.getByTestId('panel-name').textContent()
  await expect(page.getByTestId(`pkg-${id}`)).toBeInViewport()
})

test('manifest table: header columns line up with the row cells', async ({ page }) => {
  await page.getByTestId('view-table').click()
  const head = await page.locator('.lm-tbl th').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  const cells = await page
    .locator('[data-testid="row-@pyreon/core"] td')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  expect(head.length).toBe(5)
  expect(cells).toEqual(head)
})

test('theme follows the OS, and a toggled choice survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => localStorage.removeItem('loom:theme'))
  await page.reload()
  const shell = page.getByTestId('loom-shell')
  await expect(shell).toHaveAttribute('data-lm-theme', 'light')
  await page.getByTestId('dark-toggle').click()
  await expect(shell).toHaveAttribute('data-lm-theme', 'dark')
  await page.reload()
  await expect(page.getByTestId('loom-shell')).toHaveAttribute('data-lm-theme', 'dark')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 15, 20)')
})

test('the selection is carried in the URL hash and restored on load', async ({ page }) => {
  await page.getByTestId('pkg-@pyreon/router').click()
  await expect(page).toHaveURL(/#pkg=@pyreon\/router$/)
  await page.reload()
  await expect(page.getByTestId('panel-name')).toHaveText('@pyreon/router')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the graph gets the screen; sidebar + panel are drawers', async ({ page }) => {
    await expect(page.getByTestId('graph-view')).toBeInViewport()
    await expect(page.getByTestId('loom-sidebar')).toHaveCount(0)
    await expect(page.getByTestId('loom-panel')).toHaveCount(0)
    await page.getByTestId('nav-toggle').click()
    await expect(page.getByTestId('loom-sidebar')).toBeVisible()
    await page.getByTestId('pkg-@pyreon/router').click()
    // Picking a package closes the drawer again.
    await expect(page.getByTestId('loom-sidebar')).toHaveCount(0)
    await page.getByTestId('view-table').click()
    await expect(page.getByTestId('table-view')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
