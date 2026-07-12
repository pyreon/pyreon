/**
 * Store setup-scope ownership — regression locks.
 *
 * Bug class: `defineSetupStore` ran `setup()` under whatever `EffectScope`
 * was ambient. Two silent failures followed:
 *
 *  1. **Component-scope adoption (severe, silent).** A store FIRST created
 *     inside a component body (the dominant lazy-creation shape — `useStore()`
 *     during component setup, where `mount.ts` has `setCurrentScope(scope)`
 *     active) registered its setup-created `computed()`s/`effect()`s with THAT
 *     component's scope. When the component unmounted, `scope.stop()` disposed
 *     the SINGLETON store's computeds — every other consumer then read a
 *     stale, frozen `computed` forever (a disposed computed never re-dirties).
 *
 *  2. **dispose() leak (Class B/E).** The inverse: `api.dispose()` never
 *     disposed setup-created computeds/effects, so an effect reading an
 *     EXTERNAL signal (another store's field, a module-level signal) kept
 *     firing — and kept the disposed store's object graph retained — forever.
 *
 * Fix: `setup()` runs inside a store-OWNED `effectScope()` (shielding it from
 * the ambient component scope), and `dispose()` stops that scope. Matches
 * Pinia (setup stores run in an effectScope; `$dispose` stops it).
 */
import { afterEach, describe, expect, test } from 'vitest'
import { computed, effect, effectScope, signal } from '@pyreon/reactivity'
import { defineStore, resetAllStores } from '../index'

afterEach(() => {
  resetAllStores()
})

describe('setup-scope ownership', () => {
  test('store computeds survive the stop() of the ambient scope active at first creation (component-unmount shape)', () => {
    const useStore = defineStore('scope-adoption-computed', () => {
      const count = signal(1)
      const double = computed(() => count() * 2)
      return { count, double, inc: () => count.set(count() + 1) }
    })

    // Simulate a component mount: a component scope is the CURRENT scope
    // while the store is first created (exactly what runtime-dom's mount.ts
    // does around component setup).
    const componentScope = effectScope()
    const api = componentScope.runInScope(() => useStore())
    expect(api.store.double()).toBe(2)

    // Component unmounts. The SINGLETON store must not lose its computeds.
    componentScope.stop()

    api.store.inc()
    expect(api.store.count()).toBe(2)
    // Pre-fix: stays 2 forever — the computed was adopted by the component
    // scope and disposed with it (disposed computeds never re-dirty).
    expect(api.store.double()).toBe(4)
  })

  test('store effects survive the stop() of the ambient scope active at first creation', () => {
    let runs = 0
    const useStore = defineStore('scope-adoption-effect', () => {
      const count = signal(0)
      effect(() => {
        count()
        runs++
      })
      return { count }
    })

    const componentScope = effectScope()
    const api = componentScope.runInScope(() => useStore())
    expect(runs).toBe(1)

    componentScope.stop()
    api.store.count.set(1)
    expect(runs).toBe(2) // pre-fix: stays 1 — effect disposed with the component scope
  })

  test('dispose() disposes setup-created effects (no external-signal retention / zombie firing)', () => {
    const external = signal(0)
    let runs = 0
    const useStore = defineStore('dispose-setup-effect', () => {
      const local = signal('x')
      effect(() => {
        external()
        runs++
      })
      return { local }
    })

    const api = useStore()
    expect(runs).toBe(1)

    api.dispose()
    external.set(1)
    // Pre-fix: the effect keeps firing after dispose — it (and the whole
    // store closure graph it captures) is retained by the external signal's
    // subscriber list for the signal's lifetime.
    expect(runs).toBe(1)
  })

  test('dispose() disposes setup-created computeds (unsubscribed from external signals)', () => {
    const external = signal(2)
    const useStore = defineStore('dispose-setup-computed', () => {
      const mirror = computed(() => external() * 10)
      return { mirror }
    })

    const api = useStore()
    expect(api.store.mirror()).toBe(20)

    api.dispose()
    // The disposed computed must no longer be subscribed to `external` —
    // verify via the signal's debug subscriber count reaching zero.
    external.set(3)
    expect(external.debug().subscriberCount).toBe(0)
  })

  test('schema-mode setup computeds also live in the store scope', () => {
    const componentScope = effectScope()
    const useStore = defineStore('scope-schema', {
      schema: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (v: unknown) => ({ value: v as { count: number } }),
        },
        // phantom types member omitted — InferSchema falls back to validate's return
      },
      initial: { count: 1 },
      setup: ({ state }) => ({
        double: computed(() => (state.count() as number) * 2),
      }),
    })

    const api = componentScope.runInScope(() => useStore())
    expect((api.store.double as () => number)()).toBe(2)

    componentScope.stop()
    api.store.count.set(5)
    expect((api.store.double as () => number)()).toBe(10)
  })
})

describe('plugin teardown on dispose', () => {
  test('a cleanup function returned by a plugin runs on store.dispose()', async () => {
    // addStorePlugin is module-global — import fresh module state per test
    // is overkill; register a plugin scoped by store id instead.
    const { addStorePlugin } = await import('../index')
    let tornDown = 0
    addStorePlugin((api) => {
      if (api.id !== 'plugin-teardown') return
      return () => {
        tornDown++
      }
    })

    const useStore = defineStore('plugin-teardown', () => ({ v: signal(0) }))
    const api = useStore()
    expect(tornDown).toBe(0)
    api.dispose()
    expect(tornDown).toBe(1)
    // dispose is idempotent for plugin cleanups
    api.dispose()
    expect(tornDown).toBe(1)
  })

  test('plugin effects are owned by the store scope (die on dispose)', async () => {
    const { addStorePlugin } = await import('../index')
    const external = signal(0)
    let runs = 0
    addStorePlugin((api) => {
      if (api.id !== 'plugin-effect-scope') return
      effect(() => {
        external()
        runs++
      })
    })

    const useStore = defineStore('plugin-effect-scope', () => ({ v: signal(0) }))
    const api = useStore()
    expect(runs).toBe(1)
    api.dispose()
    external.set(1)
    expect(runs).toBe(1) // plugin effect disposed with the store scope
  })
})
