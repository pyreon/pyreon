import { expect, type Page, test } from '@playwright/test'

// Real-Chromium gate for the HN clone. The app reads api.hnpwa.com from the browser; every request is answered here, so
// the run is offline and the spec can assert which feed pages the app asks for.

// Vite's dev server re-optimizes deps on first load and returns a transient `504 (Outdated Optimize Dep)`, then retries — a
// dev-server artifact, not an app error.
const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

const story = (id: number, title: string) => ({
  id,
  title,
  points: 100 + id,
  user: `user${id}`,
  time: 1_700_000_000 + id,
  time_ago: `${id} hours ago`,
  comments_count: id,
  type: 'link',
  url: `https://example.com/${id}`,
  domain: 'example.com',
})

async function mockApi(page: Page, requested: string[], status = 200): Promise<void> {
  await page.route('https://api.hnpwa.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requested.push(path)
    const m = path.match(/\/(news|newest|ask|show|jobs)\/(\d+)\.json$/)
    const pageNo = m ? Number(m[2]) : 1
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(
        status === 200 ? [story(pageNo * 10 + 1, `Story A p${pageNo}`), story(pageNo * 10 + 2, `Story B p${pageNo}`)] : {},
      ),
    })
  })
}

test.describe('hn-clone', () => {
  test('the front page lists the feed, ranked, with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    const requested: string[] = []
    await mockApi(page, requested)
    await page.goto('/')
    const rows = page.locator('[data-testid="feed"] .story-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('1.')
    await expect(rows.nth(0)).toContainText('Story A p1')
    await expect(rows.nth(0)).toContainText('example.com')
    await expect(rows.nth(1)).toContainText('2.')
    expect(requested).toContain('/v0/news/1.json')
    expect(errors).toEqual([])
  })

  test('"more" asks for the next feed page and the ranks continue from 31', async ({ page }) => {
    const requested: string[] = []
    await mockApi(page, requested)
    await page.goto('/')
    await expect(page.locator('.story-row')).toHaveCount(2)
    await page.getByRole('link', { name: /more/ }).click()
    await expect(page).toHaveURL(/\?page=2/)
    await expect(page.locator('.story-row').first()).toContainText('Story A p2')
    await expect(page.locator('.story-row').first()).toContainText('31.')
    expect(requested).toContain('/v0/news/2.json')
  })

  test('a failing API shows the error state instead of an empty page', async ({ page }) => {
    const requested: string[] = []
    await mockApi(page, requested, 500)
    await page.goto('/')
    // TanStack retries a failed query 3 times with exponential backoff (1s + 2s + 4s) before it settles into `error`.
    await expect(page.locator('.feed-state.error')).toContainText('Failed to load', { timeout: 20_000 })
  })
})
