/**
 * `rocketstyle(...).withTheme<Tokens>()` types `t` locally, and `.theme()`
 * actually CHECKS its callback.
 *
 * Two defects, both invisible at runtime (types are erased), so they are
 * asserted with `@ts-expect-error` — each directive FAILS the typecheck if the
 * line under it stops being an error:
 *
 * 1. There was no public way to hand the factory a theme type — the factory
 *    fixed it to `{}`, so an un-annotated `t` was unusable and consumers either
 *    augmented `ThemeDefault` globally or annotated `(t: Tokens) =>`.
 * 2. That annotation was never checked: `.theme()`'s object arm is
 *    `Partial<Record<string, unknown>>`, which every function satisfies, so
 *    `(t: Anything) =>` compiled regardless of the real theme.
 */
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import rocketstyle from '../init'

interface Tokens {
  accent: string
  surface: string
}

const Base: ComponentFn = () => null

describe('withTheme<T>()', () => {
  it('types an un-annotated theme callback with the bound tokens', () => {
    const rs = rocketstyle({ useBooleans: false }).withTheme<Tokens>()
    const Box = rs({ name: 'Box', component: Base }).theme((t) => ({
      backgroundColor: t.surface,
      color: t.accent,
    }))
    expect(typeof Box).toBe('function')
  })

  it('types dimension callbacks with the bound tokens', () => {
    const rs = rocketstyle({ useBooleans: false }).withTheme<Tokens>()
    const Box = rs({ name: 'Box', component: Base }).states((t) => ({
      active: { color: t.accent },
    }))
    expect(typeof Box).toBe('function')
  })

  it('rejects a token the theme does not have', () => {
    const rs = rocketstyle({ useBooleans: false }).withTheme<Tokens>()
    const Box = rs({ name: 'Box', component: Base }).theme((t) => ({
      // @ts-expect-error — `nope` is not a token
      color: t.nope,
    }))
    expect(typeof Box).toBe('function')
  })

  it('returns the same factory at runtime', () => {
    const rs = rocketstyle({ useBooleans: false })
    expect(rs.withTheme<Tokens>()).toBe(rs)
  })
})

describe('.theme() checks its callback', () => {
  it('rejects a callback annotated with the wrong theme shape', () => {
    const rs = rocketstyle({ useBooleans: false }).withTheme<Tokens>()
    const Box = rs({ name: 'Box', component: Base }).theme(
      // @ts-expect-error — the callback receives `Tokens`, not this
      (t: { definitelyNotAToken: number }) => ({ color: String(t.definitelyNotAToken) }),
    )
    expect(typeof Box).toBe('function')
  })

  it('still accepts a plain theme object', () => {
    const Box = rocketstyle()({ name: 'Box', component: Base }).theme({ color: 'red' })
    expect(typeof Box).toBe('function')
  })
})
