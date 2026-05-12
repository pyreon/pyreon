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
    // M1.2 — the runtime SSR 404 path now renders the `_404.tsx` component
    // through the router (see the M1.2 spec below), so the canonical signal
    // is the component's testid. The earlier `.or('text=404')` fallback was
    // for the pre-M1 static 404 page from `render404Page(undefined)` and is
    // no longer needed.
    await expect(page.getByTestId('not-found-page')).toBeVisible()
  })

  test('runtime SSR 404 wraps not-found in layout chrome (M1.2)', async ({ page }) => {
    // M1.2 — Pre-M1, runtime SSR's `entry-server.ts` (prod) and
    // `vite-plugin.ts:renderSsr` (dev) both bypassed the router for
    // unmatched URLs and rendered the 404 component standalone with
    // no layout wrapping. With PR L5's `findNotFoundFallback` in
    // resolveRoute + M1.2's three call-site changes (handler.ts reads
    // `resolved.isNotFound` → status 404; entry-server.ts defers to
    // handler when routes tree has `notFoundComponent`; vite-plugin.ts
    // drops URL-pattern bailout + returns `{ html, status }`), unmatched
    // URLs route through the router-driven path that produces a chain
    // `[rootLayout, syntheticLeaf]` — the layout's chrome (nav links +
    // PyreonUI) wraps the 404 content.
    //
    // Bisect-verified at the dev-e2e layer: reverting vite-plugin.ts's
    // pattern-bailout removal makes `getByTestId('not-found-page')`
    // assertion fail with "element(s) not found" — handle404's static
    // `render404Page(undefined)` fallback (no 404 component, no layout
    // chrome) fires instead. Recipe: stash src/vite-plugin.ts → rebuild
    // `bun run --filter='@pyreon/zero' build` → kill dev server → re-run.
    const response = await page.goto('/this-runtime-ssr-route-also-does-not-exist')
    // HTTP status 404 (from handler reading resolved.isNotFound).
    expect(response?.status()).toBe(404)
    // 404 component visible
    await expect(page.getByTestId('not-found-page')).toBeVisible()
    // Layout chrome co-occurs (the win that M1.2 brings to runtime SSR)
    await expect(page.getByTestId('nav-home')).toBeVisible()
    await expect(page.getByTestId('nav-about')).toBeVisible()
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
