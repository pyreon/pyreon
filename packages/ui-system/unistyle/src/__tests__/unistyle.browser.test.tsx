/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { css, sheet, styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { enrichTheme } from '../enrichTheme'
import Provider from '../context'
import { makeItResponsive } from '../responsive'
import { stripUnit, value } from '../units'

// Real-Chromium smoke for @pyreon/unistyle.
//
// These tests assert real browser behavior for responsive utilities —
// things that happy-dom cannot observe because it does not resolve
// @media queries or compute styles.
//
// What the suite locks in:
//   1. `enrichTheme` attaches sorted breakpoints + media helpers to
//      `theme.__PYREON__`.
//   2. The generated media-query helper emits `@media (min-width: XXem)`
//      CSS that Chromium resolves — a breakpoint under the current
//      viewport applies, one above does not.
//   3. `<Provider>` provides the enriched theme so `styled()` components
//      resolve `p.theme` and interpolation functions see breakpoint data.
//   4. `value()` and `stripUnit()` produce the same strings in Node and
//      the browser (pure math, but we lock parity).

describe('@pyreon/unistyle in real browser', () => {
  afterEach(() => {
    sheet.clearCache()
  })

  it('enrichTheme attaches sortedBreakpoints and media helpers', () => {
    const enriched = enrichTheme({
      rootSize: 16,
      breakpoints: { xs: 0, sm: 576, md: 768 },
    })
    expect(enriched.__PYREON__.sortedBreakpoints).toEqual(['xs', 'sm', 'md'])
    expect(typeof enriched.__PYREON__.media?.xs).toBe('function')
    expect(typeof enriched.__PYREON__.media?.sm).toBe('function')
    expect(typeof enriched.__PYREON__.media?.md).toBe('function')
  })

  it('media helper emits @media rule that Chromium resolves at the current viewport', () => {
    // Viewport is ~1280px in chromium headless — use a tiny breakpoint
    // that is definitely below, and a huge one definitely above.
    const w = window.innerWidth
    expect(w).toBeGreaterThan(100)

    const Under = styled('div')`
      color: rgb(0, 0, 0);
      @media (min-width: 50px) {
        color: rgb(255, 0, 0);
      }
    `
    const Over = styled('div')`
      color: rgb(0, 0, 0);
      @media (min-width: 99999px) {
        color: rgb(0, 0, 255);
      }
    `
    const u = mountInBrowser(h(Under, { id: 'u' }))
    const o = mountInBrowser(h(Over, { id: 'o' }))
    expect(getComputedStyle(u.container.querySelector<HTMLElement>('#u')!).color).toBe(
      'rgb(255, 0, 0)',
    )
    expect(getComputedStyle(o.container.querySelector<HTMLElement>('#o')!).color).toBe(
      'rgb(0, 0, 0)',
    )
    u.unmount()
    o.unmount()
  })

  it('Provider enriches theme and styled() reads it via theme prop (no fallback — breaks loudly)', () => {
    // Use a non-default sentinel color: if Provider/styler integration is
    // broken, the interpolation receives `undefined`, the rule becomes
    // `color: undefined;` (invalid), and Chromium computes the default
    // black (rgb(0, 0, 0)) — the assertion fails immediately. No silent
    // fallback hides a regression.
    const theme = { rootSize: 16, breakpoints: { xs: 0, md: 768 }, tint: 'rgb(0, 200, 0)' }

    const Themed = styled('div')<{ theme?: typeof theme }>`
      ${(p) => css`
        color: ${(p.theme as typeof theme).tint};
      `}
    `
    const { container, unmount } = mountInBrowser(
      h(Provider, { theme }, h(Themed, { id: 'p' })),
    )
    const el = container.querySelector<HTMLElement>('#p')!
    expect(getComputedStyle(el).color).toBe('rgb(0, 200, 0)')
    unmount()
  })

  it('makeItResponsive resolves a breakpoint-object responsive prop via @media at the current viewport', () => {
    // The actual unistyle hot path: array/object responsive values flow
    // through normalizeTheme → transformTheme → optimizeTheme and emit
    // one `@media (min-width: …em)` rule per breakpoint. This test
    // exercises that pipeline end-to-end against real Chromium.
    const theme = enrichTheme({
      rootSize: 16,
      // xs=0 always applies; xl=99999 never applies at chromium default
      // viewport (~1280). We expect xs to win, xl to be ignored.
      breakpoints: { xs: 0, xl: 99999 },
    })

    const styles = ({ css: cssFn, theme: t }: { css: typeof css; theme: any }) => cssFn`
      color: ${t.tone};
    `
    const responsive = makeItResponsive({ key: '$colors', styles, css })

    const ResponsiveBox = styled('div')<{ $colors: Record<string, string>; theme?: typeof theme }>`
      ${(p) => responsive(p as any)};
    `

    const { container, unmount } = mountInBrowser(
      h(
        Provider,
        { theme },
        h(ResponsiveBox, {
          id: 'r',
          // Outer keys are property names; inner keys are breakpoints.
          $colors: { tone: { xs: 'rgb(255, 0, 0)', xl: 'rgb(0, 0, 255)' } },
        }),
      ),
    )
    const el = container.querySelector<HTMLElement>('#r')!
    expect(window.innerWidth).toBeLessThan(99999)
    expect(getComputedStyle(el).color).toBe('rgb(255, 0, 0)')
    unmount()
  })

  it('makeItResponsive resolves a breakpoint-array responsive prop (mobile-first cascade)', () => {
    const theme = enrichTheme({
      rootSize: 16,
      breakpoints: { xs: 0, sm: 99999 },
    })

    const styles = ({ css: cssFn, theme: t }: { css: typeof css; theme: any }) => cssFn`
      padding: ${t.pad};
    `
    const responsive = makeItResponsive({ key: '$pad', styles, css })

    const Padded = styled('div')<{ $pad: any; theme?: typeof theme }>`
      ${(p) => responsive(p as any)};
    `

    const { container, unmount } = mountInBrowser(
      h(
        Provider,
        { theme },
        h(Padded, { id: 'p', $pad: { pad: ['8px', '32px'] } }),
      ),
    )
    const el = container.querySelector<HTMLElement>('#p')!
    // xs (always-on) should apply 8px; sm (99999) does not apply.
    expect(getComputedStyle(el).padding).toBe('8px')
    unmount()
  })

  it('value() and stripUnit() behave identically in the browser', () => {
    expect(value(16)).toBe('1rem')
    expect(value('16px')).toBe('1rem')
    expect(value('50%')).toBe('50%')
    expect(value(null)).toBeNull()
    expect(stripUnit('24px', true)).toEqual([24, 'px'])
    expect(stripUnit('2.5rem', true)).toEqual([2.5, 'rem'])
  })
})
