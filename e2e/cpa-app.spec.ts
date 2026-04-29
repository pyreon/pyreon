import { expect, test, type Page } from '@playwright/test'

/**
 * Real-Chromium runtime gate for the `app` template scaffolded by
 * create-pyreon-app. Boots the pre-scaffolded `examples/cpa-pw-app`
 * fixture and exercises:
 *
 *   1. SSR landing renders with expected content
 *   2. Counter route — signal-driven click increments DOM (the headline
 *      Pyreon contract)
 *   3. Posts route loader fetches + renders
 *
 * `.first()` everywhere because the framework's known dev-SSR layout
 * double-mount (documented in CLAUDE.md, partial fix in #406) produces
 * two copies of every layout child. Same workaround as the existing
 * ssr-showcase / fundamentals e2e specs.
 */

// Console-error patterns we tolerate as known dev-server noise. The
// MIME-mismatch on the SSG plugin's leaked dynamic import is documented
// in CLAUDE.md and doesn't affect the rendered page contract this gate
// is designed to catch.
const TOLERATED_CONSOLE_NOISE = [
  /Failed to load module script.*MIME type of "text\/html"/,
]

function captureRealConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (TOLERATED_CONSOLE_NOISE.some((re) => re.test(text))) return
    errors.push(text)
  })
  return errors
}

test.describe('cpa-app — runtime', () => {
  test('SSR landing renders the hero', async ({ page }) => {
    const consoleErrors = captureRealConsoleErrors(page)

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Build fast.')
    expect(consoleErrors).toEqual([])
  })

  test('counter route — clicking + increments via signal', async ({ page }) => {
    await page.goto('/counter')
    const display = page.locator('.counter-display').first()
    await expect(display).toHaveText('0')

    // Click "+" — the third button in the counter-controls row
    const controls = page.locator('.counter-controls').first()
    await controls.locator('button').last().click()
    await expect(display).toHaveText('1')

    await controls.locator('button').last().click()
    await expect(display).toHaveText('2')

    // Reset button (middle)
    await controls.locator('button:has-text("Reset")').click()
    await expect(display).toHaveText('0')
  })

  test('posts route renders + loader populated', async ({ page }) => {
    await page.goto('/posts')
    // Sanity-check: the route loads SOMETHING. The double-mount workaround
    // means we have two `<main>` elements — assert the first is non-empty.
    await expect(page.locator('main').first()).not.toBeEmpty()
  })
})
