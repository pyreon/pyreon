import { h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { init, resolveCssVariables } from '../config'
import { cssVariablesPrePaintScript } from '../cssVariablesPrePaint'
import { PyreonUI } from '../PyreonUI'

const provideSpy = vi.spyOn(await import('@pyreon/core'), 'provide')

// Unit contract for PyreonUI under `init({ cssVariables: true })`:
// the provided theme tree carries var() leaves, the :root block lands in
// the styler sheet, the ROOT provider drives the mode attribute on
// `document.documentElement` (so it sits at `:root` with the pre-paint
// script), and children pass through with no wrapper. Flag off must be
// byte-identical to the classic behavior (children passthrough).

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576 }, spacing: { small: 8 } }

afterEach(() => {
  init({ cssVariables: false })
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-mode')
})

describe('resolveCssVariables', () => {
  it('defaults', () => {
    expect(resolveCssVariables()).toEqual({ enabled: false, prefix: 'px', attribute: 'data-theme' })
    init({ cssVariables: true })
    expect(resolveCssVariables()).toEqual({ enabled: true, prefix: 'px', attribute: 'data-theme' })
  })

  it('partial overrides merge over defaults', () => {
    init({ cssVariables: { prefix: 'app' } })
    expect(resolveCssVariables()).toEqual({ enabled: true, prefix: 'app', attribute: 'data-theme' })
  })
})

describe('PyreonUI — cssVariables mode', () => {
  it('flag off: children passthrough, untouched theme leaves (control)', () => {
    const child = h('div', null, 'hello')
    const result = PyreonUI({ theme, children: child })
    expect(result).toBe(child)
  })

  it('ROOT provider returns children UNWRAPPED (mode lives on documentElement, no wrapper)', () => {
    init({ cssVariables: true })
    const child = h('div', null, 'hello')
    // No ancestor provider → root path: children pass through with no
    // `display: contents` wrapper. The mode attribute is driven onto
    // documentElement by an effect (verified under a real mount lifecycle
    // in css-variables-mode.browser.test.tsx — the unmounted direct call
    // here can't deterministically observe effect timing).
    const result = PyreonUI({ theme, mode: 'dark', children: child })
    expect(result).toBe(child)
  })

  it('provides a var-leaf theme tree and injects the :root block', () => {
    init({ cssVariables: true })
    provideSpy.mockClear()
    PyreonUI({ theme, children: h('i', null) })
    // First provide() call is the styler ThemeContext getter. Invoking it
    // evaluates the (lazy) enrichedTheme computed — tokenization + the
    // idempotent sheet injection happen exactly there, mirroring the first
    // consumer read in a real mount.
    const themeGetter = provideSpy.mock.calls[0]![1] as () => Record<string, any>
    const provided = themeGetter()
    expect(provided.spacing.small).toBe('var(--px-spacing-small)')
    // excluded keys stay raw — media-query generation reads real numbers
    expect(provided.rootSize).toBe(16)
    expect(provided.breakpoints).toEqual(theme.breakpoints)
    expect(provided.__PYREON__).toBeDefined()

    const allRules = [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText)
        } catch {
          return []
        }
      })
      .join('\n')
    expect(allRules).toContain('--px-spacing-small: 0.5rem')
  })
})

describe('cssVariablesPrePaintScript', () => {
  afterEach(() => init({ cssVariables: false }))

  it('builds a self-contained blocking script that writes documentElement', () => {
    const s = cssVariablesPrePaintScript()
    expect(s).toContain('document.documentElement.setAttribute("data-theme"')
    expect(s).toContain('localStorage.getItem("zero-theme")')
    expect(s).toContain('prefers-color-scheme:dark')
    // try/catch-wrapped — a storage/matchMedia throw must never block paint
    expect(s).toContain('try{')
    expect(s).toContain('}catch(e){}')
  })

  it('honors the resolved cssVariables attribute', () => {
    init({ cssVariables: { attribute: 'data-mode' } })
    expect(cssVariablesPrePaintScript()).toContain(
      'document.documentElement.setAttribute("data-mode"',
    )
  })

  it('options override attribute / storageKey / fallback', () => {
    const s = cssVariablesPrePaintScript({
      attribute: 'data-x',
      storageKey: 'my-key',
      fallback: 'dark',
    })
    expect(s).toContain('"data-x"')
    expect(s).toContain('localStorage.getItem("my-key")')
    // fallback used when no stored pref AND no dark system match
    expect(s).toContain(':"dark"')
  })

  it('the emitted script actually resolves a persisted preference (eval contract)', () => {
    localStorage.setItem('zero-theme', 'dark')
    document.documentElement.removeAttribute('data-theme')
    // eslint-disable-next-line no-eval
    ;(0, eval)(cssVariablesPrePaintScript())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    localStorage.removeItem('zero-theme')
    document.documentElement.removeAttribute('data-theme')
  })
})
