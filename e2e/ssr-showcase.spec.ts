/**
 * End-to-end tests for the SSR Showcase app.
 * Tests SSR rendering, hydration, routing, loaders, and theme switching
 * using Pyreon Zero with Vite dev server.
 */

import { expect, test } from '@playwright/test'

// ─── SSR Content ──────────────────────────────────────────────────────────────

test.describe('SSR content', () => {
  test('page source contains rendered HTML', async ({ page }) => {
    // Fetch the raw HTML before JS executes
    const response = await page.goto('/')
    const html = await response!.text()

    // The page should contain SSR-rendered content in the HTML source
    expect(html).toContain('SSR Showcase')
    expect(html).toContain('<div id="app">')
  })

  test('meta tags in source', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    // Either the meta title is set or the fallback HTML title
    expect(title).toContain('SSR Showcase')
  })

  test('nav links present', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="nav-home"]')).toBeVisible()
    await expect(page.locator('[data-testid="nav-about"]')).toBeVisible()
    await expect(page.locator('[data-testid="nav-posts"]')).toBeVisible()
  })
})

// ─── Hydration ────────────────────────────────────────────────────────────────

test.describe('hydration', () => {
  test('counter works after hydration — click increments', async ({ page }) => {
    await page.goto('/')
    // Wait for hydration
    await expect(page.locator('[data-testid="counter"]')).toBeVisible()

    const value = page.locator('[data-testid="counter-value"]')
    await expect(value).toHaveText('0')

    await page.locator('[data-testid="increment"]').click()
    await expect(value).toHaveText('1')

    await page.locator('[data-testid="increment"]').click()
    await expect(value).toHaveText('2')

    await page.locator('[data-testid="decrement"]').click()
    await expect(value).toHaveText('1')
  })

  test('no console errors during hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page.locator('[data-testid="counter"]')).toBeVisible()

    // Filter out known non-issues (e.g. favicon 404)
    const realErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404'),
    )
    expect(realErrors).toHaveLength(0)
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

test.describe('navigation', () => {
  test('client-side nav — no full reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()

    // Track if a full navigation (page reload) happens
    let fullReload = false
    page.on('load', () => { fullReload = true })

    // Click the About link
    await page.locator('[data-testid="nav-about"]').click()
    await expect(page.locator('[data-testid="about-page"]')).toBeVisible()

    // The layout should still be there (no full reload)
    expect(fullReload).toBe(false)
    await expect(page.locator('nav')).toBeVisible()
  })

  test('back/forward works', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()

    // Navigate to About
    await page.locator('[data-testid="nav-about"]').click()
    await expect(page.locator('[data-testid="about-page"]')).toBeVisible()

    // Go back
    await page.goBack()
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()

    // Go forward
    await page.goForward()
    await expect(page.locator('[data-testid="about-page"]')).toBeVisible()
  })

  test('404 page for unknown route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    // Should show 404 content (either SSR 404 or client-side 404)
    await expect(
      page.locator('[data-testid="not-found-page"]').or(page.locator('text=404')),
    ).toBeVisible()
  })
})

// ─── Route Loaders ────────────────────────────────────────────────────────────

test.describe('route loaders', () => {
  test('posts page shows loader data', async ({ page }) => {
    await page.goto('/posts')
    await expect(page.locator('[data-testid="posts-page"]')).toBeVisible()

    // Should show the post items from the loader
    const items = page.locator('[data-testid="post-item"]')
    await expect(items).toHaveCount(3)
    await expect(items.first()).toContainText('Getting Started with Pyreon')
  })

  test('individual post page loads', async ({ page }) => {
    await page.goto('/posts/1')
    await expect(page.locator('[data-testid="post-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="post-title"]')).toHaveText(
      'Getting Started with Pyreon',
    )
    await expect(page.locator('[data-testid="post-body"]')).toContainText(
      'fastest signal-based UI framework',
    )
  })
})

// ─── Theme ────────────────────────────────────────────────────────────────────

test.describe('theme', () => {
  test('theme toggle changes data-theme', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="theme-toggle"]')).toBeVisible()

    // Click toggle to switch theme
    await page.locator('[data-testid="theme-toggle"]').click()

    // data-theme should change on the html element
    const theme = await page.locator('html').getAttribute('data-theme')
    expect(theme).toBeTruthy()
    expect(['light', 'dark']).toContain(theme)
  })

  test('theme persists across toggle clicks', async ({ page }) => {
    await page.goto('/')

    // Toggle twice — should cycle through themes
    const toggle = page.locator('[data-testid="theme-toggle"]')
    await toggle.click()
    const firstTheme = await page.locator('html').getAttribute('data-theme')

    await toggle.click()
    const secondTheme = await page.locator('html').getAttribute('data-theme')

    // The two themes should be different (toggled)
    expect(firstTheme).not.toEqual(secondTheme)
  })
})
