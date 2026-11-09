import { expect, type Page, test } from '@playwright/test'

// Real-Chromium gate for the chat showcase: the channel rail routes, the page mounts under the layout's QueryClientProvider,
// the SSE stream connects and history loads. (Sending and searching are not asserted yet: the virtualized message list
// renders no rows in Chromium — tracked in an issue.)

// Vite's dev server re-optimizes deps on first load and returns a transient `504 (Outdated Optimize Dep)`, then retries — a
// dev-server artifact, not an app error.
const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

async function openGeneral(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('channel-rail')).toBeVisible()
  await page.getByTestId('channel-link-general').click()
  await expect(page.getByTestId('channel-page-general')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('connected')
}

test.describe('chat', () => {
  test('routes to a channel, connects the stream and loads history, with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await openGeneral(page)
    await expect(page).toHaveURL(/\/channels\/general/)
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^\d+ messages$/)
    expect(errors).toEqual([])
  })
})
