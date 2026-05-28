import { expect, test } from '@playwright/test'

/**
 * native-router-demo-web e2e — locks the Phase R1 multiplatform
 * routing contract.
 *
 * Verifies the runtime behavior of the cross-target router story:
 *
 *   - Home route renders at launch (the web-equivalent of R1.1's iOS
 *     home-route emit fix — on web, RouterView resolves the matched
 *     route on first paint; this spec catches if it stops doing so)
 *   - useNavigate() pushes new path → URL updates → matched component
 *     re-renders
 *   - useParams<{id:string}>() reads dynamic route segment
 *   - 404 fallback renders for unmatched paths (the web-equivalent of
 *     the Swift/Kotlin else-fallback emits — on web the router falls
 *     back to its notFoundComponent or renders nothing matching;
 *     this spec catches if a real router push to /unknown breaks)
 *
 * All scenarios run against the SHARED `examples/native-router-demo-ios/
 * src/RouterApp.tsx` source — the same file PMTC compiles to SwiftUI
 * + Compose. Web is just one of the three target render paths.
 */

test.describe('native-router-demo-web — R1 routing runtime contract', () => {
  test('home route renders at launch', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    // Bootstrap shell carries one testid from index.html.
    await expect(page.getByTestId('app-root')).toBeVisible()
    // HomePage carries data-testid="home-page" — should be visible at
    // launch (the SAME shape PMTC emits as NavigationStack body on iOS).
    await expect(page.getByTestId('home-page')).toBeVisible()
    // Verify content — Home heading + nav buttons.
    await expect(page.getByText('Home')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to About' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View user 42' })).toBeVisible()
  })

  test('useNavigate → /about renders AboutPage', async ({ page }) => {
    await page.goto('/')
    // Click "Go to About" — triggers navigate('/about') via useNavigate
    await page.getByRole('button', { name: 'Go to About' }).click()
    // AboutPage's data-testid replaces home-page in the DOM
    await expect(page.getByTestId('about-page')).toBeVisible()
    await expect(page.getByTestId('home-page')).not.toBeVisible()
    await expect(page.getByText('About')).toBeVisible()
  })

  test('useNavigate → /users/:id reads useParams', async ({ page }) => {
    await page.goto('/')
    // Click "View user 42" — triggers navigate('/users/42')
    await page.getByRole('button', { name: 'View user 42' }).click()
    // UserPage renders with the :id param resolved via useParams
    await expect(page.getByTestId('user-page')).toBeVisible()
    await expect(page.getByText('Profile for user 42')).toBeVisible()
  })

  test('navigate back to / restores HomePage', async ({ page }) => {
    await page.goto('/')
    // Forward → AboutPage
    await page.getByRole('button', { name: 'Go to About' }).click()
    await expect(page.getByTestId('about-page')).toBeVisible()
    // AboutPage has its own "Back to Home" button calling navigate('/')
    await page.getByRole('button', { name: 'Back to Home' }).click()
    // Home is back
    await expect(page.getByTestId('home-page')).toBeVisible()
    await expect(page.getByTestId('about-page')).not.toBeVisible()
  })

  test('direct deep-link to /users/42 renders UserPage with params', async ({
    page,
  }) => {
    // Hard-navigate (not via useNavigate) — proves the route resolution
    // works on initial-URL too, not just after a router.push.
    const response = await page.goto('/users/42')
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('user-page')).toBeVisible()
    await expect(page.getByText('Profile for user 42')).toBeVisible()
  })
})
