/**
 * `defineCrossModuleState` — the helper that hosts module-level state on
 * `globalThis` under a `Symbol.for` key so two module instances of the same
 * package (Vite `[bare]` vs `[package entry]` resolution producing duplicates,
 * sub-dep version mismatches, etc.) share ONE state object.
 *
 * The companion `cross-module-state.test.ts` proves the contract end-to-end
 * for `@pyreon/core`'s 5 state vars by asserting on the literal Symbol.for
 * keys. This file proves the helper itself:
 *
 *   (1) The first call creates the state via `init()`, hosts it on
 *       `globalThis[Symbol.for(key)]`, and returns it.
 *   (2) Subsequent calls with the SAME key return the existing reference
 *       (NOT a new object from `init()`), even from "fake second module
 *       instances" that run the same bootstrap code.
 *   (3) `init()` runs exactly once per heap per key — repeat calls don't
 *       re-invoke the factory.
 *   (4) Mutations via the returned object propagate to every consumer.
 */
import { describe, expect, it, vi } from 'vitest'
import { defineCrossModuleState } from '../cross-module-state'

const g = globalThis as Record<symbol, unknown>

describe('defineCrossModuleState — cross-module-instance state registry', () => {
  it('first call creates state, hosts it under Symbol.for(key), returns it', () => {
    const key = 'pyreon-core/test/first-call-' + Math.random().toString(36).slice(2)
    const factory = vi.fn(() => ({ value: 42 }))
    const state = defineCrossModuleState(key, factory)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(state).toEqual({ value: 42 })
    expect(g[Symbol.for(key)]).toBe(state)
  })

  it('subsequent calls with the same key return the existing reference', () => {
    const key = 'pyreon-core/test/dedupe-' + Math.random().toString(36).slice(2)
    const factory = vi.fn(() => ({ counter: 0 }))
    const first = defineCrossModuleState(key, factory)
    const second = defineCrossModuleState(key, factory)
    const third = defineCrossModuleState(key, factory)
    // Same `===` reference across all three calls.
    expect(second).toBe(first)
    expect(third).toBe(first)
    // Factory invoked exactly once — subsequent calls find the existing state
    // via the Symbol.for registry and skip `init()` entirely.
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('mutations to the returned object are visible to every consumer', () => {
    const key = 'pyreon-core/test/mutation-' + Math.random().toString(36).slice(2)
    const a = defineCrossModuleState<{ count: number }>(key, () => ({ count: 0 }))
    const b = defineCrossModuleState<{ count: number }>(key, () => ({ count: 999 }))
    a.count = 5
    expect(b.count).toBe(5) // Same object — mutation visible
    b.count = 10
    expect(a.count).toBe(10) // Symmetric
  })

  it('different keys produce different state objects', () => {
    const keyA = 'pyreon-core/test/keyA-' + Math.random().toString(36).slice(2)
    const keyB = 'pyreon-core/test/keyB-' + Math.random().toString(36).slice(2)
    const a = defineCrossModuleState(keyA, () => ({ id: 'A' }))
    const b = defineCrossModuleState(keyB, () => ({ id: 'B' }))
    expect(a).not.toBe(b)
    expect(a.id).toBe('A')
    expect(b.id).toBe('B')
  })

  it('a fake "second module instance" calling defineCrossModuleState finds the existing state', () => {
    // Simulate a second `@pyreon/core` module instance running its module-eval
    // code: it calls `defineCrossModuleState(key, init)`, the registry lookup
    // succeeds, the factory is NOT invoked, and the returned object IS the
    // same object the first instance got.
    const key = 'pyreon-core/test/second-instance-' + Math.random().toString(36).slice(2)
    const firstFactory = vi.fn(() => ({ token: 'first' }))
    const first = defineCrossModuleState(key, firstFactory)

    const secondFactory = vi.fn(() => ({ token: 'second-WRONG' }))
    const second = defineCrossModuleState(key, secondFactory)

    expect(first).toBe(second) // SAME object — not a new one
    expect(second.token).toBe('first') // first factory's value, not second's
    expect(firstFactory).toHaveBeenCalledTimes(1)
    expect(secondFactory).toHaveBeenCalledTimes(0) // second factory never ran
  })
})
