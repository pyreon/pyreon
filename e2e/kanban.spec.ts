import { expect, test } from '@playwright/test'

// Real-Chromium gate for the kanban showcase: the board renders its seeded columns and cards, adding a column and a card
// updates the live stats, and the URL-synced search filters cards and survives a reload.

// Vite's dev server re-optimizes deps on first load and returns a transient `504 (Outdated Optimize Dep)`, then retries — a
// dev-server artifact, not an app error.
const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

const stats = (page: import('@playwright/test').Page) => page.getByTestId('board-stats')

test.describe('kanban', () => {
  test('renders the seeded board with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto('/')
    await expect(page.getByTestId('kanban-board')).toBeVisible()
    await expect(stats(page)).toHaveText(/^\d+ columns · \d+ cards$/)
    expect(await page.locator('[data-testid^="card-"][data-testid$="-delete"]').count()).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('adding a column updates the stats', async ({ page }) => {
    await page.goto('/')
    await expect(stats(page)).toHaveText(/columns/)
    const before = Number(((await stats(page).textContent()) ?? '').match(/^(\d+) columns/)?.[1])
    await page.getByTestId('add-column-btn').click()
    await page.getByTestId('new-column-input').fill('Review')
    await page.getByTestId('new-column-add').click()
    await expect(stats(page)).toHaveText(new RegExp(`^${before + 1} columns`))
  })

  test('the search filters cards and the term lives in the URL', async ({ page }) => {
    await page.goto('/')
    await expect(stats(page)).toHaveText(/cards/)
    const cards = page.locator('[data-testid^="card-"][data-testid$="-priority"]')
    const total = await cards.count()
    expect(total).toBeGreaterThan(1)
    await page.getByTestId('board-search').fill('zzzz-no-such-card')
    await expect.poll(() => cards.count()).toBe(0)
    await expect(page).toHaveURL(/q=zzzz-no-such-card/)
    await page.reload()
    await expect(page.getByTestId('board-search')).toHaveValue('zzzz-no-such-card')
    await expect.poll(() => cards.count()).toBe(0)
    await page.getByTestId('board-search').fill('')
    await expect.poll(() => cards.count()).toBe(total)
  })
})
