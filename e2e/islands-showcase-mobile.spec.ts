import { expect, test } from '@playwright/test'

/**
 * islands-showcase mobile-viewport e2e — verifies the
 * `media((max-width: 768px))` strategy hydrates ONLY at the mobile
 * viewport. Companion to `islands-showcase.spec.ts`'s desktop spec
 * which proves the same island STAYS un-hydrated above 768px.
 *
 * Together these two specs prove the media() strategy actually
 * gates hydration on a real `matchMedia(query)` evaluation in
 * Chromium — not just a unit-test mock.
 */

test.describe('islands-showcase — mobile viewport (375×667)', () => {
  test('hydrate=media: MobileMenu hydrates and toggles state under matching query', async ({
    page,
  }) => {
    await page.goto('/')

    const menuIsland = page.locator('pyreon-island[data-component="MobileMenu"]')
    await expect(menuIsland).not.toHaveAttribute('data-island-error', /.+/, {
      timeout: 5000,
    })

    // SSR-rendered initial state.
    await expect(page.getByTestId('mobile-menu-state')).toHaveText('closed')

    // After hydration the click handler is bound — toggling the signal
    // updates the rendered text.
    await page.getByTestId('mobile-menu-toggle').click()
    await expect(page.getByTestId('mobile-menu-state')).toHaveText('open')

    await page.getByTestId('mobile-menu-toggle').click()
    await expect(page.getByTestId('mobile-menu-state')).toHaveText('closed')
  })
})
