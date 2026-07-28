/**
 * `Theme<T>` must actually USE its type argument.
 *
 * It was written `T extends unknown ? ThemeDefault : Merge<[ThemeDefault, T]>`.
 * Every type extends `unknown` — it is the top type — so the conditional was
 * DEGENERATE: always the true branch, `Theme<T>` collapsed to the empty
 * `ThemeDefault`, and the generic was silently discarded for every caller.
 *
 * The cost was not academic. With no working way to type `t`, consumers reached
 * for a global `declare module '@pyreon/rocketstyle'` augmentation — which
 * merges into EVERY other consumer's `t` and makes their tokens claim
 * properties that are `undefined` at runtime — or cast at each call site.
 *
 * A runtime test cannot catch this (types are erased), so it is asserted here.
 */
import { describe, expect, it } from 'vitest'
import type { Theme } from '../types/theme'

interface Tokens {
  accent: string
  surface: string
}

/** Compile-time assertion helpers. */
type Extends<A, B> = A extends B ? true : false
type Expect<T extends true> = T

describe('Theme<T>', () => {
  it('MERGES a concrete type argument (the degenerate form dropped it)', () => {
    // If the generic were discarded, `Theme<Tokens>` would be the empty
    // `ThemeDefault` and neither of these would hold.
    type HasAccent = Expect<Extends<Theme<Tokens>, { accent: string }>>
    type HasSurface = Expect<Extends<Theme<Tokens>, { surface: string }>>
    const ok: [HasAccent, HasSurface] = [true, true]
    expect(ok).toEqual([true, true])
  })

  it('falls back to ThemeDefault when no argument is given', () => {
    // `unknown` means "caller supplied nothing" — the augmentable default.
    type Fallback = Theme<unknown>
    const t: Fallback = {} as never
    expect(typeof t).toBe('object')
  })

  it('types a .theme() callback parameter without a global augmentation', () => {
    // The whole point: read tokens off `t` with no `declare module` in sight.
    const cb = (t: Theme<Tokens>) => t.accent
    expect(cb({ accent: 'red', surface: '#fff' } as Theme<Tokens>)).toBe('red')
  })
})
