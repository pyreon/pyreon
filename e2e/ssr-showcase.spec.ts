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

// ─── <Image priority> preload (closes #1351) ─────────────────────────────────

test.describe('<Image priority> preload', () => {
  // The browser's preload scanner reads the raw HTML response BEFORE
  // hydration runs and BEFORE the body's <img> is parsed. So the
  // preload <link> MUST be in the initial HTML response — not injected
  // by client-side JS. This spec asserts that contract against the SSR
  // response bytes (page.goto → response.text()), not against the
  // hydrated DOM.

  test('priority preload <link> is present in the initial HTML response', async ({ page }) => {
    const response = await page.goto('/image-priority-probe')
    const html = await response!.text()
    // The <head> contains a preload link emitted via useHead at render
    // time. We slice to </head> to guarantee we're reading the head
    // section, not a stray inline string in the body.
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('rel="preload"')
    expect(head).toContain('as="image"')
    expect(head).toContain('fetchpriority="high"')
    // Cross-origin src → crossorigin="anonymous" to avoid double-fetch.
    expect(head).toContain('crossorigin="anonymous"')
    // Responsive srcset → imagesrcset attribute carries it (so the
    // preload scanner picks the same size the body's <img> will).
    expect(head).toContain('imagesrcset')
  })

  test('priority body <img> carries fetchpriority="high" + loading="eager" in SSR HTML', async ({ page }) => {
    // Read the raw SSR HTML response — same shape the verify-modes cell
    // and the preload-in-head spec above both assert. The body's <img>
    // is part of the SSR'd markup; hydration doesn't change these attrs.
    const response = await page.goto('/image-priority-probe')
    const html = await response!.text()
    // Slice to the probe's <main> region to anchor against the right
    // element (avoids matching some unrelated <img> if the showcase
    // ever ships a header logo or similar).
    const probeStart = html.indexOf('data-testid="image-priority-probe"')
    expect(probeStart).toBeGreaterThan(-1)
    const probeEnd = html.indexOf('</main>', probeStart)
    const probeSlice = html.slice(probeStart, probeEnd)
    // fetchPriority (camelCase in JSX) serializes to `fetchpriority` (DOM
    // lowercase). loading="eager" is set by `useImage` when `priority` is
    // true.
    expect(probeSlice).toContain('fetchpriority="high"')
    expect(probeSlice).toContain('loading="eager"')
  })
})

// ─── usePreloadFont (closes #1359 e2e coverage) ──────────────────────────────

test.describe('usePreloadFont — runtime font preload', () => {
  // The browser's preload scanner reads the raw HTML response BEFORE
  // hydration. `usePreloadFont` must emit a `<link rel="preload" as="font">`
  // into <head> at SSR time, with the type + crossorigin contracts the
  // helper documents. This mirrors the <Image priority> preload spec but
  // for fonts.

  test('font preloads are present in the initial HTML response', async ({ page }) => {
    const response = await page.goto('/font-preload-probe')
    const html = await response!.text()
    const head = html.slice(0, html.indexOf('</head>'))
    // Both distinct hrefs present.
    expect(head).toContain('href="/fonts/display-bold.woff2"')
    expect(head).toContain('href="https://cdn.example.com/brand.woff2"')
    // rel + as.
    expect(head).toContain('rel="preload"')
    expect(head).toContain('as="font"')
    // type — required by the preload scanner.
    expect(head).toContain('type="font/woff2"')
    // crossorigin — CSS Fonts spec.
    expect(head).toContain('crossorigin="anonymous"')
  })

  test('dedup: two usePreloadFont calls with the same href emit ONE preload', async ({ page }) => {
    // The probe route calls `usePreloadFont('/fonts/display-bold.woff2')`
    // twice. The output must contain that href exactly once — dedup is
    // handled by @pyreon/head's LinkTag href-keying.
    const response = await page.goto('/font-preload-probe')
    const html = await response!.text()
    const head = html.slice(0, html.indexOf('</head>'))
    const matches = head.match(/href="\/fonts\/display-bold\.woff2"/g) ?? []
    expect(matches.length).toBe(1)
  })
})

// ─── Custom-Property Style Extraction (CPSE) ────────────────────────────────────

test.describe('CPSE — cpseStyled end-to-end (SSR + hydration + dynamic)', () => {
  test('SSR emits inline custom properties (NOT baked values); the rule is value-agnostic', async ({
    page,
  }) => {
    const html = await (await page.goto('/cpse-probe'))!.text()
    // SSR HTML: the elements carry inline custom properties, and the value is
    // NOT baked into a `padding:` declaration. (In dev, styler injects the
    // shared CSS rule client-side, so the rule itself is asserted from the live
    // stylesheet below — not the raw SSR HTML.)
    expect(html).toContain('--u-') // inline custom property on the elements
    expect(html).toContain('2.25rem') // box-36's value carried as the inline var
    expect(html).not.toContain('padding: 2.25rem') // NOT value-baked…
    expect(html).not.toContain('padding:2.25rem')

    // The shared CSS rule is value-agnostic — it references a custom property.
    await page.getByTestId('cpse-probe').waitFor()
    const hasVarRule = await page.evaluate(() => {
      for (const ss of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = ss.cssRules
        } catch {
          continue
        }
        for (const r of Array.from(rules)) if (r.cssText.includes('var(--u-')) return true
      }
      return false
    })
    expect(hasVarRule).toBe(true)
  })

  test('O(N)→O(1): N distinct values share ONE class, each computes its own padding', async ({
    page,
  }) => {
    await page.goto('/cpse-probe')
    await page.getByTestId('cpse-probe').waitFor()

    const boxes = ['box-8', 'box-16', 'box-24', 'box-36']
    const expected = ['8px', '16px', '24px', '36px']
    const classes: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      const el = page.getByTestId(boxes[i]!)
      // Each distinct value computes its own padding (parity with value-baking).
      await expect(el).toHaveCSS('padding-top', expected[i]!)
      classes.push((await el.getAttribute('class'))!.trim())
    }
    // …yet all four share ONE value-agnostic class.
    expect(new Set(classes).size).toBe(1)
  })

  test('dynamic: a signal-driven box updates its computed padding on click', async ({ page }) => {
    await page.goto('/cpse-probe')
    const dyn = page.getByTestId('box-dyn')
    await expect(dyn).toHaveCSS('padding-top', '8px')
    await expect(page.getByTestId('pad-val')).toHaveText('8')

    await page.getByTestId('bump').click()
    await expect(page.getByTestId('pad-val')).toHaveText('16') // signal updated (hydrated)
    await expect(dyn).toHaveCSS('padding-top', '16px') // inline var patched in place
  })
})
