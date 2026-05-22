/**
 * Regression: `@pyreon/reactivity`'s module-level state must survive being
 * loaded TWICE. Same contract as `@pyreon/core`'s
 * `cross-module-state.test.ts` — assert directly on the `Symbol.for` keys
 * that vitest's module resolver can't otherwise prove.
 *
 * The reactivity layer is FAR more dangerous to duplicate than core:
 * `activeEffect` / `batchDepth` / `effectDeps` / `_currentScope` are hit
 * on every signal write and effect creation. A duplicate instance would
 * silently break subscriber tracking — instance A's `effect` running while
 * instance B's `signal.set()` notifies its subscribers means the subscription
 * never registered (instance A set its own `activeEffect`, instance B reads
 * its own → null → no track), so reactivity collapses globally.
 *
 * Bisect-verify: revert any single `defineCrossModuleState` block to a bare
 * `let _state = …` → the corresponding spec fails because the state is
 * local-only. Restore → all pass.
 */
import { describe, expect, it } from 'vitest'
import { batch } from '../batch'
import { effect } from '../effect'
import { effectScope, getCurrentScope } from '../scope'
import { signal } from '../signal'
// Force the modules to load (which initializes the Symbol.for state).
import '../tracking'
import '../debug'
import '../reactive-trace'
import '../reactive-devtools'
import '../lpih'

describe('@pyreon/reactivity — module-level state hosted on globalThis via Symbol.for', () => {
  const g = globalThis as Record<symbol, unknown>

  it('tracking state is at Symbol.for("pyreon-reactivity/tracking-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/tracking-state')] as {
      activeEffect: unknown
      effectDeps: WeakMap<() => void, Set<Set<() => void>>>
      depsCollector: unknown
      skipDepsCollection: boolean
      prevEffect: unknown
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('activeEffect')
    expect(state).toHaveProperty('effectDeps')
    expect(state).toHaveProperty('depsCollector')
    expect(state).toHaveProperty('skipDepsCollection')
    expect(state).toHaveProperty('prevEffect')
    expect(state.effectDeps).toBeInstanceOf(WeakMap)
  })

  it('batch state is at Symbol.for("pyreon-reactivity/batch-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/batch-state')] as {
      batchDepth: number
      pendingRecomputes: Set<unknown>
      pendingEffects: Set<unknown>
      nextEffectPass: Set<unknown>
      visitedThisPass: unknown
      recomputes: WeakSet<() => void>
    }
    expect(state).toBeDefined()
    expect(typeof state.batchDepth).toBe('number')
    expect(state.pendingRecomputes).toBeInstanceOf(Set)
    expect(state.pendingEffects).toBeInstanceOf(Set)
    expect(state.nextEffectPass).toBeInstanceOf(Set)
    expect(state.recomputes).toBeInstanceOf(WeakSet)

    expect(state.batchDepth).toBe(0)
    batch(() => {
      expect(state.batchDepth).toBe(1)
    })
    expect(state.batchDepth).toBe(0)
  })

  it('scope state is at Symbol.for("pyreon-reactivity/scope-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/scope-state')] as {
      currentScope: ReturnType<typeof effectScope> | null
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('currentScope')

    const scope = effectScope()
    expect(state.currentScope).toBeNull()
    scope.runInScope(() => {
      expect(state.currentScope).toBe(scope)
      expect(getCurrentScope()).toBe(scope)
    })
    expect(state.currentScope).toBeNull()
    scope.stop()
  })

  it('effect state is at Symbol.for("pyreon-reactivity/effect-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/effect-state')] as {
      snapshotCapture: unknown
      cleanupCollector: unknown
      innerEffectCollector: unknown
      userErrorHandler: unknown
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('snapshotCapture')
    expect(state).toHaveProperty('cleanupCollector')
    expect(state).toHaveProperty('innerEffectCollector')
    expect(state).toHaveProperty('userErrorHandler')
  })

  it('reactive-trace state is at Symbol.for("pyreon-reactivity/reactive-trace-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/reactive-trace-state')] as {
      buf: unknown
      count: number
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('buf')
    expect(typeof state.count).toBe('number')
  })

  it('reactive-devtools state is at Symbol.for("pyreon-reactivity/reactive-devtools-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/reactive-devtools-state')] as {
      active: boolean
      nextId: number
      byId: Map<number, unknown>
      subId: WeakMap<object, number>
      finalizer: FinalizationRegistry<number>
      fireBuf: unknown
      fireCount: number
    }
    expect(state).toBeDefined()
    expect(typeof state.active).toBe('boolean')
    expect(typeof state.nextId).toBe('number')
    expect(state.byId).toBeInstanceOf(Map)
    expect(state.subId).toBeInstanceOf(WeakMap)
    expect(state.finalizer).toBeInstanceOf(FinalizationRegistry)
  })

  it('debug state is at Symbol.for("pyreon-reactivity/debug-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/debug-state')] as {
      traceListeners: unknown
      whyActive: boolean
      whyLog: unknown[]
    }
    expect(state).toBeDefined()
    expect(state).toHaveProperty('traceListeners')
    expect(typeof state.whyActive).toBe('boolean')
    expect(Array.isArray(state.whyLog)).toBe(true)
  })

  it('lpih state is at Symbol.for("pyreon-reactivity/lpih-state")', () => {
    const state = g[Symbol.for('pyreon-reactivity/lpih-state')] as { seq: number }
    expect(state).toBeDefined()
    expect(typeof state.seq).toBe('number')
  })

  it('SCOPE INVARIANT: a fake "second instance" obtains the SAME state by Symbol.for lookup', () => {
    const KEY = Symbol.for('pyreon-reactivity/tracking-state')
    const existing = g[KEY]
    expect(existing).toBeDefined()
    const fakeSecondInstanceState = g[KEY]
    expect(fakeSecondInstanceState).toBe(existing)
  })

  it('end-to-end: signal/effect tracking traverses through the shared state', () => {
    // The most important contract: a signal write must trigger the effect
    // that subscribed to it — and this is what cross-instance shared state
    // is FOR. Driving the public API through and asserting the runs proves
    // the refactor preserved reactivity end-to-end.
    const count = signal(0)
    const runs: number[] = []
    const e = effect(() => {
      runs.push(count())
    })
    expect(runs).toEqual([0])
    count.set(1)
    count.set(2)
    expect(runs).toEqual([0, 1, 2])
    e.dispose()
    count.set(3)
    expect(runs).toEqual([0, 1, 2]) // no run after dispose
  })
})
