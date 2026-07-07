// @vitest-environment happy-dom
/**
 * Regression: `insertGlobal` with `@layer`-wrapped content must still land in
 * the DOM when @layer is unsupported (happy-dom / older engines). Before the
 * fix, the scoped `insert()` path gated the @layer wrap on `supportsLayer` but
 * `insertGlobal` inserted the pre-wrapped rule verbatim — so happy-dom's
 * insertRule threw, styler warned a DOMException on every test, and the global
 * rule (e.g. a reset) was silently absent. Assertions on global styles would
 * then quietly lie. See sheet.ts:stripOuterLayer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from '../sheet'

describe('insertGlobal @layer in an @layer-unsupported DOM (happy-dom)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('unwraps a single outer @layer block so the inner rules land, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer rocketstyle{*{box-sizing:border-box}}')

    const styleEl = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement | null
    const rules = Array.from(styleEl?.sheet?.cssRules ?? []).map((r) => (r as CSSRule).cssText)

    // The reset actually made it into the DOM (unwrapped, source order)…
    expect(rules.some((r) => r.includes('box-sizing'))).toBe(true)
    // …and no DOMException was warned.
    expect(warn).not.toHaveBeenCalled()
  })

  it('still inserts plain global rules unchanged', () => {
    const s = new StyleSheet({ layer: 'rocketstyle' })
    s.insertGlobal('body{margin:0}')
    const styleEl = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement | null
    const rules = Array.from(styleEl?.sheet?.cssRules ?? []).map((r) => (r as CSSRule).cssText)
    expect(rules.some((r) => r.includes('margin'))).toBe(true)
  })
})
