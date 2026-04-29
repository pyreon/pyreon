import { describe, expect, it } from 'vitest'
import { isNativeCompat, NATIVE_COMPAT_MARKER, nativeCompat } from '../compat-marker'

describe('NATIVE_COMPAT_MARKER', () => {
  it('is the same registry symbol regardless of how it is referenced', () => {
    // Symbol.for(...) registry contract — every consumer that uses the same
    // string key (compat layers reading it, framework packages writing it)
    // gets the SAME symbol identity. Changing the string is a breaking
    // change to the marker contract.
    expect(NATIVE_COMPAT_MARKER).toBe(Symbol.for('pyreon:native-compat'))
  })

  it('is a `symbol`-typed value', () => {
    expect(typeof NATIVE_COMPAT_MARKER).toBe('symbol')
  })
})

describe('nativeCompat', () => {
  it('attaches the marker to a function and returns the same reference', () => {
    function RouterView() {
      return null
    }
    const marked = nativeCompat(RouterView)
    expect(marked).toBe(RouterView)
    expect((RouterView as unknown as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER]).toBe(true)
  })

  it('is idempotent — applying twice yields the same property state', () => {
    const Component = () => null
    nativeCompat(Component)
    nativeCompat(Component)
    expect((Component as unknown as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER]).toBe(true)
  })

  it('passes non-function values through unchanged', () => {
    // Defensive: callers may pipe variables of unknown shape (e.g. lazy
    // imports that resolve to objects, or null during HMR boundary
    // teardown). The helper must be safe regardless.
    expect(nativeCompat(null as unknown)).toBe(null)
    expect(nativeCompat(undefined as unknown)).toBe(undefined)
    const obj = { foo: 'bar' }
    expect(nativeCompat(obj)).toBe(obj)
    expect((obj as unknown as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER]).toBeUndefined()
  })

  it('preserves the function signature for typed callers', () => {
    // The generic `T` flows through unchanged so framework component
    // exports keep their typed callable shape after wrapping.
    const Typed = (props: { name: string }): string => `hello ${props.name}`
    const marked: typeof Typed = nativeCompat(Typed)
    expect(marked({ name: 'world' })).toBe('hello world')
  })
})

describe('isNativeCompat', () => {
  it('returns true for a marked function', () => {
    const Comp = nativeCompat(() => null)
    expect(isNativeCompat(Comp)).toBe(true)
  })

  it('returns false for an unmarked function', () => {
    expect(isNativeCompat(() => null)).toBe(false)
  })

  it('returns false for non-function inputs', () => {
    expect(isNativeCompat(null)).toBe(false)
    expect(isNativeCompat(undefined)).toBe(false)
    expect(isNativeCompat('string')).toBe(false)
    expect(isNativeCompat(42)).toBe(false)
    expect(isNativeCompat({ [NATIVE_COMPAT_MARKER]: true })).toBe(false)
  })

  it('returns false when the marker is set to a non-true value', () => {
    // Defensive against accidental shape mismatch — only `=== true` qualifies.
    function Comp() {
      return null
    }
    ;(Comp as unknown as Record<symbol, unknown>)[NATIVE_COMPAT_MARKER] = 1
    expect(isNativeCompat(Comp)).toBe(false)
    ;(Comp as unknown as Record<symbol, unknown>)[NATIVE_COMPAT_MARKER] = 'yes'
    expect(isNativeCompat(Comp)).toBe(false)
  })

  it('reads the same registry symbol that nativeCompat writes', () => {
    // Cross-side contract: a function marked here is detectable by
    // someone who looked up the symbol via `Symbol.for('pyreon:native-compat')`
    // independently — without importing NATIVE_COMPAT_MARKER from this module.
    const Comp = nativeCompat(function Comp() {
      return null
    })
    const externallyDiscoveredSymbol = Symbol.for('pyreon:native-compat')
    expect(
      (Comp as unknown as Record<symbol, boolean>)[externallyDiscoveredSymbol],
    ).toBe(true)
  })
})
