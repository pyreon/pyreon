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

test('search filters the sidebar; escape clears', async ({ page }) => {
  await page.getByTestId('loom-search').fill('rocketstyle')
  await expect(page.getByTestId('pkg-@pyreon/rocketstyle')).toBeVisible()
  expect(await page.locator('[data-testid^="pkg-"]').count()).toBeLessThan(6)
  await page.keyboard.press('Escape')
  expect(await page.locator('[data-testid^="pkg-"]').count()).toBeGreaterThan(100)
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
  // CLAUDE.md's own claim, asserted through the UI: the runtime graph is clean.
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
