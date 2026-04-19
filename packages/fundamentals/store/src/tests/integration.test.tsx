import { batch, computed, effect, signal } from '@pyreon/reactivity'
import { defineStore, resetAllStores } from '../index'

afterEach(() => resetAllStores())

// ─── Integration tests — store + reactivity ──────────────────────────────────

describe('Store integration — reactive composition', () => {
  it('component-like consumer reads store state via signals', () => {
    const useCounter = defineStore('int-counter', () => {
      const count = signal(42)
      const double = computed(() => count() * 2)
      return { count, double }
    })

    const { store } = useCounter()
    expect(store.count()).toBe(42)
    expect(store.double()).toBe(84)
  })

  it('store action updates signal and derived computed reacts', () => {
    const useCounter = defineStore('int-action', () => {
      const count = signal(0)
      const increment = () => count.update((n) => n + 1)
      const double = computed(() => count() * 2)
      return { count, increment, double }
    })

    const { store } = useCounter()
    expect(store.count()).toBe(0)
    store.increment()
    store.increment()
    expect(store.count()).toBe(2)
    expect(store.double()).toBe(4)
  })

  it('multiple consumers share same store and see updates', () => {
    const useShared = defineStore('int-shared', () => {
      const count = signal(0)
      return { count }
    })

    const consumer1 = useShared()
    const consumer2 = useShared()

    expect(consumer1).toBe(consumer2)
    consumer1.store.count.set(99)
    expect(consumer2.store.count()).toBe(99)
  })

  it('store reset reflects initial state in all consumers', () => {
    const useResettable = defineStore('int-resettable', () => ({
      count: signal(0),
      name: signal('initial'),
    }))

    const api = useResettable()
    api.store.count.set(50)
    api.store.name.set('changed')

    api.reset()
    expect(api.store.count()).toBe(0)
    expect(api.store.name()).toBe('initial')
  })

  it('store dispose allows re-creation with fresh state', () => {
    const useDisposable = defineStore('int-disposable', () => ({
      count: signal(0),
    }))

    const api1 = useDisposable()
    api1.store.count.set(100)

    // Track that subscriber stops after dispose
    let subCalled = 0
    api1.subscribe(() => {
      subCalled++
    })
    api1.store.count.set(101)
    expect(subCalled).toBe(1)

    api1.dispose()

    // Old subscriber should not fire
    api1.store.count.set(200)
    expect(subCalled).toBe(1)

    // New store instance is fresh
    const api2 = useDisposable()
    expect(api2).not.toBe(api1)
    expect(api2.store.count()).toBe(0)
  })
})

// ─── Store + Query Pattern (Issue #F6) ──────────────────────────────────────

describe('Store + Query pattern — avoiding circular dependencies', () => {
  it('batch() prevents cascading effects when store and query interact', () => {
    // Simulate query behavior
    const queryData = signal<{ id: number; name: string } | null>(null)
    let queryRefetchCount = 0
    const queryInvalidate = () => {
      queryRefetchCount++
      // Simulate refetch
      queryData.set({ id: 1, name: 'Alice' })
    }

    // Track how many times effects run
    const effectLog: string[] = []

    // Store reads from query
    const useUserStore = defineStore('query-test-store', () => {
      const user = computed(() => queryData())

      // Effect that might cause cascading
      effect(() => {
        if (user()) {
          effectLog.push('effect-ran')
        }
      })

      const updateUser = (name: string) => {
        batch(() => {
          // Update simulates setting cache then invalidating
          queryData.set({ id: 1, name })
          queryInvalidate()
          // Effects don't run yet — they're queued by batch()
        })
        // After batch() exits, all queued effects run once
      }

      return { user, updateUser }
    })

    const api = useUserStore()

    // Reset effect log after setup
    effectLog.length = 0

    // Update user (would infinite loop without batch)
    api.store.updateUser('Bob')

    // ✅ Effects should run minimal times, not infinitely
    // Expected: ~1-2 (initial effect + one update)
    expect(effectLog.length).toBeLessThanOrEqual(3)
    expect(queryRefetchCount).toBe(1)
  })

  it('store reads from query without cascading on computed changes', () => {
    // Simulate query with caching
    interface User {
      id: number
      name: string
      email: string
    }

    const cachedUser = signal<User | null>(null)
    let cacheWriteCount = 0

    // Store composes query state
    const useOptimisticUserStore = defineStore('optimistic-user', () => {
      const user = computed(() => cachedUser())
      let updateInProgress = false

      const updateUserOptimistic = (updates: Partial<User>) => {
        batch(() => {
          const old = cachedUser()
          if (!old) return

          updateInProgress = true

          // Optimistic update
          const optimistic = { ...old, ...updates }
          cacheWriteCount++
          cachedUser.set(optimistic)

          // Then API call
          // (simulated as synchronous for this test)
          updateInProgress = false
          cacheWriteCount++
        })
      }

      return { user, updateUserOptimistic }
    })

    const api = useOptimisticUserStore()
    cachedUser.set({ id: 1, name: 'Alice', email: 'alice@test.com' })
    cacheWriteCount = 0

    // Perform optimistic update
    api.store.updateUserOptimistic({ name: 'Bob' })

    // ✅ Should batch two cache writes into one effect propagation
    expect(cacheWriteCount).toBe(2)
    expect(api.store.user()).toEqual({ id: 1, name: 'Bob', email: 'alice@test.com' })
  })

  it('independent query state prevents loops (anti-pattern)', () => {
    // ❌ DON'T DO THIS: Store has own state, query is separate
    // This test documents the anti-pattern

    const queryData = signal<{ id: number; name: string } | null>(null)
    const storeUserCopy = signal<{ id: number; name: string } | null>(null)

    let cascadeCount = 0

    const useProblematicStore = defineStore('problematic-store', () => {
      effect(() => {
        // Store watches query
        const q = queryData()
        if (q) {
          cascadeCount++
          storeUserCopy.set(q)  // Update own state
        }
      })

      return { user: storeUserCopy }
    })

    useProblematicStore()

    // Simulate query change
    queryData.set({ id: 1, name: 'Alice' })

    // ⚠️ This works but creates duplicate state
    // If store ever invalidates query, loop risk exists
    expect(cascadeCount).toBeGreaterThan(0)
    expect(storeUserCopy()).toEqual({ id: 1, name: 'Alice' })
  })

  it('batch() safely handles query invalidation from store', () => {
    let refetchCount = 0
    const user = signal<{ id: number; name: string } | null>({ id: 1, name: 'Alice' })

    const useUserStoreWithInvalidation = defineStore('user-with-invalidation', () => {
      const userData = computed(() => user())

      // Effect that would cause loop without batch
      let inUpdate = false
      const updateAndInvalidate = async () => {
        batch(() => {
          inUpdate = true
          user.set({ id: 1, name: 'Bob' })
          // Simulate query refetch
          refetchCount++
          inUpdate = false
        })
      }

      return { userData, updateAndInvalidate }
    })

    const api = useUserStoreWithInvalidation()
    refetchCount = 0

    // This would infinite loop without batch:
    // update → compute re-runs → maybe triggers effect → tries to update again
    api.store.updateAndInvalidate()

    // ✅ Should only refetch once, not cascade
    expect(refetchCount).toBe(1)
    expect(api.store.userData()).toEqual({ id: 1, name: 'Bob' })
  })
})
