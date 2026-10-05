import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForHydration } from './hydration-barrier'

// Discover the runnable files independently of the gallery generator. A new
// example gets a real-browser check; a generator omission cannot silently pass.
const exampleRoot = resolve(__dirname, '../docs/src/examples')
const examplePaths = readdirSync(exampleRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
  .map((entry) => resolve(entry.parentPath, entry.name).slice(exampleRoot.length + 1).replace(/\.tsx$/, ''))
  .sort()

test.describe('complete docs example gallery', () => {
  for (const path of examplePaths) {
    test(`${path} loads visible content`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/docs/examples')
      await waitForHydration(page)
      const example = page.locator(`[data-example-file="./examples/${path}"]`)
      await expect(example).toHaveCount(1)
      await example.scrollIntoViewIfNeeded()
      await expect(example.locator('.pyreon-example__loading')).toHaveCount(0, { timeout: 15_000 })
      await expect(example.locator('.pyreon-example__error')).toHaveCount(0)
      // Several demos intentionally draw without text. Check rendered area,
      // so a skeleton disappearing into only comment nodes cannot pass.
      await expect.poll(() => example.locator('.pyreon-example__surface').evaluate((surface) =>
        [...surface.querySelectorAll('*')].some((node) => {
          const box = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return box.width * box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }),
      )).toBe(true)
      expect(errors, path).toEqual([])
    })
  }
})

// docs parity gate. Five specs map to the five categories of
// rollout risk: landing rendering, navigation, scroll-spy, 404, and
// the heavy custom-component pages.

/**
 * Bring every `<Example>` on the page into view.
 *
 * `<Example>` lazy-mounts: it defers its dynamic import until an
 * IntersectionObserver (rootMargin 400px) says it is near the viewport, so a
 * gallery page does not fire 40 chunk loads on hydration. Specs written before
 * that landed asserted on examples that were still showing their skeleton —
 * and stayed broken silently, because the docs suite was never registered in
 * CI. Scroll the page in steps so every observer fires, then return to the top.
 */
async function revealExamples(page: import('@playwright/test').Page): Promise<void> {
  // Mounting an example changes the page height, which can push a later one
  // back out of the observer's 400px margin — so a single top-to-bottom sweep
  // that returns to the top can leave the last example permanently unobserved.
  // Sweep repeatedly and STAY at the bottom between passes; only return to the
  // top once nothing is loading. Against the DEV server the first pass also
  // pays each example chunk's on-demand transform, hence the budget.
  const deadline = Date.now() + 45_000
  for (;;) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(400)
    const stuck = await page.locator('.pyreon-example__loading').count()
    if (stuck === 0) break
    if (Date.now() > deadline) {
      const which = await page.evaluate(() =>
        [...document.querySelectorAll('.pyreon-example')]
          .map((el, i) => ({ i, t: el.querySelector('.pyreon-example__title')?.textContent ?? '(untitled)', stuck: !!el.querySelector('.pyreon-example__loading') }))
          .filter((e) => e.stuck)
          .map((e) => `#${e.i} ${e.t}`),
      )
      throw new Error(`revealExamples: ${stuck} example(s) still loading: ${which.join(', ')}`)
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

test.describe('docs rendering', () => {
  test('every built internal docs link points to an existing page and heading', async ({ page }) => {
    const dist = resolve(__dirname, '../docs/dist')
    const files = readdirSync(dist, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    const pages = new Map<string, { ids: string[]; links: string[] }>()
    for (const file of files) {
      const path = resolve(file.parentPath, file.name)
      const route = '/' + path.slice(dist.length + 1).replace(/(^|\/)index\.html$/, '').replace(/\/$/, '')
      // DOMParser sees the actual static HTML, including entity-decoded hrefs,
      // without executing its scripts or depending on scroll/layout timing.
      const parsed = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        return {
          ids: [...doc.querySelectorAll('[id]')].map((el) => el.id),
          links: [...doc.querySelectorAll('a[href]')].map((el) => el.getAttribute('href')!),
        }
      }, readFileSync(path, 'utf8'))
      pages.set(route, parsed)
    }
    const missing: string[] = []
    for (const [from, { links }] of pages) {
      for (const href of links) {
        const url = new URL(href, `https://docs.test${from}`)
        if (url.origin !== 'https://docs.test' || !/^\/docs(?:\/|$)/.test(url.pathname)) continue
        const target = pages.get(url.pathname.replace(/\/$/, ''))
        if (!target || (url.hash && !target.ids.includes(decodeURIComponent(url.hash.slice(1))))) {
          missing.push(`${from} → ${href}`)
        }
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
  test('document example renders and edits its real markdown output', async ({ page }) => {
    await page.goto('/docs/document')
    await waitForHydration(page)
    const example = page.locator('.pyreon-example').filter({ hasText: 'One document tree' })
    await example.scrollIntoViewIfNeeded()
    const title = example.getByRole('textbox', { name: 'Title', exact: true })
    await expect(title).toHaveValue('Q4 Sales Report')
    await expect(example.locator('pre')).toContainText('# Q4 Sales Report')
    await title.fill('Release readiness')
    await expect(example.locator('pre')).toContainText('# Release readiness')
    await expect(example.locator('.pyreon-example__error')).toHaveCount(0)
  })

  test('query example fetches local data and reuses a fresh cached key', async ({ page }) => {
    const external: string[] = []
    await page.route('https://jsonplaceholder.typicode.com/**', async (route) => {
      external.push(route.request().url())
      await route.abort()
    })
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'fetch' && /users.*\.json/.test(request.url())) requests.push(request.url())
    })
    await page.goto('/docs/query')
    await waitForHydration(page)
    const example = page.locator('.pyreon-example').filter({ hasText: 'useQuery — fetch + cache by key' })
    await example.scrollIntoViewIfNeeded()
    await expect(example).toContainText('Ada Lovelace')
    await example.getByRole('button', { name: '#2', exact: true }).click()
    await expect(example).toContainText('Grace Hopper')
    await expect(example).toContainText('idle · cached')
    expect(requests).toHaveLength(2)
    await example.getByRole('button', { name: '#1', exact: true }).click()
    await expect(example).toContainText('Ada Lovelace')
    await expect(example).toContainText('idle · cached')
    expect(requests).toHaveLength(2)
    expect(external).toEqual([])
  })

  test('homepage and catalog represent every public framework package', async ({ page }) => {
    const root = resolve(__dirname, '..')
    const groups: { category: string; names: string[] }[] = []
    for (const category of readdirSync(resolve(root, 'packages'))) {
      const names = readdirSync(resolve(root, 'packages', category), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const pkg = JSON.parse(readFileSync(resolve(root, 'packages', category, entry.name, 'package.json'), 'utf8'))
          return pkg.private ? [] : [pkg.name as string]
        })
      if (names.length) groups.push({ category, names })
    }
    const total = groups.reduce((count, group) => count + group.names.length, 0)
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.locator('.px-eco-total')).toContainText(`${total} packages`)
    await expect(page.locator('.px-eco-total')).toContainText(`${groups.length} categories`)
    for (const group of groups) {
      const card = page.locator('.px-panel').filter({ has: page.locator('.px-eco-cat', { hasText: new RegExp(`^${group.category}$`) }) })
      await expect(card.locator('.px-mono-label')).toHaveText(String(group.names.length))
    }
    await page.getByRole('link', { name: `All ${total} packages`, exact: true }).click()
    await expect(page).toHaveURL(/\/docs\/package-catalog/)
    for (const group of groups) {
      for (const name of group.names) {
        await expect(page.locator('.docs-content table').getByRole('link', { name, exact: true })).toBeVisible()
      }
    }
  })
  test('small-phone header fits and the docs drawer is operable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    const hamburger = page.locator('.docs-header__hamburger')
    const drawer = page.locator('#docs-navigation-drawer')
    await expect(hamburger).toBeVisible()
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    await expect(drawer).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

    await hamburger.click()
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true')
    await expect(drawer).toBeInViewport()
    await expect(page.locator('html')).toHaveClass(/docs-drawer-scroll-locked/)

    await page.keyboard.press('Escape')
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    await expect(hamburger).toBeFocused()
    await expect(page.locator('html')).not.toHaveClass(/docs-drawer-scroll-locked/)
    await expect(drawer).toBeHidden()
  })

  for (const width of [320, 375, 768]) {
    test(`mobile primary navigation works from the homepage at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/')
      await waitForHydration(page)
      const hamburger = page.locator('.docs-header__hamburger')
      const drawer = page.locator('#docs-navigation-drawer')
      const docs = drawer.getByRole('link', { name: 'Docs', exact: true })
      const components = drawer.getByRole('link', { name: 'Components', exact: true })
      await expect(hamburger).toBeVisible()
      await expect(hamburger).toHaveAttribute('aria-expanded', 'false')
      await expect(drawer).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

      await hamburger.click()
      await expect(drawer).toBeInViewport()
      await expect(hamburger).toHaveAttribute('aria-expanded', 'true')
      await expect(docs).toBeVisible()
      await expect(docs).toBeFocused()
      await expect(components).toHaveAttribute('href', '/atlas/')
      await expect(components).toHaveAttribute('data-allow-reload', '')
      await page.keyboard.press('Tab')
      await expect(components).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(hamburger).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
      await expect(hamburger).toBeFocused()
      await expect(page.locator('html')).not.toHaveClass(/docs-drawer-scroll-locked/)

      await hamburger.click()
      await page.locator('.docs-drawer-backdrop').click({ position: { x: width - 8, y: 80 } })
      await expect(drawer).toBeHidden()
      await expect(hamburger).toBeFocused()

      await hamburger.click()
      await docs.click()
      await expect(page).toHaveURL(/\/docs\/getting-started\/?$/)
      await expect(hamburger).toHaveAttribute('aria-expanded', 'false')
      await expect(drawer).toBeHidden()
      await expect(page.locator('html')).not.toHaveClass(/docs-drawer-scroll-locked/)
      await hamburger.click()
      await expect(components).toBeVisible()
      await expect(drawer.locator('.pyreon-sidebar')).toBeVisible()
      await page.setViewportSize({ width: 1024, height: 812 })
      await expect(hamburger).toBeHidden()
      await expect(page.locator('html')).not.toHaveClass(/docs-drawer-scroll-locked/)
      await expect(page.locator('.docs-mobile-nav')).toBeHidden()
    })
  }

  test('mobile primary navigation is available on the 404 page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/missing-mobile-navigation-page')
    await waitForHydration(page)
    await expect(page.locator('.docs-header__hamburger')).toBeVisible()
    await page.locator('.docs-header__hamburger').click()
    const docs = page.locator('#docs-navigation-drawer').getByRole('link', { name: 'Docs', exact: true })
    await expect(docs).toBeVisible()
    await docs.click()
    await expect(page).toHaveURL(/\/docs\/getting-started\/?$/)
  })

  test('desktop homepage keeps a full-width layout and visible primary links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.locator('.docs-header__hamburger')).toBeHidden()
    await expect(page.locator('.docs-header__nav').getByRole('link', { name: 'Docs', exact: true })).toBeVisible()
    await expect(page.locator('.docs-header__nav').getByRole('link', { name: 'Components', exact: true })).toBeVisible()
    await expect(page.locator('#docs-navigation-drawer')).toBeHidden()
    const main = await page.locator('.docs-main').boundingBox()
    expect(main?.x).toBe(0)
    expect(main?.width).toBe(1440)
  })

  test('landing page renders the PyreonLanding component (real signal counter)', async ({
    page,
  }) => {
    await page.goto('/')
    // PR #1399 renamed `.pyreon-landing` → `.px-landing` to restore the
    // 1240px max-width container; the e2e selector was missed during
    // that refactor. Both classes accepted defensively.
    await expect(page.locator('.px-landing, .pyreon-landing')).toBeVisible()
    await expect(page.locator('.px-hero h1')).toContainText(
      /Reactivity that knows/,
    )
    // The hero counter advertises a live signal; the digit element is
    // populated by reactivity, not static markup.
    const digit = page.locator('.px-digit')
    await expect(digit).toBeVisible()
    const firstValue = await digit.textContent()
    expect(firstValue?.trim()).toMatch(/^\d+$/)
  })

  test('sidebar navigation between Core Framework pages works', async ({
    page,
  }) => {
    await page.goto('/docs/getting-started')
    // Wait for the dev-mode async content-route resolution + Suspense
    // unwrap before asserting on the rendered article. `defineContentRoute`
    // dynamically imports the markdown body chunk; under cold-start the
    // chunk fetch + transform + JSX-emit pipeline can take >5s, which
    // was the documented PR #1438 flake. `networkidle` is the
    // load-bearing wait — the chunk completes before then.
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible({ timeout: 15_000 })
    // Click the Core Framework "Router" sidebar link. Exact-match
    // selector — `hasText: 'Router'` would also pick up "Router setup"
    // in the Patterns group (strict-mode violation).
    await page
      .locator('a.pyreon-sidebar__link[href="/docs/router"]')
      .click()
    await page.waitForURL('**/docs/router')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible({ timeout: 15_000 })
    // The active class flips to the new route's sidebar entry.
    await expect(
      page.locator(
        'a.pyreon-sidebar__link--active[href="/docs/router"]',
      ),
    ).toBeVisible()
  })

  test('sidebar persists across docs→docs navigation (no remount → scroll kept, no flash)', async ({
    page,
  }) => {
    // Short viewport so the (tall) sidebar overflows and is scrollable.
    // Width stays desktop (>768px) so the sidebar is the sticky rail, not
    // the mobile drawer.
    await page.setViewportSize({ width: 1280, height: 500 })
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.pyreon-sidebar')).toBeVisible()

    // Tag the live sidebar element with an expando + scroll it to the bottom.
    // BOTH are wiped if the layout re-mounts the sidebar on navigation (a new
    // <nav> has no expando and scrollTop 0) — the exact double-bug reported:
    // the menu flashing out/in AND its scroll resetting to the top.
    const before = await page.evaluate(() => {
      const el = document.querySelector('.pyreon-sidebar') as HTMLElement
      ;(el as unknown as { __remountProbe?: string }).__remountProbe = 'persisted'
      el.scrollTop = 99999 // clamp to max scroll
      return el.scrollTop
    })
    // Sanity: the sidebar is actually scrollable in this viewport.
    expect(before).toBeGreaterThan(0)

    // Navigate docs→docs via a sidebar link. Programmatic click (not Playwright's
    // auto-scroll-into-view click) so the manual scrollTop above is undisturbed.
    await page.evaluate(() => {
      ;(
        document.querySelector(
          'a.pyreon-sidebar__link[href="/docs/router"]',
        ) as HTMLElement
      ).click()
    })
    await page.waitForURL('**/docs/router')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible({ timeout: 15_000 })

    // The sidebar never disappears.
    await expect(page.locator('.pyreon-sidebar')).toBeVisible()

    const after = await page.evaluate(() => {
      const el = document.querySelector('.pyreon-sidebar') as HTMLElement
      return {
        probe: (el as unknown as { __remountProbe?: string }).__remountProbe,
        scrollTop: el.scrollTop,
      }
    })
    // Root cause: the SAME element survived (no unmount/remount of the sidebar)…
    expect(after.probe).toBe('persisted')
    // …so its scroll position is preserved (the bug reset it to 0).
    expect(after.scrollTop).toBe(before)
  })

  test('navigating landing → docs renders code blocks without a setup crash', async ({
    page,
  }) => {
    // Regression: clicking "Docs" from the landing page used to throw
    // `[Pyreon] <CodeBlock> threw during setup: HierarchyRequestError`
    // (repeated, one per code block) — the docs code samples rendered
    // broken on first navigation. Root cause: <CodeBlock> conditionally
    // rendered its filename header + line-number gutter, which the
    // compiler lowered to `_mountSlot` placeholders INTERLEAVED with the
    // static-element ref walks for the body/pre/copy-button. On a fresh
    // client mount the empty slots removed their `<!>` markers, the walks
    // landed on the wrong node, and a later `insertBefore` hit a Comment
    // parent. Fix: the header + gutter wrappers are always-rendered (an
    // `--empty` class hides them) so no slot precedes a ref'd element.
    const setupErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /threw during setup|HierarchyRequestError/.test(m.text())) {
        setupErrors.push(m.text())
      }
    })
    page.on('pageerror', (e) => {
      if (/HierarchyRequestError|nextSibling/.test(e.message)) {
        setupErrors.push('PAGEERROR: ' + e.message)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // The landing "Docs" CTA points at the getting-started page.
    await page.locator('a[href="/docs/getting-started"]').first().click()
    await page.waitForURL('**/docs/getting-started')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible({ timeout: 15_000 })

    // No <CodeBlock> setup crash on the navigation.
    expect(setupErrors).toEqual([])
    // …and the code blocks actually rendered their Shiki content (the
    // crash left them empty / unmounted).
    const codeBlocks = page.locator('.code-block')
    expect(await codeBlocks.count()).toBeGreaterThan(0)
    await expect(codeBlocks.first().locator('pre').first()).toBeVisible()
  })

  test('Toc scroll-spy activates as headings enter the viewport', async ({
    page,
  }) => {
    await page.goto('/docs/reactivity')
    await page.waitForLoadState('networkidle')
    // Click a Toc link and verify it scrolls + activates.
    const tocLinks = page.locator('.pyreon-toc__link')
    const count = await tocLinks.count()
    expect(count).toBeGreaterThan(2)
    // Click the second Toc link and assert it becomes active.
    const target = tocLinks.nth(1)
    const href = await target.getAttribute('href')
    expect(href).toMatch(/^#/)
    await target.click()
    // IntersectionObserver fires async; give it a tick.
    await page.waitForTimeout(500)
    // At least ONE toc link is active (the IntersectionObserver picked
    // one in view).
    const activeCount = await page.locator('.pyreon-toc__link--active').count()
    expect(activeCount).toBeGreaterThan(0)
  })

  test('404 renders the PyreonNotFound branded page for unknown routes', async ({
    page,
  }) => {
    await page.goto('/docs/this-page-does-not-exist-deliberately')
    // The docs catch-all wires `notFound: PyreonNotFound` into
    // `defineContentRoute('docs', { ... })` so unknown `/docs/<slug>`
    // URLs render the SAME branded 404 as fs-router's top-level
    // `_404.tsx`. Wait for the Suspense-resolved 404 to mount.
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.px-nf')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.px-nf-h1')).toContainText(
      /This path has no readers/,
    )
  })

  test('router.md renders APICard call sites (custom-component parity)', async ({
    page,
  }) => {
    await page.goto('/docs/router')
    await page.waitForLoadState('networkidle')
    // The page has 32 <APICard /> invocations after the parity
    // migration. We check the renderer wired them up.
    const apiCards = page.locator('.api-card')
    const count = await apiCards.count()
    expect(count).toBeGreaterThan(20)
    // First card should have a name + signature.
    await expect(apiCards.first().locator('.api-name')).toBeVisible()
  })

  test('header chrome renders: brand logo, search button, theme toggle, GitHub link', async ({
    page,
  }) => {
    await page.goto('/')
    // SVG brand mark (one for light, one for dark — only one visible at a time)
    await expect(page.locator('.docs-brand__mark').first()).toBeVisible()
    await expect(page.locator('.docs-brand__wordmark')).toHaveText('pyreon')
    // Cmd+K search trigger button
    await expect(page.locator('.docs-header__search-btn')).toBeVisible()
    await expect(page.locator('.docs-header__search-btn')).toContainText(
      /Search/,
    )
    // Theme toggle button — defaults to sun icon (dark mode)
    await expect(page.locator('.docs-theme-toggle')).toBeVisible()
    // GitHub icon link
    const githubIcon = page.locator('.docs-header__icon-link')
    await expect(githubIcon).toBeVisible()
    await expect(githubIcon).toHaveAttribute('href', /github\.com\/pyreon/)
  })

  test('theme toggle flips data-theme on <html> and persists to localStorage', async ({
    page,
  }) => {
    await page.goto('/')
    // Wait for FOUC script to set the initial theme.
    const initial = await page.locator('html').getAttribute('data-theme')
    expect(initial).toBe('dark')
    // Click the toggle and expect data-theme to flip to light.
    await page.locator('.docs-theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    // localStorage was updated (same key as VitePress for seamless
    // cut-over).
    const stored = await page.evaluate(() =>
      localStorage.getItem('vitepress-theme-appearance'),
    )
    expect(stored).toBe('light')
    // Toggle back — round-trip.
    await page.locator('.docs-theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('Cmd+K opens search overlay; Escape closes it', async ({ page }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')
    // Trigger the keyboard shortcut. The Search component branches on the
    // platform — `navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey`
    // — so pressing Meta opens the panel on a macOS dev machine and does
    // NOTHING on the Linux CI runner, where the component is listening for
    // Control. Playwright's `ControlOrMeta` resolves the same way the
    // component does, so the spec follows the product rather than one OS.
    // A cold dev server transforms the whole markdown collection before
    // answering this request. Start the result assertion only once the
    // required index has arrived; keep typing during loading so this still
    // exercises a query entered before the index is ready.
    await Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/search-index-docs.json',
        { timeout: 0 }, // The existing whole-test deadline owns this setup wait.
      ).then(async (response) => {
        expect(response.ok()).toBe(true)
        expect(await response.finished()).toBeNull()
      }),
      (async () => {
        await page.keyboard.press('ControlOrMeta+k')
        await expect(page.locator('.pyreon-search__panel')).toBeVisible()
        await expect(page.locator('.pyreon-search__input')).toBeVisible()
        await page.locator('.pyreon-search__input').fill('signal')
      })(),
    ])
    await expect(async () => {
      const resultCount = await page.locator('.pyreon-search__result').count()
      expect(resultCount).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
    // The reactive class flip on the `<search>` host is the precise binding
    // that died when the compiler re-invoked `useSearch()` per use site: the
    // overlay's open state lived in an instance no binding was subscribed to,
    // so the class stayed `pyreon-search` and the panel never rendered.
    await expect(page.locator('search.pyreon-search--open')).toHaveCount(1)
    // A result must actually navigate (SPA push, not a dead node).
    const first = page.locator('.pyreon-search__result a').first()
    const href = await first.getAttribute('href')
    expect(href).toMatch(/^\/docs\//)
    await first.click()
    await expect(page).toHaveURL(new RegExp(href!.split('#')[0]!.replace(/\//g, '\\/')))
    await expect(page.locator('.pyreon-search__panel')).not.toBeVisible()

    // Escape closes the overlay (re-open first — the click above closed it).
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('.pyreon-search__panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.pyreon-search__panel')).not.toBeVisible()
    await expect(page.locator('search.pyreon-search--open')).toHaveCount(0)
  })

  test('sidebar group collapse state persists to localStorage', async ({
    page,
  }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')
    // Take the FIRST group rather than naming one. This spec used to look for
    // a "Patterns" group; the sidebar was later reorganised and the group is
    // gone, so the spec asserted against an element that could never exist —
    // undetected because the docs suite was not registered in CI. Reading the
    // group's own label keeps the localStorage assertion exact without
    // hard-coding navigation copy.
    const group = page.locator('.pyreon-sidebar__group').first()
    const groupTitle = group.locator('.pyreon-sidebar__group-title')
    await expect(groupTitle).toBeVisible()
    // `textContent`, not `innerText`: the group title is uppercased by CSS
    // `text-transform`, and `innerText` returns the RENDERED text, which would
    // not match the label the sidebar actually persists.
    const groupLabel = ((await groupTitle.textContent()) ?? '').trim()
    // Before click — expanded. Sidebar keeps the list ALWAYS mounted
    // (CSS grid-template-rows 1fr ↔ 0fr animation needs something to
    // animate); collapse state lives on `.pyreon-sidebar__collapse`'s
    // `data-collapsed` attribute. So we assert the data-attribute,
    // not the DOM-presence of the list.
    const collapseEl = group.locator('.pyreon-sidebar__collapse')
    await expect(collapseEl).toHaveAttribute('data-collapsed', 'false')
    await groupTitle.click()
    // After click — collapsed (data-collapsed flips to "true").
    await expect(collapseEl).toHaveAttribute('data-collapsed', 'true')
    // localStorage records the toggle.
    const stored = await page.evaluate(() =>
      localStorage.getItem('pyreon-docs-sidebar-collapsed'),
    )
    expect(stored).toContain(groupLabel)
  })

  test('<Example> share="key" — click in one example reactively updates another (the killer Pyreon docs DX)', async ({
    page,
  }) => {
    await page.goto('/docs/live-examples')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)

    // The page mounts 3 examples: effects-log, bridge-counter-button,
    // bridge-counter-readout. Both bridge examples share key="bridge".
    await expect(page.locator('.pyreon-example')).toHaveCount(3)
    // No error states — every example resolved successfully.
    await expect(page.locator('.pyreon-example__error')).toHaveCount(0)
    // No examples stuck loading either.
    await expect(page.locator('.pyreon-example__loading')).toHaveCount(0)

    // Initial state: bridge-counter-readout shows the shared value as 0.
    const readoutCard = page
      .locator('.pyreon-example')
      .nth(2)
      .locator('.example-card')
    await expect(readoutCard).toContainText('shared value: 0')
    await expect(readoutCard).toContainText('doubled (computed): 0')
    await expect(readoutCard).toContainText('parity (computed): even')

    // Click "bump" in the bridge-counter-button example (NOT the
    // readout example). The button example writes to its `props.shared`
    // signal — same instance the readout reads from via the registry.
    await page.locator('button:has-text("bump")').click()
    // The OTHER example reactively reflects the update.
    await expect(readoutCard).toContainText('shared value: 1')
    await expect(readoutCard).toContainText('doubled (computed): 2')
    await expect(readoutCard).toContainText('parity (computed): odd')

    // Three more clicks.
    await page.locator('button:has-text("bump")').click()
    await page.locator('button:has-text("bump")').click()
    await page.locator('button:has-text("bump")').click()
    await expect(readoutCard).toContainText('shared value: 4')
    await expect(readoutCard).toContainText('doubled (computed): 8')
    await expect(readoutCard).toContainText('parity (computed): even')

    // The "reset" button in the bridge example writes 0 — readout
    // reflects that too. Scoped to the bridge-counter-button example
    // (nth 1) so we don't collide with the effects-log "Reset" button.
    await page
      .locator('.pyreon-example')
      .nth(1)
      .locator('button:has-text("reset")')
      .click()
    await expect(readoutCard).toContainText('shared value: 0')
  })

  test('<Example> with no share prop uses a local signal (clicks do NOT leak across examples)', async ({
    page,
  }) => {
    // The effects-log example uses signals locally — no `share` prop.
    // Clicking inside it must not affect the shared-bridge examples.
    await page.goto('/docs/live-examples')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    await expect(page.locator('.pyreon-example')).toHaveCount(3)

    // The effects-log example has a "+ Increment" + "Reset" pair —
    // both write to the example's LOCAL signal (no `shared` prop).
    // Scope clicks to the FIRST example so we don't collide with the
    // bridge example's buttons.
    const effectsExample = page.locator('.pyreon-example').first()
    await effectsExample.locator('button:has-text("+ Increment")').click()
    await effectsExample.locator('button:has-text("+ Increment")').click()

    // The bridge readout (which has share="bridge") was untouched —
    // still shows 0. This proves local-signal isolation: clicking in
    // effects-log did NOT leak into the shared registry.
    const readoutCard = page
      .locator('.pyreon-example')
      .nth(2)
      .locator('.example-card')
    await expect(readoutCard).toContainText('shared value: 0')
  })

  test('flow docs page mounts the live <Example> (real @pyreon/flow graph)', async ({
    page,
  }) => {
    // The node-graph Example loads @pyreon/flow client-side via the
    // <Example> dynamic-import path (onMount → import() → mount). Locks
    // that a REAL flow graph renders — nodes, MiniMap, AND Controls (the
    // overlay-order regression: Controls must render, not just resolve).
    await page.goto('/docs/flow')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    const canvas = page.locator('.pyreon-example .pyreon-flow').first()
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    await expect(canvas.locator('[data-nodeid]')).toHaveCount(3)
    await expect(canvas.locator('.pyreon-flow-minimap')).toBeVisible()
    await expect(canvas.locator('.pyreon-flow-controls')).toBeVisible()

    // ARROWS reach the DOM (the historically-fragile marker path — see the
    // `[object Object]` / overlay-order entries in anti-patterns.md). Lock
    // that a <marker> def exists, BOTH edges carry a `marker-end` url() ref,
    // and every ref resolves to a real def (no dangling reference).
    const arrows = await canvas.evaluate((flow) => {
      const markers = Array.from(flow.querySelectorAll('marker'))
      const withEnd = Array.from(flow.querySelectorAll('path')).filter((p) =>
        p.getAttribute('marker-end'),
      )
      const dangling = withEnd
        .map((p) => (p.getAttribute('marker-end') || '').replace(/^url\(#|\)$/g, ''))
        .filter((id) => id && !flow.querySelector(`marker#${CSS.escape(id)}`))
      return { markerDefs: markers.length, edgesWithEnd: withEnd.length, dangling: dangling.length }
    })
    expect(arrows.markerDefs).toBeGreaterThan(0)
    expect(arrows.edgesWithEnd).toBe(2)
    expect(arrows.dangling).toBe(0)
  })

  test('flow playground: edge arrowheads paint + auto-layout moves the nodes', async ({
    page,
  }) => {
    // The second flow <Example> on /docs/flow is the kitchen-sink playground.
    // It locks the two features the docs example previously under-showed:
    //   (1) Edge arrowheads paint as real <marker> geometry in a
    //       real-compiler render. This used to assert BOTH marker shapes
    //       (a filled <polygon> AND an open <polyline>); the example later
    //       dropped its per-edge marker overrides for the coherent default,
    //       and the assertion survived only because this suite was not
    //       registered in CI. The invariant it protects — markers render at
    //       all — is kept.
    //   (2) AUTO-LAYOUT is wired + visible: clicking a layout button runs a
    //       real elkjs pass and the node's own `transform: translate(x,y)`
    //       (its GRAPH position, independent of the viewport/fitView) changes.
    await page.goto('/docs/flow')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    const pg = page.locator('.pyreon-example .pyreon-flow').nth(1)
    await expect(pg).toBeVisible({ timeout: 15_000 })
    await expect(pg.locator('[data-nodeid]')).toHaveCount(6)

    // The default arrowhead paints as a filled <polygon> inside a <marker>.
    const shapes = await pg.evaluate((flow) => ({
      markers: flow.querySelectorAll('marker').length,
      polygons: flow.querySelectorAll('marker polygon').length,
    }))
    expect(shapes.markers).toBeGreaterThan(0)
    expect(shapes.polygons).toBeGreaterThan(0)

    // Auto-layout: the node's own transform changes after a layered pass.
    const node = pg.locator('[data-nodeid="source"]')
    const before = await node.getAttribute('style')
    await page.locator('[data-testid="flow-layout-layered-down"]').click()
    // The readout updates synchronously on click (proves the handler fired).
    await expect(page.locator('[data-testid="flow-layout-current"]')).toHaveText(
      'layered-down',
    )
    // elkjs lazy-loads on first call + the move animates → poll until settled.
    await expect
      .poll(async () => await node.getAttribute('style'), { timeout: 15_000 })
      .not.toBe(before)
  })

  test('virtual docs page mounts the live <Example> (real @pyreon/virtual list)', async ({
    page,
  }) => {
    // The virtual-scrolling Example loads @pyreon/virtual client-side via
    // the <Example> dynamic-import path. Locks that a REAL virtualized list
    // renders: 10,000 rows, but only the visible window is mounted (the
    // core @pyreon/virtual contract — NOT all 10k DOM rows).
    await page.goto('/docs/virtual')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    const example = page.locator('.pyreon-example').first()
    await expect(example).toBeVisible({ timeout: 15_000 })
    // Readout proves the full count is virtualized.
    await expect(example).toContainText('of 10,000 rows')
    // Only the visible window (+overscan) is in the DOM — bounded > 0, < 200.
    const rows = example.locator('div[style*="translateY"]')
    await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await rows.count()).toBeLessThan(200)
  })

  test('storage docs page <Example> persists across reload (real @pyreon/storage)', async ({
    page,
  }) => {
    // The reactive-storage Example is backed by real localStorage via
    // useStorage. Locks the package's signature feature: a value written by
    // the UI survives a full page reload (restored from localStorage on a
    // fresh mount) — not just in-memory signal state.
    await page.goto('/docs/storage')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    // Clear any prior run's persisted state, then reload to a clean default.
    await page.evaluate(() => {
      localStorage.removeItem('docs-rs-theme')
      localStorage.removeItem('docs-rs-count')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    const example = page.locator('[data-testid=reactive-storage]')
    await expect(example).toBeVisible({ timeout: 15_000 })
    await expect(example.getByTestId('rs-theme')).toHaveText('light')

    // Drive the UI: toggle theme + increment the stored counter twice.
    await example.getByRole('button', { name: 'Toggle theme' }).click()
    await example.getByRole('button', { name: 'Increment' }).click()
    await example.getByRole('button', { name: 'Increment' }).click()
    await expect(example.getByTestId('rs-theme')).toHaveText('dark')
    await expect(example.getByTestId('rs-count')).toHaveText('2')

    // Full reload — the values must come back from localStorage, not reset.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await revealExamples(page)
    const after = page.locator('[data-testid=reactive-storage]')
    await expect(after.getByTestId('rs-theme')).toHaveText('dark')
    await expect(after.getByTestId('rs-count')).toHaveText('2')

    // Reset clears storage → defaults; and the reset survives reload too.
    await after.getByRole('button', { name: 'Reset' }).click()
    await expect(after.getByTestId('rs-theme')).toHaveText('light')
    await expect(after.getByTestId('rs-count')).toHaveText('0')
  })

  test('sync docs page <Example> is a reactive CRDT list (real @pyreon/sync)', async ({
    page,
  }) => {
    // The synced-list Example binds a Y.Array CRDT as a Signal<T[]> and renders
    // it via <For>. Locks the signal-native binding: a push/delete reactively
    // updates the rendered list (the "a synced value IS a signal" contract).
    await page.goto('/docs/sync')
    await page.waitForLoadState('networkidle')
    const example = page.locator('[data-testid=synced-list]')
    await expect(example).toBeVisible({ timeout: 15_000 })
    const items = example.locator('.sl-item')
    await expect(items).toHaveCount(0)

    // Add two items via the input + Add button — each push patches the list.
    await example.getByTestId('sl-input').fill('write code')
    await example.getByTestId('sl-add').click()
    await example.getByTestId('sl-input').fill('ship it')
    await example.getByTestId('sl-add').click()
    await expect(items).toHaveCount(2)
    await expect(example).toContainText('write code')
    await expect(example).toContainText('ship it')

    // Remove the first item (CRDT delete) → reactive update to one item.
    await items.first().locator('.sl-remove').click()
    await expect(items).toHaveCount(1)
    await expect(example).toContainText('ship it')

    // Clear removes the rest.
    await example.getByTestId('sl-clear').click()
    await expect(items).toHaveCount(0)
  })
})

test.describe('the charts page mounts every mark it documents', () => {
  // The mark table and the prose are checked by gates; the DRAWING is not.
  // `band`, `stackedArea`, `waterfall`, `histogram` and `bollinger` were all
  // documented before anything rendered them, which is how the gaps this
  // page's examples now demonstrate stayed invisible — a capability no
  // example exercises is verified by nothing.
  //
  // This runs against the real docs build, so it is the only place the new
  // marks go through the REAL compiler into a REAL browser.
  test('every example resolves and paints, with no console error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/docs/charts')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)

    // Nothing failed to resolve and nothing is stuck on its skeleton — the
    // two states an example can sit in while LOOKING like it rendered.
    await expect(page.locator('.pyreon-example__error')).toHaveCount(0)
    await expect(page.locator('.pyreon-example__loading')).toHaveCount(0)

    // The intervals example alone mounts five charts; the page has three
    // examples in total, so a canvas count below five means one silently
    // dropped its marks.
    const canvases = page.locator('.pyreon-example canvas')
    expect(await canvases.count()).toBeGreaterThanOrEqual(5)

    // Painted, not merely present: a chart that threw mid-render leaves an
    // element with a zero-sized backing store.
    const painted = await canvases.evaluateAll((els) =>
      els.filter((el) => (el as HTMLCanvasElement).width > 0 && (el as HTMLCanvasElement).height > 0).length,
    )
    expect(painted).toBe(await canvases.count())

    expect(errors, errors.join('\n')).toEqual([])
  })

  test("a band's two bounds reach the rendered a11y table", async ({ page }) => {
    // The offscreen table is the reader-facing surface the whole
    // `values2`/`errLow`/`rValues` arc was about; asserting it here proves it
    // survives the real build, not just the unit harness.
    //
    // Page-level on purpose, and the name says so: TWO examples on this page
    // draw a band (the explicit one and `bollinger`'s envelope), so scoping
    // this to one of them would assert less than it appears to. Removing the
    // explicit band alone leaves it green — which is correct, because the
    // claim is about the FEATURE reaching the browser, not about one figure.
    await page.goto('/docs/charts')
    await page.waitForLoadState('networkidle')
    await revealExamples(page)

    const headers = await page.locator('.pyreon-example table th').allTextContents()
    expect(headers.some((h) => h.includes('(upper)')), headers.join(' | ')).toBe(true)
    expect(headers.some((h) => h.includes('(lower)')), headers.join(' | ')).toBe(true)
  })
})
