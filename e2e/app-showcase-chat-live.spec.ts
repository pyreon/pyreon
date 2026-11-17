import { expect, type Page, test } from '@playwright/test'

// app-showcase's live chat (/chat/live/:id, moved from the standalone examples/chat): the channel links route, the SSE
// stream connects and loads history, a sent message round-trips through the send mutation and the server echo, and the
// URL-synced channel search filters the list. The backend is the dev server's chat plugin
// (examples/app-showcase/src/sections/chat/data/devServer.ts).

// Vite's dev server re-optimizes deps on first load and returns a transient `504 (Outdated Optimize Dep)`, then retries — a
// dev-server artifact, not an app error.
const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

async function openGeneral(page: Page): Promise<void> {
  // Start on another channel so reaching #general is a real client-side route change.
  await page.goto('/chat/live/random')
  await expect(page.getByTestId('channel-rail')).toBeVisible()
  await page.getByTestId('channel-link-general').click()
  await expect(page.getByTestId('channel-page-general')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('connected')
}

test.describe('app-showcase live chat', () => {
  test('routes to a channel, connects the stream and loads history, with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await openGeneral(page)
    await expect(page).toHaveURL(/\/chat\/live\/general/)
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^[1-9]\d* messages$/)
    expect(errors).toEqual([])
  })

  test('the /chat view links to the live view', async ({ page }) => {
    await page.goto('/chat')
    await page.getByTestId('chat-live-link').click()
    await expect(page.getByTestId('channel-page-general')).toBeVisible()
  })

  test('a sent message round-trips and appears in the list once', async ({ page }) => {
    await openGeneral(page)
    const text = `e2e-${Date.now()}`
    await page.getByTestId('message-input').fill(text)
    await page.getByTestId('message-send').click()
    await expect(page.getByTestId('message-list')).toContainText(text)
    await expect(page.getByTestId('message-input')).toHaveValue('')
    // The optimistic row and the server echo reconcile into one message.
    await expect(page.getByTestId('message-list').getByText(text, { exact: true })).toHaveCount(1)
  })

  test('the channel search filters messages', async ({ page }) => {
    await openGeneral(page)
    const text = `needle-${Date.now()}`
    await page.getByTestId('message-input').fill(text)
    await page.getByTestId('message-send').click()
    await expect(page.getByTestId('message-list')).toContainText(text)
    await page.getByTestId('channel-search').fill(text)
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^1 of \d+ match$/)
    await expect(page).toHaveURL(new RegExp(`[?&]q=${text}`))
    await page.getByTestId('channel-search').fill('zzzz-no-such-message')
    await expect(page.getByTestId('channel-search-stats')).toHaveText(/^0 of \d+ match$/)
  })
})
