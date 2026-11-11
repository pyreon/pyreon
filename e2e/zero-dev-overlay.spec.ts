import { expect, type Page, test } from '@playwright/test'

/**
 * Zero's development error overlay, end to end: a real `vite dev` server with
 * `zero({ mode: 'ssr' })` serving the fixture in
 * `packages/zero/zero/src/tests/integration/dev-overlay-fixture`, in real
 * Chromium.
 *
 *   /ssr-error     a component reads `window` while the server renders it
 *   /loader-error  a route loader throws
 *   /hydration     the server and the browser render different text
 *
 * Line numbers are NOT asserted: the dev source map from the native compiler
 * backend is off by a line or two (pyreon/pyreon#4418), so the overlay points
 * where the map says. The tests assert the file and that the failing
 * statement is in the code frame.
 */

const dialog = (page: Page) => page.getByRole('alertdialog')

async function stubEditor(page: Page): Promise<string[]> {
  // Never launch a real editor from a test; record what would have opened.
  const opened: string[] = []
  await page.route('**/__open-in-editor**', async (route) => {
    opened.push(new URL(route.request().url()).searchParams.get('file') ?? '')
    await route.fulfill({ status: 200, body: '' })
  })
  return opened
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

test.describe('zero dev error overlay', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })
  })

  test('SSR error: chip, route and phase, message, code frame, fix, dimmed stack, editor, copy, Esc', async ({ page }) => {
    const opened = await stubEditor(page)
    const res = await page.goto('/ssr-error')
    expect(res?.status()).toBe(500)

    const d = dialog(page)
    await expect(d).toBeVisible()
    await expect(d).toHaveAttribute('aria-modal', 'true')
    await expect(d.locator('.pz-chip')).toHaveText('Server render failed')
    await expect(d.locator('.pz-where')).toHaveText('/ssr-error · SSR')
    await expect(d.getByRole('heading', { level: 2 })).toHaveText('window is not defined')

    const link = d.locator('.pz-file a')
    await expect(link).toHaveText(/^src\/routes\/ssr-error\.tsx:\d+$/)
    await expect(d.locator('.pz-code')).toContainText('const width = window.innerWidth')
    await expect(d.locator('.pz-code .pz-hl')).toHaveCount(1)
    await expect(d.locator('.pz-code .pz-caret')).toContainText('^ here')

    // The diagnose catalog's answer for a browser global read on the server.
    const fix = d.locator('.pz-fix')
    await expect(fix.getByRole('heading')).toHaveText('How to fix it')
    await expect(fix).toContainText('exists only in the browser')
    await expect(fix).toContainText('onMount')

    // App frame first and bright; framework frames dimmed.
    const frames = d.locator('.pz-stack li')
    await expect(frames.first()).toContainText('Viewport')
    await expect(frames.first()).not.toHaveClass(/pz-lib/)
    await expect(d.locator('.pz-stack li.pz-lib').first()).toContainText('@pyreon/')

    // Nothing in the overlay claims a hand-off that does not happen.
    await expect(d).not.toContainText('MCP')

    // Focus starts on the primary action and stays inside the dialog.
    const copy = d.getByRole('button', { name: 'Copy for your AI assistant' })
    await expect(copy).toBeFocused()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'))).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'))).toBe(true)

    // Open in editor hits Vite's endpoint with the absolute file and position.
    await d.getByRole('button', { name: 'Open in editor' }).click()
    await expect.poll(() => opened.length).toBe(1)
    expect(opened[0]).toMatch(/\/src\/routes\/ssr-error\.tsx:\d+:\d+$/)
    await expect(d.getByRole('status')).toHaveText('Opening the file in your editor.')

    // Copy for your AI assistant.
    await copy.click()
    await expect(d.getByRole('status')).toHaveText('Copied. Paste it into your AI assistant.')
    const text = await readClipboard(page)
    expect(text).toContain('Pyreon dev error: Server render failed')
    expect(text).toContain('Route: /ssr-error (SSR)')
    expect(text).toContain('window is not defined')
    expect(text).toMatch(/File: src\/routes\/ssr-error\.tsx:\d+:\d+/)
    expect(text).toContain('const width = window.innerWidth')
    expect(text).toContain('How to fix it:')
    expect(text).toMatch(/Stack:\n {2}at Viewport \(src\/routes\/ssr-error\.tsx:\d+:\d+\)/)
    expect(text).toContain('[library]')

    // Esc dismisses; a "Show the error" button takes focus and reopens it.
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    const reopen = page.getByRole('button', { name: 'Show the error' })
    await expect(reopen).toBeFocused()
    await reopen.press('Enter')
    await expect(d).toBeVisible()
    await expect(copy).toBeFocused()
  })

  test('loader error: "Loader threw" on the loader phase, no invented fix', async ({ page }) => {
    const res = await page.goto('/loader-error')
    expect(res?.status()).toBe(500)
    const d = dialog(page)
    await expect(d.locator('.pz-chip')).toHaveText('Loader threw')
    await expect(d.locator('.pz-where')).toHaveText('/loader-error · loader')
    await expect(d.getByRole('heading', { level: 2 })).toHaveText("Cannot read properties of undefined (reading 'name')")
    await expect(d.locator('.pz-file a')).toHaveText(/^src\/routes\/loader-error\.tsx:\d+$/)
    await expect(d.locator('.pz-code')).toContainText('return { name: account.profile!.name }')
    // No catalog entry matches this message, so there is no fix box.
    await expect(d.locator('.pz-fix')).toHaveCount(0)
    await expect(d.locator('.pz-stack li').first()).toContainText('loader')

    await d.getByRole('button', { name: 'Copy for your AI assistant' }).click()
    const text = await readClipboard(page)
    expect(text).toContain('Pyreon dev error: Loader threw')
    expect(text).toContain('Route: /loader-error (loader)')
    expect(text).not.toContain('How to fix it')
  })

  test('hydration mismatch: overlay over the live page, server vs client values, Esc returns focus', async ({ page }) => {
    await page.goto('/hydration')
    // The page itself rendered and hydrated; the overlay sits on top of it.
    await expect(page.locator('#where')).toHaveText('Rendered in the browser')

    const d = dialog(page) // inside the overlay's open shadow root
    await expect(d).toBeVisible()
    await expect(d.locator('.pz-chip')).toHaveText('Hydration mismatch')
    await expect(d.locator('.pz-where')).toHaveText('/hydration · client')
    await expect(d.getByRole('heading', { level: 2 })).toHaveText(
      '[Pyreon] Hydration mismatch (text): expected Rendered in the browser, got Rendered on the server at root > div > reactive > p > text',
    )
    await expect(d.locator('.pz-details')).toContainText('Server HTML"Rendered on the server"')
    await expect(d.locator('.pz-details')).toContainText('Client render"Rendered in the browser"')
    // No source location is known for a mismatch: no file link, no code frame.
    await expect(d.locator('.pz-file')).toHaveCount(0)
    await expect(d.locator('.pz-code')).toHaveCount(0)
    await expect(d.locator('.pz-fix')).toContainText('byte-identical')
    await expect(d.getByRole('button', { name: 'Copy for your AI assistant' })).toBeFocused()

    await d.getByRole('button', { name: 'Copy for your AI assistant' }).click()
    const text = await readClipboard(page)
    expect(text).toContain('Pyreon dev error: Hydration mismatch')
    expect(text).toContain('Route: /hydration (client)')
    expect(text).toContain('Server HTML: "Rendered on the server"')
    expect(text).toContain('Client render: "Rendered in the browser"')

    await page.keyboard.press('Escape')
    await expect(page.locator('pyreon-dev-overlay')).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  })

  test('320px wide: no horizontal page scroll; the code frame scrolls inside itself', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/ssr-error')
    await expect(dialog(page)).toBeVisible()
    const m = await page.evaluate(() => {
      const se = document.scrollingElement!
      const code = document.querySelector('.pz-code') as HTMLElement
      return { page: se.scrollWidth - se.clientWidth, codeOverflow: code.scrollWidth > code.clientWidth, codeStyle: getComputedStyle(code).overflowX }
    })
    expect(m.page).toBe(0)
    expect(m.codeStyle).toBe('auto')
    expect(m.codeOverflow).toBe(true)
  })

  test('respects reduced motion, and follows the stored light/dark preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/ssr-error')
    const d = dialog(page)
    await expect(d).toBeVisible()
    expect(await d.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    // OS dark, no stored preference: dark card.
    expect(await d.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(17, 17, 24)')

    // A stored zero-theme preference wins over the OS.
    await page.evaluate(() => localStorage.setItem('zero-theme', 'light'))
    await page.reload()
    await expect(page.locator('[data-pz-ol]')).toHaveAttribute('data-theme', 'light')
    expect(await dialog(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
    await page.evaluate(() => localStorage.removeItem('zero-theme'))
  })
})
