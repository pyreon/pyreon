import { h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { init, resolveCssVariables } from '../config'
import { PyreonUI } from '../PyreonUI'

const provideSpy = vi.spyOn(await import('@pyreon/core'), 'provide')

// Unit contract for PyreonUI under `init({ cssVariables: true })`:
// the provided theme tree carries var() leaves, the :root block lands in
// the styler sheet, and the returned tree is wrapped in a layout-neutral
// `display: contents` carrier for the mode attribute. Flag off must be
// byte-identical to the classic behavior (children passthrough).

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576 }, spacing: { small: 8 } }

afterEach(() => {
  init({ cssVariables: false })
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

  it('renders the display:contents wrapper carrying the mode attribute', () => {
    init({ cssVariables: true })
    const child = h('div', null, 'hello')
    const result = PyreonUI({ theme, mode: 'dark', children: child }) as any
    expect(result).not.toBe(child)
    expect(result.type).toBe('div')
    expect(result.props.style).toBe('display: contents')
    // reactive accessor — resolves to the current mode
    expect(typeof result.props['data-theme']).toBe('function')
    expect(result.props['data-theme']()).toBe('dark')
  })

  it('custom attribute name is honored on the wrapper', () => {
    init({ cssVariables: { attribute: 'data-mode' } })
    const result = PyreonUI({ theme, children: h('i', null) }) as any
    expect(typeof result.props['data-mode']).toBe('function')
    expect(result.props['data-theme']).toBeUndefined()
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
