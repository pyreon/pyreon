/**
 * Regression: `@pyreon/core` module-level state must survive being loaded
 * TWICE (Vite's `[bare]` vs `[package entry]` resolution can produce two
 * copies of the same package). The fix lives in 5 places — lifecycle.ts,
 * component.ts, context.ts, telemetry.ts, props.ts — each hosting its
 * state on `globalThis` under a `Symbol.for` key.
 *
 * Test approach: assert directly on the contract — every state var is
 * reachable via its `Symbol.for` key on `globalThis`. Vitest's module
 * resolver dedups even multi-URL imports, so the dual-instance approach
 * doesn't work in this test runner. Asserting on `globalThis[Symbol.for(...)]`
 * directly proves the SAME contract: any consumer that imports `@pyreon/core`
 * via a different code path (lib vs src, different conditions, different
 * bundler) and resolves to a DIFFERENT module instance still reaches the
 * same shared state by looking up `Symbol.for('pyreon-core/...')`.
 *
 * Bisect-verify: revert any single Symbol.for block in the source → the
 * corresponding spec fails because the state is local-only. Restore →
 * all pass.
 *
 * Real-app context: the 0.24.4 dev-404 SSR warning storm reported by a
 * consumer (bokisch.com) was the visible symptom of `_current` being
 * unshared. This test covers the entire shape so future shipments can't
 * regress any of the 5 state vars.
 */
import { describe, expect, it } from 'vitest'
// Force the modules to load (which initializes the Symbol.for state).
import { onMount, onUnmount, setCurrentHooks } from '../lifecycle'
import { pushErrorBoundary, popErrorBoundary, dispatchToErrorBoundary } from '../component'
import { createContext, pushContext, popContext, useContext } from '../context'
import { registerErrorHandler, reportError } from '../telemetry'
import { createUniqueId, _resetIdCounter } from '../props'

describe('@pyreon/core — module-level state hosted on globalThis via Symbol.for', () => {
  const g = globalThis as Record<symbol, unknown>

  it('lifecycle state is at Symbol.for("pyreon-core/lifecycle-state")', () => {
    const state = g[Symbol.for('pyreon-core/lifecycle-state')] as { current: unknown }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('current')

    // Setting via the lifecycle module's setter must mutate the SAME
    // shared object — proves any other module instance reaching the
    // same Symbol.for key sees the change.
    const hooks = { mount: null, unmount: null, update: null, error: null }
    setCurrentHooks(hooks)
    expect(state.current).toBe(hooks)
    setCurrentHooks(null)
    expect(state.current).toBeNull()
  })

  it('lifecycle: onMount/onUnmount mutate the shared state.current', () => {
    const state = g[Symbol.for('pyreon-core/lifecycle-state')] as {
      current: { mount: unknown[] | null; unmount: unknown[] | null } | null
    }
    const hooks = { mount: null, unmount: null, update: null, error: null }
    setCurrentHooks(hooks)
    const mountCb = () => undefined
    const unmountCb = () => undefined
    onMount(mountCb)
    onUnmount(unmountCb)
    expect(state.current).toBe(hooks)
    expect((state.current as { mount: unknown[] }).mount).toEqual([mountCb])
    expect((state.current as { unmount: unknown[] }).unmount).toEqual([unmountCb])
    setCurrentHooks(null)
  })

  it('error-boundary state is at Symbol.for("pyreon-core/error-boundary-state")', () => {
    const state = g[Symbol.for('pyreon-core/error-boundary-state')] as {
      stack: ((err: unknown) => boolean)[]
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('stack')
    expect(Array.isArray(state.stack)).toBe(true)

    const handler = (_err: unknown): boolean => true
    const before = state.stack.length
    pushErrorBoundary(handler)
    expect(state.stack.length).toBe(before + 1)
    expect(state.stack[state.stack.length - 1]).toBe(handler)
    expect(dispatchToErrorBoundary(new Error('x'))).toBe(true)
    popErrorBoundary(handler)
    expect(state.stack.length).toBe(before)
  })

  it('context stack state is at Symbol.for("pyreon-core/context-stack-state")', () => {
    const state = g[Symbol.for('pyreon-core/context-stack-state')] as {
      defaultStack: Map<symbol, unknown>[]
      provider: () => Map<symbol, unknown>[]
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('defaultStack')
    expect(state).toHaveProperty('provider')
    expect(Array.isArray(state.defaultStack)).toBe(true)
    expect(typeof state.provider).toBe('function')

    const ctx = createContext<string>('default')
    const frame = new Map<symbol, unknown>([[ctx.id, 'cross-module-value']])
    const before = state.defaultStack.length
    pushContext(frame)
    try {
      expect(state.defaultStack.length).toBe(before + 1)
      expect(state.defaultStack[state.defaultStack.length - 1]).toBe(frame)
      expect(useContext(ctx)).toBe('cross-module-value')
    } finally {
      popContext()
    }
    expect(state.defaultStack.length).toBe(before)
  })

  it('error-handlers state is at Symbol.for("pyreon-core/error-handlers-state")', () => {
    const state = g[Symbol.for('pyreon-core/error-handlers-state')] as {
      handlers: ((ctx: unknown) => void)[]
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('handlers')
    expect(Array.isArray(state.handlers)).toBe(true)

    let captured: unknown = null
    const unregister = registerErrorHandler((errCtx) => {
      captured = errCtx
    })
    try {
      reportError({
        component: 'TestComp',
        phase: 'render' as const,
        error: new Error('shared-state'),
        timestamp: Date.now(),
      })
      expect(captured).toBeTruthy()
      expect((captured as { error: Error }).error.message).toBe('shared-state')
    } finally {
      unregister()
    }
  })

  it('id-counter state is at Symbol.for("pyreon-core/id-counter-state")', () => {
    const state = g[Symbol.for('pyreon-core/id-counter-state')] as { counter: number }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('counter')
    expect(typeof state.counter).toBe('number')

    _resetIdCounter()
    expect(state.counter).toBe(0)
    const id1 = createUniqueId()
    const id2 = createUniqueId()
    expect(state.counter).toBe(2)
    expect(id1).toBe('pyreon-1')
    expect(id2).toBe('pyreon-2')
    // The counter is monotonically incremented through the shared state
    // — any second module instance reading via the same Symbol.for key
    // sees the same number.
    expect(id1).not.toBe(id2)
  })

  it('SCOPE INVARIANT: a fake "second instance" obtains the SAME state by Symbol.for lookup', () => {
    // Simulate a second @pyreon/core module instance that runs the SAME
    // bootstrap code. The Symbol.for-keyed lookup MUST find the existing
    // shared state (not create a new one).
    const KEY = Symbol.for('pyreon-core/lifecycle-state')
    const existing = g[KEY]
    expect(existing).toBeDefined()

    // What every other @pyreon/core module instance does on load:
    //   const state = g[KEY] ?? { current: null }
    //   if (!g[KEY]) g[KEY] = state
    // The `??` finds the existing instance → no new state object created.
    const fakeSecondInstanceState = g[KEY] ?? { current: null }
    expect(fakeSecondInstanceState).toBe(existing) // SAME object — not a new one
  })
})
