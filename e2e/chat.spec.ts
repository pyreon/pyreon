import { expect, type Page, test } from '@playwright/test'

// Real-Chromium gate for the chat showcase: the channel rail routes, the SSE stream connects, a sent message round-trips
// through the send mutation and the server echo, and the URL-synced channel search filters the list.

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

  test('a sent message round-trips and appears in the list', async ({ page }) => {
    await openGeneral(page)
    const text = `e2e-${Date.now()}`
    await page.getByTestId('message-input').fill(text)
    await page.getByTestId('message-send').click()
    await expect(page.getByTestId('message-list')).toContainText(text)
    await expect(page.getByTestId('message-input')).toHaveValue('')
  })

  test('the channel search filters messages', async ({ page }) => {
    await openGeneral(page)
    const text = `needle-${Date.now()}`
    await page.getByTestId('message-input').fill(text)
    await page.getByTestId('message-send').click()
    await expect(page.getByTestId('message-list')).toContainText(text)
    await page.getByTestId('channel-search').fill(text)
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^1 of \d+ match$/)
    await page.getByTestId('channel-search').fill('zzzz-no-such-message')
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^0 of \d+ match$/)
  })
})
