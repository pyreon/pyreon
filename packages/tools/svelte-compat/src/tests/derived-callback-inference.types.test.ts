// `derived()` lost its callback's parameter type under strict TypeScript (#4306).
//
// `fn` was ONE parameter typed as a union of the sync callback and the
// `(values, set, update)` callback. A union of function types gives TypeScript
// no single contextual signature, so `derived(count, ($count) => $count * 2)`
// failed `tsc --strict` with TS7006 "Parameter '$count' implicitly has an 'any'
// type" — code that type-checks against `svelte/store`. `derived` now has the
// same two overloads as `svelte/store`.
//
// These are TYPE assertions: this file failing to typecheck IS the failure
// (`tsc --noEmit` covers src/tests). The runtime calls check the overloads
// still route to the right implementation branch.

import { describe, expect, expectTypeOf, it } from 'vitest'
import { derived, get, readable, writable } from '../store'
import type { Readable } from '../store'

describe('derived() callback inference (#4306)', () => {
  it('a sync callback over one store gets the store value type', () => {
    const count = writable(1)
    const doubled = derived(count, ($count) => {
      expectTypeOf($count).toEqualTypeOf<number>()
      return $count * 2
    })
    expectTypeOf(doubled).toEqualTypeOf<Readable<number>>()
    expect(get(doubled)).toBe(2)
    count.set(4)
    expect(get(doubled)).toBe(8)
  })

  it('a sync callback over a store tuple gets each value type', () => {
    const name = writable('a')
    const size = readable(3)
    const label = derived([name, size], ([$name, $size]) => {
      expectTypeOf($name).toEqualTypeOf<string>()
      expectTypeOf($size).toEqualTypeOf<number>()
      return `${$name}:${$size}`
    })
    expectTypeOf(label).toEqualTypeOf<Readable<string>>()
    expect(get(label)).toBe('a:3')
  })

  it('a set-callback gets the value, set and update types', () => {
    const count = writable(2)
    const later = derived(
      count,
      ($count, set, update) => {
        expectTypeOf($count).toEqualTypeOf<number>()
        expectTypeOf(set).toEqualTypeOf<(value: string) => void>()
        set(`n=${$count}`)
        update((prev) => `${prev}!`)
      },
      'init',
    )
    expectTypeOf(later).toEqualTypeOf<Readable<string>>()
    expect(get(later)).toBe('n=2!')
  })

  it('a set-callback that returns a cleanup is accepted', () => {
    const count = writable(1)
    let stopped = 0
    const tracked = derived(
      count,
      ($count, set: (value: number) => void) => {
        set($count + 1)
        return () => {
          stopped++
        }
      },
      0,
    )
    const unsub = tracked.subscribe(() => {})
    unsub()
    expect(stopped).toBe(1)
  })
})
