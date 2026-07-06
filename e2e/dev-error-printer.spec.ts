import { expect, test } from '@playwright/test'

/**
 * Dev throw-time fix printer (ecosystem-DX 6.1b/6.1c) — end-to-end against a
 * REAL dev server (`@pyreon/example-ui-showcase`, which uses `pyreon()`).
 *
 * This is the cross-layer proof the plugin unit tests structurally can't give:
 * the injected `virtual:pyreon/dev-error-printer` must actually LOAD in the
 * browser and register a handler that prints a fix when a known-pattern error
 * fires.
 *
 * Bisect-verified (manually, per the dev-server recipe: rebuild the plugin lib
 * + restart the dev server): the earlier INLINE `import 'virtual:…'` form
 * console-errored `net::ERR_FAILED` / CORS (unsupported scheme) — assertion (1)
 * below catches exactly that; the `src="/@id/…"` form loads clean.
 */
test.describe('dev error printer', () => {
  test('loads without a scheme/CORS error and prints the fix on a known error', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    const logs: string[] = []
    page.on('console', (m) => {
      logs.push(m.text())
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(e.message))

    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    // (1) Regression lock for the inline-vs-src bug: the injected printer module
    //     must load without a scheme/CORS error (the bug broke every dev app).
    const printerErr = consoleErrors.filter((e) =>
      /dev-error-printer|ERR_FAILED|blocked by CORS|Cross origin/.test(e),
    )
    expect(printerErr, `printer load errors:\n${printerErr.join('\n')}`).toHaveLength(0)

    // (2) Fire a real known-pattern error through the runtime error bridge — the
    //     same path reactivity effect errors take (→ reportError → handlers).
    //     The bridge exists ONLY because the printer called registerErrorHandler
    //     (which installs it), so this also proves the module registered.
    const fired = await page.evaluate(() => {
      const fn = (globalThis as unknown as { __pyreon_report_error__?: (e: unknown, p: string) => void })
        .__pyreon_report_error__
      if (typeof fn !== 'function') return false
      fn(new Error('count is not a function'), 'effect')
      return true
    })
    expect(fired, 'printer did not register a handler (no __pyreon_report_error__ bridge)').toBe(true)
    await page.waitForTimeout(300)

    // (3) The diagnose fix printed — output shape is unique to this handler.
    const printed = logs.join('\n')
    expect(printed).toContain('[Pyreon]')
    expect(printed).toContain('count()') // the cause names the mis-call
    expect(printed).toContain('signal.set') // the fix
  })
})
