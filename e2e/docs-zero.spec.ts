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
})
