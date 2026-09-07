import { describe, expect, it } from 'vitest'
import { computed, effect, signal } from '@pyreon/reactivity'
import { _lc, _rpd, makeReactiveProps, REACTIVE_PROP } from '../props'

/**
 * `_rpd(sig)` is the compiler's wrapper for a prop whose expression is EXACTLY
 * a bare signal/computed call. It must keep `_rp`'s contract (a branded thunk
 * `makeReactiveProps` turns into a getter) AND delegate the signal's direct-tier
 * surface — `.direct` / `._v` / `.peek` — to the SOURCE, re-targeted rather than
 * copied, so a consumer that receives the getter itself can subscribe on the
 * O(1) `_d1` slot. runtime-dom locks the end-to-end binding
 * (`reactive-prop-direct-tier.test.tsx`); this file locks the primitive's own
 * shape in the package that ships it.
 */
describe('_rpd — reactive prop carrying the direct tier', () => {
  it('is branded and reads through to the signal like _rp', () => {
    const sig = signal(1)
    const t = _rpd(sig) as (() => number) & Record<symbol, unknown>
    expect(t[REACTIVE_PROP]).toBe(true)
    expect(t()).toBe(1)
    sig.set(2)
    expect(t()).toBe(2)
    // the SIGNAL itself is never branded — a shared object passed elsewhere as
    // a plain value must not be misread as a reactive prop
    expect((sig as unknown as Record<symbol, unknown>)[REACTIVE_PROP]).toBeUndefined()
  })

  it('forwards `_v` live and `peek` untracked, re-targeted to the signal', () => {
    const sig = signal('a')
    const t = _rpd(sig) as (() => string) & { _v: string; peek: () => string }
    expect(t._v).toBe('a')
    expect(t.peek()).toBe('a')
    sig.set('b')
    expect(t._v).toBe('b')
    expect(t.peek()).toBe('b')
    // peek is untracked: an effect reading it never re-runs on a write
    let runs = 0
    effect(() => { t.peek(); runs++ })
    sig.set('c')
    expect(runs).toBe(1)
  })

  it('re-targets `direct` so a direct subscriber fires on the SIGNAL, not the thunk', () => {
    const sig = signal(0)
    const t = _rpd(sig) as (() => number) & { direct: (fn: () => void) => () => void }
    const seen: number[] = []
    const unsub = t.direct(() => seen.push(sig.peek()))
    sig.set(1)
    sig.set(2)
    expect(seen).toEqual([1, 2])
    unsub()
    sig.set(3)
    expect(seen).toEqual([1, 2])
  })

  it('carries a computed the same way (computed exposes the direct tier too)', () => {
    const base = signal(2)
    const dbl = computed(() => base() * 2)
    const t = _rpd(dbl) as (() => number) & { direct: (fn: () => void) => () => void; _v: number }
    expect(t()).toBe(4)
    const seen: number[] = []
    t.direct(() => seen.push(t._v))
    base.set(5)
    expect(seen).toEqual([10])
  })

  it('degrades to a plain branded thunk when the source has no direct tier', () => {
    let v = 7
    const plain = () => v
    const t = _rpd(plain) as (() => number) & { direct?: unknown; peek?: unknown; _v?: unknown }
    expect(t()).toBe(7)
    expect(t.direct).toBeUndefined()
    expect(t.peek).toBeUndefined()
    // `_v` is always defined (the getter forwards whatever the source has)
    expect(t._v).toBeUndefined()
    v = 8
    expect(t()).toBe(8)
  })

  it('is installed as a getter by makeReactiveProps, and the getter keeps the tier', () => {
    const sig = signal('x')
    const props = makeReactiveProps({ value: _rpd(sig), id: 1 }) as { value: string; id: number }
    expect(props.value).toBe('x')
    sig.set('y')
    expect(props.value).toBe('y')
    const g = Object.getOwnPropertyDescriptor(props, 'value')!.get as (() => string) & { direct?: unknown; _v?: string }
    expect(typeof g.direct).toBe('function')
    expect(g._v).toBe('y')
  })
})

describe('_lc — lazy, memoized, untracked component children', () => {
  it('is branded, builds on first read only, and memoizes the value', () => {
    let builds = 0
    const t = _lc(() => { builds++; return { built: builds } }) as (() => { built: number }) & Record<symbol, unknown>
    expect(t[REACTIVE_PROP]).toBe(true)
    expect(builds).toBe(0)
    const first = t()
    expect(builds).toBe(1)
    expect(t()).toBe(first)
    expect(builds).toBe(1)
  })

  it('runs the builder UNTRACKED — a signal read inside it does not subscribe the reader', () => {
    const sig = signal(1)
    const t = _lc(() => sig())
    let runs = 0
    effect(() => { t(); runs++ })
    expect(runs).toBe(1)
    sig.set(2)
    expect(runs).toBe(1)
    // and the memoized value is the one built at first read
    expect(t()).toBe(1)
  })

  it('installs as a value getter through makeReactiveProps', () => {
    const props = makeReactiveProps({ children: _lc(() => 'child') }) as { children: string }
    expect(props.children).toBe('child')
  })
})
