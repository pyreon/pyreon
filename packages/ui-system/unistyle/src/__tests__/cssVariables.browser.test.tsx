/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { sheet, styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { themeToCssVars } from '../cssVariables'

// Real-Chromium smoke for themeToCssVars.
//
// happy-dom does not resolve CSS custom properties through the cascade,
// so the load-bearing claims are locked here:
//   1. The generated `:root` block resolves — a styled component reading
//      `var(--px-…)` computes the REAL value (incl. rem → px math by the
//      browser, proving units were baked correctly at emission).
//   2. `calc(${var} * ${var})` interpolation computes — the proportional
//      sizing idiom needs zero extra machinery.
//   3. A `[data-theme="dark"]` override + attribute flip changes computed
//      styles WITHOUT any class change — the exact mechanism the
//      cssVariables mode (Phase 2, rocketstyle/PyreonUI) builds on.
//   4. var() values survive @media blocks (responsive pipeline output).

const injected: HTMLStyleElement[] = []

const injectCss = (cssText: string): void => {
  const el = document.createElement('style')
  el.textContent = cssText
  document.head.appendChild(el)
  injected.push(el)
}

describe('themeToCssVars in real browser', () => {
  afterEach(() => {
    for (const el of injected) el.remove()
    injected.length = 0
    document.documentElement.removeAttribute('data-theme')
    sheet.clearCache()
  })

  it('styled component reading generated vars computes the emitted values', () => {
    const theme = { rootSize: 16, spacing: { small: 8 }, color: { surface: 'rgb(15, 23, 42)' } }
    const { vars, css } = themeToCssVars(theme)
    injectCss(css)

    const Box = styled('div')`
      padding: ${vars.spacing.small};
      background-color: ${vars.color.surface};
    `
    const m = mountInBrowser(h(Box, { id: 'box' }))
    const el = m.container.querySelector<HTMLElement>('#box')!
    const computed = getComputedStyle(el)
    // 0.5rem at the default 16px root font size — the browser does the math,
    // proving the unit was baked at emission (theme authored in px).
    expect(computed.paddingTop).toBe('8px')
    expect(computed.backgroundColor).toBe('rgb(15, 23, 42)')
    m.unmount()
  })

  it('proportional sizing: calc() over two vars computes natively', () => {
    const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
    const { vars, css } = themeToCssVars(theme)
    injectCss(css)

    const Box = styled('div')`
      width: calc(${vars.spacing.small} * ${vars.ratio.medium});
    `
    const m = mountInBrowser(h(Box, { id: 'calc-box' }))
    const el = m.container.querySelector<HTMLElement>('#calc-box')!
    // calc(0.5rem * 1.5) = 0.75rem = 12px
    expect(getComputedStyle(el).width).toBe('12px')
    m.unmount()
  })

  it('data-theme attribute flip changes computed styles with NO class change', () => {
    const theme = { rootSize: 16, color: { surface: 'rgb(255, 255, 255)' } }
    const { vars, css } = themeToCssVars(theme)
    // Phase 2 (rocketstyle/PyreonUI) generates the dark override from
    // component-level mode(a, b) pairs; here we lock the underlying
    // mechanism: var indirection + attribute flip, zero re-resolution.
    injectCss(`${css}\n[data-theme="dark"] {\n  --px-color-surface: rgb(15, 23, 42);\n}`)

    const Box = styled('div')`
      background-color: ${vars.color.surface};
    `
    const m = mountInBrowser(h(Box, { id: 'mode-box' }))
    const el = m.container.querySelector<HTMLElement>('#mode-box')!
    const classBefore = el.className
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(255, 255, 255)')

    document.documentElement.setAttribute('data-theme', 'dark')
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(15, 23, 42)')
    expect(el.className).toBe(classBefore)
    m.unmount()
  })

  it('var() values survive @media blocks (responsive output shape)', () => {
    const theme = { rootSize: 16, color: { accent: 'rgb(255, 0, 0)' } }
    const { vars, css } = themeToCssVars(theme)
    injectCss(css)

    const Box = styled('div')`
      color: rgb(0, 0, 0);
      @media (min-width: 50px) {
        color: ${vars.color.accent};
      }
    `
    const m = mountInBrowser(h(Box, { id: 'media-box' }))
    const el = m.container.querySelector<HTMLElement>('#media-box')!
    expect(getComputedStyle(el).color).toBe('rgb(255, 0, 0)')
    m.unmount()
  })
})
