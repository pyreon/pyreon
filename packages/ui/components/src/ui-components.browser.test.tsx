import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { init, PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Button } from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-components`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom
 * tests can hide: importing a representative rocketstyle component,
 * mounting it in real Chromium, and verifying it produces real DOM.
 *
 * `Button` is the canonical component — exercises rocketstyle
 * (.attrs/.theme/.states/.sizes), styler (CSS-in-JS), elements (`el`
 * base), and unistyle (responsive props) all in one mount. Wrapped
 * in `<PyreonUI theme={theme}>` because rocketstyle's theme chain
 * resolver throws without a theme context — that's the design.
 */
describe('@pyreon/ui-components — browser smoke', () => {
  it('mounts a Button into real DOM with text content', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Button as never, { id: 'smoke-btn' }, 'Click me'),
      ),
    )
    const btn = container.querySelector('#smoke-btn')!
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('Click me')
    unmount()
    expect(document.getElementById('smoke-btn')).toBeNull()
  })
})

describe('@pyreon/ui-components under cssVariables — full default-theme sweep', () => {
  afterEach(() => {
    init({ cssVariables: false })
    vi.restoreAllMocks()
  })

  it('the REAL Button + REAL default theme render under var mode with ZERO invalid CSS', () => {
    // The styler dev validator (NaN / undefined / malformed-var scan) is live
    // in this dev-mode run — a clean mount of the heaviest consumer proves
    // the ENTIRE ui-theme + Button chain (rocketstyle dimensions, elements,
    // unistyle pipeline) is var-safe: no legacy arithmetic, no string-concat.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    init({ cssVariables: true })
    const mode = signal<'light' | 'dark'>('light')
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme, mode: () => mode() } as never,
        h(Button as never, { id: 'var-btn', state: 'primary' }, 'Save'),
      ),
    )
    const btn = container.querySelector<HTMLElement>('#var-btn')!
    expect(btn.textContent).toContain('Save')
    // computed styles resolve to REAL values through the var indirection
    const cs = getComputedStyle(btn)
    expect(cs.backgroundColor).toMatch(/^rgba?\(/)
    expect(cs.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')

    // mode flip: zero className churn (the var-mode contract, end-to-end
    // through the real component library)
    const classBefore = btn.className
    mode.set('dark')
    expect(btn.className).toBe(classBefore)

    // zero validator findings across the WHOLE default theme + Button chain
    const invalid = warn.mock.calls.filter((c) => String(c[0]).includes('[Pyreon] styler:'))
    expect(invalid).toEqual([])
    unmount()
  })
})

