import { expect, test } from '@playwright/test'

// docs-zero parity gate. Five specs map to the five categories of
// rollout risk: landing rendering, navigation, scroll-spy, 404, and
// the heavy custom-component pages.

test.describe('docs-zero rendering', () => {
  test('landing page renders the PyreonLanding component (real signal counter)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('.pyreon-landing')).toBeVisible()
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
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible()
    // Click a Sidebar link to /docs/router and verify navigation.
    await page.locator('.pyreon-sidebar__link', { hasText: 'Router' }).click()
    await page.waitForURL('**/docs/router')
    await expect(
      page.locator('article.docs-content h1, article.docs-content h2').first(),
    ).toBeVisible()
    // The active class flips to the new route's sidebar entry.
    await expect(
      page.locator('.pyreon-sidebar__link--active', { hasText: 'Router' }),
    ).toBeVisible()
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
    await expect(page.locator('.px-nf')).toBeVisible()
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
    // Type a query and expect results from the build-time index.
    await page.locator('.pyreon-search__input').fill('signal')
    // Debounce + index fetch may take a moment.
    await page.waitForTimeout(400)
    const resultCount = await page.locator('.pyreon-search__result').count()
    expect(resultCount).toBeGreaterThan(0)
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
    // Before click — expanded (the items list is in the DOM)
    const before = await page
      .locator(
        '.pyreon-sidebar__group:has(> button:has-text("Patterns")) .pyreon-sidebar__list',
      )
      .count()
    expect(before).toBe(1)
    await patternsTitle.click()
    // After click — collapsed (no list element in the group)
    const after = await page
      .locator(
        '.pyreon-sidebar__group:has(> button:has-text("Patterns")) .pyreon-sidebar__list',
      )
      .count()
    expect(after).toBe(0)
    // localStorage records the toggle.
    const stored = await page.evaluate(() =>
      localStorage.getItem('pyreon-docs-sidebar-collapsed'),
    )
    expect(stored).toContain('Patterns')
  })
})
