import { init } from '@pyreon/ui-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getThemeByMode, getThemeFromChain } from '../utils/theme'

// Unit contract for the CSS-variables mode(a, b) factory: under
// `init({ cssVariables: true })`, getThemeFromChain hands `.theme()`
// callbacks the var-pair factory instead of the branded classic callback —
// resolved themes carry plain `var(--px-m-<hash>)` strings and are
// mode-FREE (getThemeByMode passes them through untouched).

type AnyTheme = Record<string, any>

const chain = (cb: (t: AnyTheme, mode: any) => AnyTheme): AnyTheme =>
  getThemeFromChain([cb as any], {})

afterEach(() => {
  init({ cssVariables: false })
  vi.restoreAllMocks()
})

describe('cssVariables — mode(a, b) var-pair factory', () => {
  it('returns a var reference string instead of a branded callback', () => {
    init({ cssVariables: true })
    const out = chain((_, mode) => ({ color: mode('#ffffff', '#0f172a') }))
    expect(out.color).toMatch(/^var\(--px-m-[a-z0-9]+\)$/)
  })

  it('flag off keeps the classic branded callback (resolved per mode)', () => {
    const out = chain((_, mode) => ({ color: mode('#ffffff', '#0f172a') }))
    expect(typeof out.color).toBe('function')
    expect((getThemeByMode(out, 'light') as AnyTheme).color).toBe('#ffffff')
    expect((getThemeByMode(out, 'dark') as AnyTheme).color).toBe('#0f172a')
  })

  it('identical pairs dedupe to the SAME variable; different pairs differ', () => {
    init({ cssVariables: true })
    const a = chain((_, mode) => ({ color: mode('#fff', '#000') }))
    const b = chain((_, mode) => ({ background: mode('#fff', '#000') }))
    const c = chain((_, mode) => ({ color: mode('#fff', '#111') }))
    expect(a.color).toBe(b.background)
    expect(a.color).not.toBe(c.color)
  })

  it('var-pair themes are mode-free — getThemeByMode passes them through', () => {
    init({ cssVariables: true })
    const out = chain((_, mode) => ({ color: mode('#fff', '#000'), padding: '1rem' }))
    expect(getThemeByMode(out, 'dark')).toEqual(out)
  })

  it('custom prefix flows into the var name', () => {
    init({ cssVariables: { prefix: 'app' } })
    const out = chain((_, mode) => ({ color: mode('red', 'blue') }))
    expect(out.color).toMatch(/^var\(--app-m-/)
  })

  it('emits the light + dark rules into the live styler sheet (idempotent)', () => {
    init({ cssVariables: true })
    const out = chain((_, mode) => ({ color: mode('rgb(1, 2, 3)', 'rgb(4, 5, 6)') }))
    const varName = (out.color as string).slice('var('.length, -1)
    const allRules = [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText)
        } catch {
          return []
        }
      })
      .join('\n')
    expect(allRules).toContain(`${varName}: rgb(1, 2, 3)`)
    expect(allRules).toContain(`${varName}: rgb(4, 5, 6)`)
    expect(allRules).toContain('[data-theme="dark"]')
    // second resolution of the same pair must not duplicate the rules
    chain((_, mode) => ({ color: mode('rgb(1, 2, 3)', 'rgb(4, 5, 6)') }))
    const count = [...document.styleSheets]
      .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
      .filter((t) => t.includes(`${varName}: rgb(1, 2, 3)`)).length
    expect(count).toBe(1)
  })

  it('warns in dev when a pair member is a NUMBER (units cannot apply)', () => {
    init({ cssVariables: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    chain((_, mode) => ({ padding: mode(8, 12) }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unit-complete'))
  })
})
