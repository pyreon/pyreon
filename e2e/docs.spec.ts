import { expect, test } from '@playwright/test'

// docs parity gate. Five specs map to the five categories of
// rollout risk: landing rendering, navigation, scroll-spy, 404, and
// the heavy custom-component pages.

test.describe('docs rendering', () => {
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
    // Trigger the keyboard shortcut. The Search component listens for
    // metaKey OR ctrlKey + k depending on userAgent.
    await page.keyboard.press('Meta+k')
    // Overlay should be open with input focused.
    await expect(page.locator('.pyreon-search__panel')).toBeVisible()
    await expect(page.locator('.pyreon-search__input')).toBeVisible()
    // Type a query and expect results from the index. In dev the
    // plugin's `configureServer` middleware serves the index in-memory
    // on first request (walking + transforming every `.md` to populate
    // `searchEntries`), which can take a moment on cold-start. Use
    // toPass-style polling with a generous timeout so flakes from
    // dev-server warm-up don't fail the gate.
    await page.locator('.pyreon-search__input').fill('signal')
    await expect(async () => {
      const resultCount = await page.locator('.pyreon-search__result').count()
      expect(resultCount).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
    // Escape closes the overlay.
    await page.keyboard.press('Escape')
    await expect(page.locator('.pyreon-search__panel')).not.toBeVisible()
  })

  test('sidebar group collapse state persists to localStorage', async ({
    page,
  }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')
    // Find the "Patterns" group and collapse it.
    const patternsTitle = page.locator('.pyreon-sidebar__group-title', {
      hasText: 'Patterns',
    })
    await expect(patternsTitle).toBeVisible()
    // Before click — expanded. Sidebar keeps the list ALWAYS mounted
    // (CSS grid-template-rows 1fr ↔ 0fr animation needs something to
    // animate); collapse state lives on `.pyreon-sidebar__collapse`'s
    // `data-collapsed` attribute. So we assert the data-attribute,
    // not the DOM-presence of the list.
    const collapseEl = page
      .locator('.pyreon-sidebar__group')
      .filter({ has: page.locator('button:has-text("Patterns")') })
      .locator('.pyreon-sidebar__collapse')
    await expect(collapseEl).toHaveAttribute('data-collapsed', 'false')
    await patternsTitle.click()
    // After click — collapsed (data-collapsed flips to "true").
    await expect(collapseEl).toHaveAttribute('data-collapsed', 'true')
    // localStorage records the toggle.
    const stored = await page.evaluate(() =>
      localStorage.getItem('pyreon-docs-sidebar-collapsed'),
    )
    expect(stored).toContain('Patterns')
  })

  test('<Example> share="key" — click in one example reactively updates another (the killer Pyreon docs DX)', async ({
    page,
  }) => {
    await page.goto('/docs/example-dx')
    await page.waitForLoadState('networkidle')

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
    await page.goto('/docs/example-dx')
    await page.waitForLoadState('networkidle')
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
    const canvas = page.locator('.pyreon-example .pyreon-flow').first()
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    await expect(canvas.locator('[data-nodeid]')).toHaveCount(3)
    await expect(canvas.locator('.pyreon-flow-minimap')).toBeVisible()
    await expect(canvas.locator('.pyreon-flow-controls')).toBeVisible()
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
    // Clear any prior run's persisted state, then reload to a clean default.
    await page.evaluate(() => {
      localStorage.removeItem('docs-rs-theme')
      localStorage.removeItem('docs-rs-count')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
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
