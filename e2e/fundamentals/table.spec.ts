/**
 * Real-Chromium proof for the TanStack Table **v9** migration.
 *
 * The unit suites run in happy-dom against `h()`; the example apps were
 * verified by typecheck + build. Neither proves the migrated table actually
 * WORKS in a browser — and v9 changed the things most likely to fail silently:
 * capabilities now exist only when their feature is registered (an unregistered
 * one is a runtime `TypeError`, not a type error), state moved to
 * `table.store.state`, and reactivity flows through the new bindings rather
 * than the v8 version counter.
 *
 * So this spec drives the migrated demo through every feature it registers —
 * sorting, global filtering, pagination — and asserts observable DOM, which is
 * the only layer that can distinguish "compiles" from "works".
 *
 * Before this file the table had NO dedicated e2e: `playground.spec.ts` only
 * smoke-navigated to `/table` without asserting anything about the table.
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/table')
  await page.waitForLoadState('networkidle')
  // The demo mounts a single table; wait for real rows, not just the shell.
  await expect(page.locator('tbody tr').first()).toBeVisible()
})

/** Text of the first column, top to bottom — the sort/filter observable. */
async function firstColumn(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('tbody tr td:first-child').allTextContents()
}

test('renders rows through the v9 core row model', async ({ page }) => {
  const rows = page.locator('tbody tr')
  await expect.poll(async () => rows.count()).toBeGreaterThan(0)
  // Cells render real content via flexRender, not "[object Object]" or empty.
  const first = (await firstColumn(page))[0]!
  expect(first.trim().length).toBeGreaterThan(0)
  expect(first).not.toContain('[object')
  expect(first).not.toContain('undefined')
})

test('sorting works — rowSortingFeature + sortedRowModel are wired', async ({ page }) => {
  const header = page.locator('thead th').first()

  // NOTE: the demo's fixture is already alphabetical, so an ASCENDING sort is a
  // no-op on the visible order. Asserting "the order changed" after the first
  // click would fail against a perfectly working table — so assert the sort
  // INVARIANT (and the indicator) instead, which holds for any initial order.
  //
  // A header click routes through getToggleSortingHandler(); if rowSortingFeature
  // were unregistered this would be a runtime TypeError, not a silent no-op.
  await header.click()
  await expect(header).toContainText('↑')
  const asc = await firstColumn(page)
  expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)))

  // Descending MUST change the visible rows — the half that proves the sorted
  // row model is actually re-deriving, not just that the indicator flipped.
  //
  // Assert the ORDERING INVARIANT, not `asc.reverse()`: the demo paginates, so
  // the descending page shows the other end of the dataset rather than this
  // page reversed.
  await header.click()
  await expect(header).toContainText('↓')
  await expect.poll(async () => (await firstColumn(page)).join('|')).not.toBe(asc.join('|'))
  const desc = await firstColumn(page)
  expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)))
  // …and it really is the opposite end: descending starts at or after where
  // ascending ended.
  expect(desc[0]!.localeCompare(asc[asc.length - 1]!)).toBeGreaterThanOrEqual(0)
})

test('global filtering works — globalFilteringFeature + filteredRowModel are wired', async ({
  page,
}) => {
  const search = page.getByPlaceholder('Search all columns...')
  const beforeCount = await page.locator('tbody tr').count()

  // Filter to a value taken from the live table, so the test does not depend
  // on fixture contents.
  const target = (await firstColumn(page))[0]!.trim()
  await search.fill(target)

  await expect.poll(async () => page.locator('tbody tr').count()).toBeLessThanOrEqual(beforeCount)
  const filtered = await firstColumn(page)
  expect(filtered.length).toBeGreaterThan(0)
  expect(filtered.some((t) => t.includes(target))).toBe(true)

  // Clearing restores — the filter is reactive in both directions.
  await search.fill('')
  await expect.poll(async () => page.locator('tbody tr').count()).toBe(beforeCount)
})

test('pagination works — rowPaginationFeature + paginatedRowModel are wired', async ({ page }) => {
  const next = page.getByRole('button', { name: 'Next' })
  const prev = page.getByRole('button', { name: 'Previous' })

  // `disabled` is bound as an accessor; on page 1 Previous must be disabled.
  // (Under v8 this was a bare expression evaluated once and never updated.)
  await expect(prev).toBeDisabled()

  const page1 = await firstColumn(page)
  await next.click()
  await expect.poll(async () => (await firstColumn(page)).join('|')).not.toBe(page1.join('|'))

  // Reads `table.store.state.pagination.pageIndex` — v9's replacement for the
  // removed `table.getState()`.
  await expect(page.locator('.section')).toContainText('Page 2 of')
  await expect(prev).toBeEnabled()

  await prev.click()
  await expect.poll(async () => (await firstColumn(page)).join('|')).toBe(page1.join('|'))
  await expect(prev).toBeDisabled()
})

test('no console errors while exercising every registered feature', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.locator('thead th').first().click()
  await page.getByPlaceholder('Search all columns...').fill('a')
  await page.getByPlaceholder('Search all columns...').fill('')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Previous' }).click()

  // An unregistered v9 feature surfaces here as "x is not a function".
  expect(errors).toEqual([])
})
