import { expect, test } from '@playwright/test'

/**
 * Real-Chromium runtime gate for the `dashboard` template scaffolded by
 * create-pyreon-app. Boots the pre-scaffolded `examples/cpa-pw-dash`
 * fixture (no integrations — tests in-memory stub end-to-end so we
 * don't need a live Supabase backend) and exercises:
 *
 *   1. Marketing landing renders the hero + demo cred hint
 *   2. /login form is reachable with email + password fields
 *
 * **`/app/*` tests are blocked on a framework bug** — Pyreon's nested-
 * layout dev-SSR returns 404 for routes whose parent path requires a
 * subdirectory `_layout.tsx`. The dashboard template's `/app/dashboard`
 * is registered (visible in the dev-server route list) but serving the
 * URL responds 404 with no SSR error logged. The bug is unrelated to
 * the dashboard template content — it would block any user using a
 * nested-layout pattern. Filed as a follow-up; until then the auth-gate
 * + login-flow + PDF-export tests must wait.
 *
 * What this means in practice:
 *   - The marketing surface (landing + login form) IS regression-locked
 *     by this gate.
 *   - The auth-gated app + PDF export demo are NOT regression-locked
 *     yet. Both should be added back once the framework's nested-layout
 *     dev-SSR routing is fixed.
 */

test.describe('cpa-dash — runtime', () => {
  test('marketing landing renders the hero + demo cred hint', async ({ page }) => {
    await page.goto('/')
    // `.first()` for the framework's known dev-SSR layout double-mount
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('SaaS in a box')
    // Demo cred hint lives on landing — easy self-serve
    await expect(page.locator('body')).toContainText('demo@example.com')
  })

  test('/login shows form with email + password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Sign in')
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('/app/dashboard redirects to /login when no session cookie', async ({ page }) => {
    // Locked in by the loader-side `redirect()` helper from `@pyreon/router`.
    // The `/app/_layout.tsx` loader reads the `sid` cookie from
    // `ctx.request.headers.get('cookie')` (SSR) and `throw redirect('/login')`
    // when missing — converted to a 307 + `Location:` by the SSR handler
    // BEFORE the layout renders, so the no-session path never sees auth-gated
    // HTML. Replaces the prior `onMount + router.push('/login')` workaround,
    // which was unreliable under nested-layout dev SSR + hydration.
    await page.context().clearCookies()
    await page.goto('/app/dashboard')
    await page.waitForURL(/\/login$/, { timeout: 10_000 })
  })

  test('login with demo credentials → lands on /app/dashboard', async ({ page }) => {
    // Same nested-layout fix unblocks the post-login destination.
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill('demo@example.com')
    await page.locator('input[type="password"]').first().fill('demo1234')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/app\/dashboard$/, { timeout: 10_000 })
  })

  test('invoice page renders for known id (after server-side signin)', async ({ page }) => {
    // Locks in the SSR auth-gate end-to-end: sign in via the server-side
    // `/api/signin` endpoint (sets `Set-Cookie: sid=...`), then navigate
    // directly to a deeply-nested auth-gated page. The browser carries the
    // cookie on the next request, the SSR `_layout.tsx` loader reads it,
    // `getSession(sid)` hits the SAME server-side `sessions` Map that
    // `signIn` populated, and the layout renders the page WITHOUT
    // redirecting. Pre-fix the login.tsx form called `signIn()` directly
    // in browser scope — populating only the CSR module's Map — and
    // `page.goto('/app/invoices/inv_1001')` was a fresh SSR request that
    // saw no session and 307'd to /login.
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill('demo@example.com')
    await page.locator('input[type="password"]').first().fill('demo1234')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/app\/dashboard$/, { timeout: 10_000 })

    // Direct navigation to a nested auth-gated route — full SSR request,
    // not CSR. The `Set-Cookie` from `/api/signin` carries the session
    // SSR-side, so the layout renders the page instead of redirecting.
    await page.goto('/app/invoices/inv_1001')
    expect(page.url()).toMatch(/inv_1001/)
  })

  test('CSR-side redirect: cleared cookies mid-session redirects on next nav', async ({ page }) => {
    // The SSR-redirect spec above covers initial navigation. This spec
    // covers the CSR loader-runner half of the contract: client-side
    // navigation through `RouterLink` after the session is invalidated
    // mid-session. The `/app/_layout` loader exports a cookie-derived
    // `loaderKey`, so clearing cookies invalidates the cache; the next
    // navigation re-runs the loader → `getSession(undefined)` → null →
    // `redirect('/login')` → CSR navigate flow → `router.replace()`.
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill('demo@example.com')
    await page.locator('input[type="password"]').first().fill('demo1234')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/app\/dashboard$/, { timeout: 10_000 })

    // Mid-session: clear cookies (simulates server-side session
    // invalidation / cookie expiry / explicit logout). The next CSR
    // navigation should redirect to /login because the cookie-derived
    // loaderKey flips, the cache misses, and the loader re-runs.
    await page.context().clearCookies()

    // Click a sidebar link → CSR navigation. The /app/_layout loader's
    // cache key changes (no `sid=` cookie now), the cache misses, the
    // loader re-runs CLIENT-side, sees no session, throws redirect.
    await page.locator('a[href="/app/users"]').first().click()
    await page.waitForURL(/\/login$/, { timeout: 10_000 })
  })

  test('redirect(url, 308) preserves the custom permanent-redirect status', async ({ request }) => {
    // Locks in the SSR handler's `info.status` plumbing — the helper
    // carries the user-supplied status all the way to the wire. Default
    // is 307; this fixture (`/redirect-fixtures/permanent`) uses 308
    // (Permanent Redirect, method-preserving). Browsers cache 308s
    // aggressively, so the framework returning the right status is
    // load-bearing for production correctness. Unit tests assert the
    // helper captures the status; this spec asserts the SSR pipeline
    // doesn't collapse it back to the default.
    //
    // `maxRedirects: 0` so we can inspect the redirect itself, not the
    // followed target. Otherwise playwright would land on /login and we'd
    // never see the 308.
    const response = await request.get('/redirect-fixtures/permanent', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(response.headers()['location']).toBe('/login')
    // Empty body — clients only need the Location header. Asserts the SSR
    // handler didn't accidentally render layout HTML before the redirect.
    expect(await response.text()).toBe('')
  })

  test('redirect chain (A → B → /login) follows to the final target', async ({ page }) => {
    // Locks in the navigate flow's redirect-depth counter via SSR. Each
    // hop's loader throws redirect() and the SSR pipeline returns 307 +
    // Location for each. The browser follows the chain (or an HTTP client
    // does, up to its redirect cap) and lands on the final target.
    //
    // Uses `page.goto` (not `request.get`) so the BROWSER follows the
    // chain — same as a real user navigating from a link. The intermediate
    // hops never paint; only /login HTML hits the screen.
    await page.context().clearCookies()
    await page.goto('/redirect-fixtures/chain-a')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Sign in')
  })

  test('POST to a 308 redirect returns the same status (HTTP method-preservation contract)', async ({ request }) => {
    // The framework's job is to return the right STATUS — actual method
    // preservation across the redirect is the browser's HTTP-spec
    // responsibility (302/303 force GET; 307/308 keep the original
    // method). This spec verifies the framework doesn't accidentally
    // collapse a POST to a different status code than a GET would get
    // for the same redirect, which would silently break method-preserving
    // semantics in production.
    const getResponse = await request.get('/redirect-fixtures/permanent', {
      maxRedirects: 0,
    })
    const postResponse = await request.post('/redirect-fixtures/permanent', {
      maxRedirects: 0,
      data: 'x=1',
    })
    expect(postResponse.status()).toBe(getResponse.status())
    expect(postResponse.status()).toBe(308)
    expect(postResponse.headers()['location']).toBe('/login')
  })
})
