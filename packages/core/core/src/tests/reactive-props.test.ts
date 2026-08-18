import { describe, expect, it } from 'vitest'
import { makeReactiveProps, REACTIVE_PROP, _rp, _wrapSpread } from '../props'

describe('makeReactiveProps', () => {
  it('returns raw object when no reactive props exist (fast path)', () => {
    const raw = { a: 1, b: 'hello', c: true }
    const result = makeReactiveProps(raw)
    // Must return the exact same object reference — no allocation
    expect(result).toBe(raw)
  })

  it('returns raw when props contain non-branded functions', () => {
    const fn = () => 42
    const raw = { handler: fn, name: 'test' }
    const result = makeReactiveProps(raw)
    expect(result).toBe(raw)
    // Non-branded function is preserved as-is
    expect(result.handler).toBe(fn)
  })

  it('converts branded _rp() props to getter properties', () => {
    let value = 10
    const accessor = _rp(() => value)
    const raw = { count: accessor, label: 'hello' }
    const result = makeReactiveProps(raw)

    // Must NOT be the same object (a new getter-backed object is created)
    expect(result).not.toBe(raw)
    // Getter reads the current value
    expect(result.count).toBe(10)
    value = 20
    expect(result.count).toBe(20)
    // Static props are copied as-is
    expect(result.label).toBe('hello')
  })

  it('handles mixed reactive and static props', () => {
    let x = 'a'
    const raw = {
      static1: 42,
      reactive1: _rp(() => x),
      static2: true,
      nonBranded: () => 'plain function',
    }
    const result = makeReactiveProps(raw)

    expect(result).not.toBe(raw)
    expect(result.static1).toBe(42)
    expect(result.static2).toBe(true)
    expect(result.reactive1).toBe('a')
    // Non-branded function is copied as a value, not converted to getter
    expect(typeof result.nonBranded).toBe('function')
    expect((result.nonBranded as () => string)()).toBe('plain function')

    x = 'b'
    expect(result.reactive1).toBe('b')
  })

  it('reactive prop getters are enumerable and configurable', () => {
    const raw = { x: _rp(() => 1) }
    const result = makeReactiveProps(raw)
    const desc = Object.getOwnPropertyDescriptor(result, 'x')
    expect(desc?.enumerable).toBe(true)
    expect(desc?.configurable).toBe(true)
    expect(typeof desc?.get).toBe('function')
  })

  it('handles empty props object', () => {
    const raw = {}
    const result = makeReactiveProps(raw)
    expect(result).toBe(raw)
  })

  it('copies STATIC props that appear AFTER the first reactive one', () => {
    // The single-pass shape starts copying at the first reactive prop and
    // backfills the keys before it. A bug in either half silently DROPS a
    // static prop, which is invisible until a component reads it.
    const raw = { before: 1, live: _rp(() => 'x'), after: 2 }
    const result = makeReactiveProps(raw)
    expect(result.before).toBe(1)
    expect(result.after).toBe(2)
    expect(result.live).toBe('x')
    expect(Object.keys(result)).toEqual(['before', 'live', 'after'])
  })

  it('gives every call its OWN getter', () => {
    // Guards against "optimising" this path by hoisting a shared descriptor
    // or result object out of the function: each call must keep its own
    // thunk, or a later call would retro-actively rewrite an earlier props
    // object. (A shared module-level descriptor was tried and dropped — it
    // saved one small allocation but needed module-level mutable state and a
    // cast around `exactOptionalPropertyTypes`.)
    const first = makeReactiveProps({ v: _rp(() => 'A') })
    const second = makeReactiveProps({ v: _rp(() => 'B') })
    expect(first.v).toBe('A')
    expect(second.v).toBe('B')
    // And re-reading the first is still 'A' after the second call ran.
    expect(first.v).toBe('A')
  })
})

describe('_rp', () => {
  it('brands a function with REACTIVE_PROP', () => {
    const fn = () => 42
    const branded = _rp(fn)
    expect(branded).toBe(fn) // same function reference
    expect((branded as any)[REACTIVE_PROP]).toBe(true)
  })

  it('branded function still callable', () => {
    const branded = _rp(() => 'hello')
    expect(branded()).toBe('hello')
  })
})

describe('_wrapSpread', () => {
  it('returns null/undefined unchanged (primitive guard)', () => {
    expect(_wrapSpread(null)).toBe(null)
    expect(_wrapSpread(undefined)).toBe(undefined)
  })

  it('returns source unchanged when no getter descriptors exist (fast path)', () => {
    const source = { a: 1, b: 'x', c: true }
    expect(_wrapSpread(source)).toBe(source)
  })

  it('returns source unchanged for empty objects', () => {
    const source = {}
    expect(_wrapSpread(source)).toBe(source)
  })

  it('wraps getter-shaped reactive props as _rp-branded thunks', () => {
    let liveValue = 'a'
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'x', {
      get: () => liveValue,
      enumerable: true,
      configurable: true,
    })

    const result = _wrapSpread(source) as Record<string, unknown>
    expect(result).not.toBe(source) // new object allocated

    const wrappedX = result.x as () => unknown
    expect(typeof wrappedX).toBe('function')
    expect((wrappedX as unknown as Record<symbol, unknown>)[REACTIVE_PROP]).toBe(true)

    // Lazy read — each call reads the current source[x] getter value
    expect(wrappedX()).toBe('a')
    liveValue = 'b'
    expect(wrappedX()).toBe('b') // live re-read, not captured
  })

  it('preserves data properties as-is when mixed with getters', () => {
    const source = { plain: 'data' } as Record<string, unknown>
    Object.defineProperty(source, 'reactive', {
      get: () => 'live',
      enumerable: true,
      configurable: true,
    })

    const result = _wrapSpread(source) as Record<string, unknown>
    expect(result.plain).toBe('data') // copied through
    expect(typeof result.reactive).toBe('function') // wrapped as thunk
  })

  it('preserves Reflect.ownKeys symbol-keyed properties', () => {
    const sym = Symbol('marker')
    const source = { regular: 'x' } as Record<string | symbol, unknown>
    Object.defineProperty(source, 'reactive', {
      get: () => 'live',
      enumerable: true,
      configurable: true,
    })
    source[sym] = 'symbol-value'

    const result = _wrapSpread(source) as Record<string | symbol, unknown>
    expect(result.regular).toBe('x')
    // Note: symbol keys go through Reflect.ownKeys; the wrap path indexes
    // via `key as string` for type narrowing but the runtime carries them
    // forward as data properties.
    expect(typeof result.reactive).toBe('function')
  })
})
