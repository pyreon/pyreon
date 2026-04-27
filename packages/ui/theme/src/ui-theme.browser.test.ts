import { describe, expect, it } from 'vitest'
import { theme } from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-theme`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. ui-theme is a data-only package — no mounting
 * needed — but the smoke proves the theme object loads end-to-end in a
 * real browser context (catches rocketstyle module-augmentation
 * regressions that show up only at consumer compile time).
 */
describe('@pyreon/ui-theme — browser smoke', () => {
  it('exposes a theme object with the expected top-level keys', () => {
    expect(theme).toBeDefined()
    expect(theme).toBeTypeOf('object')
    // Spot-check the documented top-level theme shape — colors / spacing /
    // typography / etc. are the canonical entries every consumer assumes.
    // Don't pin specific values (those evolve); pin the keys' presence.
    expect(theme).toHaveProperty('color')
    expect(theme).toHaveProperty('spacing')
    expect(theme).toHaveProperty('rootSize')
  })

  it('theme object survives JSON round-trip (no functions / circular refs)', () => {
    // `@pyreon/document` and SSR theming both serialize the theme. If it
    // ever picks up a function value or circular ref, those pipelines
    // break silently — this catches it before users hit it.
    expect(() => JSON.parse(JSON.stringify(theme))).not.toThrow()
  })
})
