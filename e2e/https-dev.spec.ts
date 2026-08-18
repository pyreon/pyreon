import { expect, test } from '@playwright/test'

/**
 * `https()` in a REAL browser.
 *
 * Everything else about this plugin is provable in node — the certificate
 * parses, a TLS client completes a handshake, Vite applies the config. None of
 * that answers the question the feature actually exists for: **does the browser
 * treat the page as a secure context, and therefore define the gated APIs?**
 *
 * That is a browser-only fact. `window.isSecureContext` has no node equivalent,
 * and the gated APIs are absent rather than throwing, so nothing short of a
 * real browser can distinguish "TLS is working" from "TLS is configured and the
 * browser still refuses". This suite is that distinction.
 *
 * `ignoreHTTPSErrors` is set in the config because the certificate is
 * self-signed BY DESIGN — that is the zero-config tier, and clicking through
 * the interstitial is exactly what a developer does.
 *
 * ── What this suite does and does NOT prove ──────────────────────────────
 *
 * Bisect-verified: removing `https()` from the fixture fails all three specs
 * with `net::ERR_SSL_PROTOCOL_ERROR`. So they are load-bearing — but note
 * WHERE they fail. The connection itself dies, which means the
 * `isSecureContext` reads never get the chance to discriminate.
 *
 * They cannot, on this origin. `http://localhost` is ITSELF a secure context,
 * so those assertions would pass over plain HTTP too. They document the
 * premise; they do not test it.
 *
 * What is genuinely proven here: the dev server speaks real TLS, a real
 * browser completes the handshake and renders, and the gated APIs are present
 * on the resulting origin. The LAN half — that a NON-loopback origin becomes
 * secure — needs a non-loopback address, which varies per machine and per CI
 * runner. That is left to the manual device check rather than faked here.
 */
test.describe('https() dev server', () => {
  test('serves over TLS and the browser reports a secure context', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#app')).toHaveText('secure')

    const probe = await page.evaluate(() => (window as unknown as { __probe: Record<string, unknown> }).__probe)
    expect(probe.protocol).toBe('https:')
    expect(probe.secureContext).toBe(true)
  })

  test('the gated APIs the plugin exists for are actually DEFINED', async ({ page }) => {
    // The whole premise: on `http://<lan-ip>` these are `undefined`, silently.
    // If this ever regresses, the plugin is serving TLS that buys nothing.
    await page.goto('/')
    const probe = await page.evaluate(() => (window as unknown as { __probe: Record<string, boolean> }).__probe)

    expect(probe.hasClipboard, 'navigator.clipboard').toBe(true)
    expect(probe.hasGeolocation, 'navigator.geolocation').toBe(true)
    expect(probe.hasMediaDevices, 'navigator.mediaDevices').toBe(true)
    expect(probe.hasServiceWorker, 'navigator.serviceWorker').toBe(true)
  })

  test('the certificate the browser accepted covers localhost', async ({ page }) => {
    // A certificate for the wrong names still completes a handshake with
    // `ignoreHTTPSErrors`, so assert the response really came from this server
    // over TLS rather than trusting that the page merely loaded.
    const response = await page.goto('/')
    expect(response?.url()).toMatch(/^https:\/\/localhost:/)
    expect(response?.status()).toBe(200)
    expect(await response?.securityDetails()).toBeTruthy()
  })
})
