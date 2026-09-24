/**
 * `setStore`'s prototype-pollution defence, on the paths that can actually
 * reach it.
 *
 * The guard is deliberately doubled: an inline `===` refusal of
 * `__proto__` / `constructor` / `prototype` at every path segment, AND
 * `Object.defineProperty` for the final write instead of `obj[key] = value`.
 * The second is the subtle half and the source explains why — a bracket
 * write walks the prototype chain, so a setter installed on
 * `Object.prototype` for that key runs INSTEAD of creating an own property.
 * `defineProperty` installs the own property without invoking anything.
 *
 * That second guard had no test, and it is exactly the kind that looks
 * redundant next to the first one. It is not: the `===` refusal covers
 * three known keys, while the setter hazard applies to ANY key an attacker
 * has already managed to install a setter for.
 *
 * (`safeAssign` and the zero-length-path branch beside it are NOT covered
 * here, and deliberately: `setStore` dispatches either the draft form or a
 * path form whose path is always ≥ 1 segment, and both recursive calls are
 * guarded on `rest.length > 0` — so that branch is unreachable. Covering it
 * would mean calling an internal directly, which asserts nothing about the
 * shipped API.)
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createStore } from '../index'

const proto = Object.prototype as unknown as Record<string, unknown>

afterEach(() => {
  for (const k of ['polluted', 'injected', 'trapped']) {
    delete proto[k]
    try {
      delete (Object.prototype as unknown as Record<string, unknown>)[k]
    } catch {
      // best effort
    }
  }
})

describe('a dangerous path segment is refused at any depth', () => {
  it('refuses __proto__ as the FIRST segment', () => {
    const [state, setState] = createStore({ a: 1 } as Record<string, unknown>)
    setState('__proto__' as never, { polluted: true } as never)

    expect(proto.polluted, 'Object.prototype must be untouched').toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(state.a, 'the store is otherwise unchanged').toBe(1)
  })

  it('refuses __proto__ as a NESTED segment', () => {
    // `setStore('user', '__proto__', …)`. A guard applied only at the top
    // is picked around by adding one segment.
    const [state, setState] = createStore({ user: { name: 'a' } as Record<string, unknown> })
    setState('user' as never, '__proto__' as never, { polluted: true } as never)

    expect(proto.polluted).toBeUndefined()
    expect(state.user.name).toBe('a')
  })

  it('refuses `constructor` and `prototype` too', () => {
    // `constructor` is the subtler one: overwriting it breaks `instanceof`
    // and anything reading `x.constructor.name`, with no obvious source.
    const [, setState] = createStore({ a: 1 } as Record<string, unknown>)
    const ctorBefore = ({} as Record<string, unknown>).constructor

    setState('constructor' as never, 'hijacked' as never)
    setState('prototype' as never, 'hijacked' as never)

    expect(({} as Record<string, unknown>).constructor).toBe(ctorBefore)
  })

  it('still writes an ORDINARY key — the guard is not a blanket refusal', () => {
    // The control. Without it every spec above passes against a `setStore`
    // that refuses everything.
    const [state, setState] = createStore({ a: 1 } as Record<string, unknown>)
    setState('a' as never, 2 as never)
    expect(state.a).toBe(2)
  })
})

describe('the final write does not go through the prototype chain', () => {
  it('does NOT invoke a setter installed on Object.prototype', () => {
    // The reason `defineProperty` is used instead of `obj[key] = value`.
    // A plain bracket write finds the inherited setter and calls it, so
    // the store never gains its own property AND attacker code runs on
    // every update. The key here is ordinary — the `===` guard does not
    // apply to it, so this is the second guard or nothing.
    let setterRuns = 0
    Object.defineProperty(Object.prototype, 'trapped', {
      configurable: true,
      set() {
        setterRuns += 1
      },
      get() {
        return 'from-prototype'
      },
    })

    try {
      const [state, setState] = createStore({} as Record<string, unknown>)
      setState('trapped' as never, 'own-value' as never)

      expect(setterRuns, 'the inherited setter must not run').toBe(0)
      expect(state.trapped, 'the store gets its OWN property').toBe('own-value')
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).trapped
    }
  })

  it('writes an enumerable, writable, configurable own property', () => {
    // `defineProperty` defaults every flag to false. A value written with
    // the defaults would be invisible to `Object.keys`, to spreads, and to
    // JSON.stringify — the store would look empty while holding data.
    const [state, setState] = createStore({} as Record<string, unknown>)
    setState('x' as never, 1 as never)

    expect(Object.keys(state)).toContain('x')
    expect(JSON.parse(JSON.stringify(state))).toEqual({ x: 1 })
  })
})

describe('the two setStore forms, and the one that does nothing', () => {
  it('the draft form mutates a clone and commits it', () => {
    const [state, setState] = createStore({ count: 1, nested: { v: 1 } })
    setState(((s: { count: number; nested: { v: number } }) => {
      s.count = 5
      s.nested.v = 9
    }) as never)
    expect(state.count).toBe(5)
    expect(state.nested.v).toBe(9)
  })

  it('a functional value at the last segment receives the previous value', () => {
    const [state, setState] = createStore({ count: 5 })
    setState('count', (prev: number) => prev + 1)
    expect(state.count).toBe(6)
  })

  it('a single NON-function argument is a documented no-op', () => {
    // `setStore({ a: 2 })` is Solid's merge form and this shim does not
    // implement it — it falls through both branches. Pinned so the
    // behaviour is a recorded decision rather than an accident, and so a
    // future implementation has to update this spec deliberately.
    const [state, setState] = createStore({ a: 1 } as Record<string, unknown>)
    expect(() => setState({ a: 2 } as never)).not.toThrow()
    expect(state.a, 'unchanged — the object form is not supported').toBe(1)
  })
})
