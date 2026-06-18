/**
 * Production-mode coverage for the `process.env.NODE_ENV !== 'production'`
 * dev-counter gates across rocketstyle. In dev these gates always take the
 * TRUE arm (counter emit); their implicit-else (the production no-op path)
 * is only reached under `NODE_ENV === 'production'`.
 *
 * `vi.stubEnv('NODE_ENV', 'production')` flips the runtime value — the gates
 * read `process.env.NODE_ENV` at call time (no bundler replacement here), so
 * a fresh render takes the production branch. We drive the SAME definition
 * through the cache-hit, cache-miss, mode-resolution, and omit paths so every
 * dev-gate site executes with the gate false.
 */
import { init } from '@pyreon/ui-core'
import { initTestConfig, withThemeContext } from '@pyreon/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import rocketstyle from '../init'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => {
  vi.unstubAllEnvs()
  init({ cssVariables: false })
})

const Cap: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  $rocketstyle: typeof $rocketstyle === 'function' ? $rocketstyle() : $rocketstyle,
  $rocketstate: typeof $rocketstate === 'function' ? $rocketstate() : $rocketstate,
})
Cap.displayName = 'Cap'

const render = (Component: any, props?: Record<string, any>, ctx?: any): any =>
  withThemeContext(() => Component(props ?? {}), ctx)

describe('rocketstyle — production mode (dev-gate else arms)', () => {
  it('skips the init-time validation in production (init.ts dev gate)', () => {
    // A dimension using a reserved key (`theme`) is a validation error that
    // throws in dev. In production `validateInit` is skipped entirely, so the
    // factory builds without throwing the validation error.
    expect(() =>
      rocketstyle({ dimensions: { theme: 'theme' } as any })({ name: 'X', component: Cap }),
    ).not.toThrow()
  })

  it('resolves through cache-miss then cache-hit without dev counters', () => {
    const Btn: any = rocketstyle()({ name: 'ProdBtn', component: Cap }).states(() => ({
      primary: { color: 'red' },
      secondary: { color: 'blue' },
    }))

    // 1st render — fresh memo MISS (rocketstyle.getTheme gate) + ThemeManager
    // base/dim cache-fill + omitSet fill (all dev-gate else arms in prod).
    const a = render(Btn, { state: 'primary' })
    // 2nd render same key — memo HIT (dimensionMemo.hit gate) + ThemeManager
    // base/dim HITS (localThemeManager.hit gates) + dimensionsMap.hit +
    // omitSet.hit gates.
    const a2 = render(Btn, { state: 'primary' })
    // Different key — another miss path, exercising the per-mode helper hits.
    const b = render(Btn, { state: 'secondary' })

    expect(a.$rocketstyle.color).toBe('red')
    expect(a2.$rocketstyle.color).toBe('red')
    expect(b.$rocketstyle.color).toBe('blue')
  })

  it('resolves the per-mode theme helpers under production (mode-walk hits)', () => {
    const Btn: any = rocketstyle()({ name: 'ProdMode', component: Cap }).theme(
      (_t: any, mode: any) => ({ color: mode('light-c', 'dark-c') }),
    )
    // First dark render fills the per-mode helpers; second hits them.
    const d1 = render(Btn, {}, { mode: 'dark', isDark: true, isLight: false })
    const d2 = render(Btn, {}, { mode: 'dark', isDark: true, isLight: false })
    expect(d1.$rocketstyle.color).toBe('dark-c')
    expect(d2.$rocketstyle.color).toBe('dark-c')
  })

  it('skips the dev-mode mode(number) warning under cssVariables in production (theme.ts gate)', () => {
    init({ cssVariables: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Btn: any = rocketstyle()({ name: 'ProdVar', component: Cap }).theme(
      (_t: any, mode: any) => ({ padding: mode(8, 12) }),
    )
    render(Btn, {})
    // In production the NUMBER warning gate is skipped.
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
