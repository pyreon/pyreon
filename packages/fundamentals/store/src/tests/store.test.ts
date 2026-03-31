import {
  addStorePlugin,
  computed,
  defineStore,
  type MutationInfo,
  resetAllStores,
  resetStore,
  setStoreRegistryProvider,
  signal,
} from '../index'

afterEach(() => resetAllStores())

describe('defineStore', () => {
  test('returns singleton — setup runs once', () => {
    let runs = 0
    const useStore = defineStore('counter', () => {
      runs++
      const count = signal(0)
      return { count }
    })

    useStore()
    useStore()
    expect(runs).toBe(1)
  })

  test('state is shared across calls', () => {
    const useStore = defineStore('shared', () => {
      const count = signal(0)
      return { count }
    })

    const a = useStore()
    const b = useStore()
    a.store.count.set(42)
    expect(b.store.count()).toBe(42)
  })

  test('supports computed values', () => {
    const useStore = defineStore('computed-store', () => {
      const count = signal(3)
      const double = computed(() => count() * 2)
      return { count, double }
    })

    const { store } = useStore()
    expect(store.double()).toBe(6)
    store.count.set(5)
    expect(store.double()).toBe(10)
  })

  test('supports actions (plain functions)', () => {
    const useStore = defineStore('actions-store', () => {
      const count = signal(0)
      const increment = () => count.update((n) => n + 1)
      return { count, increment }
    })

    const { store } = useStore()
    store.increment()
    store.increment()
    expect(store.count()).toBe(2)
  })

  test('different ids create independent stores', () => {
    const useA = defineStore('a', () => ({ val: signal(1) }))
    const useB = defineStore('b', () => ({ val: signal(2) }))

    expect(useA().store.val()).toBe(1)
    expect(useB().store.val()).toBe(2)
    useA().store.val.set(99)
    expect(useB().store.val()).toBe(2)
  })

  test('same id from different defineStore calls shares state', () => {
    const useA = defineStore('dup', () => ({ val: signal('first') }))
    const useB = defineStore('dup', () => ({ val: signal('second') }))

    const a = useA()
    const b = useB()
    expect(a).toBe(b)
    expect(a.store.val()).toBe('first')
  })
})

describe('resetStore', () => {
  test('re-runs setup after reset', () => {
    let runs = 0
    const useStore = defineStore('resettable', () => {
      runs++
      return { val: signal(runs) }
    })

    useStore()
    resetStore('resettable')
    useStore()
    expect(runs).toBe(2)
  })

  test('fresh state after reset', () => {
    const useStore = defineStore('fresh', () => ({ count: signal(0) }))

    useStore().store.count.set(99)
    resetStore('fresh')
    expect(useStore().store.count()).toBe(0)
  })

  test('resetting non-existent id is a no-op', () => {
    expect(() => resetStore('does-not-exist')).not.toThrow()
  })
})

describe('resetAllStores', () => {
  test('clears all registrations', () => {
    let runsA = 0
    let runsB = 0
    const useA = defineStore('all-a', () => {
      runsA++
      return {}
    })
    const useB = defineStore('all-b', () => {
      runsB++
      return {}
    })

    useA()
    useB()
    resetAllStores()
    useA()
    useB()
    expect(runsA).toBe(2)
    expect(runsB).toBe(2)
  })
})

describe('setStoreRegistryProvider', () => {
  afterEach(() => {
    // Restore default registry
    setStoreRegistryProvider(() => new Map())
  })

  test('custom provider isolates registries', () => {
    const registryA = new Map<string, unknown>()
    const registryB = new Map<string, unknown>()

    const useStore = defineStore('isolated', () => ({ val: signal(0) }))

    setStoreRegistryProvider(() => registryA)
    useStore().store.val.set(10)

    setStoreRegistryProvider(() => registryB)
    expect(useStore().store.val()).toBe(0)

    setStoreRegistryProvider(() => registryA)
    expect(useStore().store.val()).toBe(10)
  })

  test('resetAllStores clears current provider registry', () => {
    const custom = new Map<string, unknown>()
    setStoreRegistryProvider(() => custom)

    const useStore = defineStore('custom-reset', () => ({ val: signal(1) }))
    useStore()
    expect(custom.size).toBe(1)

    resetAllStores()
    expect(custom.size).toBe(0)
  })
})

// ─── StoreApi Tests ─────────────────────────────────────────────────────────

describe('id', () => {
  test('exposes the store id', () => {
    const useStore = defineStore('my-store', () => ({
      count: signal(0),
    }))
    const api = useStore()
    expect(api.id).toBe('my-store')
  })
})

describe('state', () => {
  test('returns a plain snapshot of all signal values', () => {
    const useStore = defineStore('state-test', () => ({
      count: signal(10),
      name: signal('Alice'),
      double: computed(() => 20),
      greet: () => 'hello',
    }))
    const api = useStore()
    expect(api.state).toEqual({ count: 10, name: 'Alice' })
  })

  test('reflects current values after mutation', () => {
    const useStore = defineStore('state-mut', () => ({
      count: signal(0),
    }))
    const api = useStore()
    api.store.count.set(42)
    expect(api.state).toEqual({ count: 42 })
  })
})

describe('patch', () => {
  test('object form: batch-updates multiple signals', () => {
    const useStore = defineStore('patch-obj', () => ({
      count: signal(0),
      name: signal('Bob'),
    }))
    const api = useStore()
    api.patch({ count: 5, name: 'Alice' })
    expect(api.store.count()).toBe(5)
    expect(api.store.name()).toBe('Alice')
  })

  test('function form: receives signals for manual updates', () => {
    const useStore = defineStore('patch-fn', () => ({
      count: signal(0),
      name: signal('Bob'),
    }))
    const api = useStore()
    api.patch((state) => {
      state.count.set(10)
      state.name.set('Charlie')
    })
    expect(api.store.count()).toBe(10)
    expect(api.store.name()).toBe('Charlie')
  })

  test("emits single subscribe notification with type 'patch'", () => {
    const useStore = defineStore('patch-notify', () => ({
      count: signal(0),
      name: signal('Bob'),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((mutation) => {
      mutations.push(mutation)
    })
    api.patch({ count: 5, name: 'Alice' })
    expect(mutations).toHaveLength(1)
    expect(mutations[0]!.type).toBe('patch')
    expect(mutations[0]!.events).toHaveLength(2)
  })

  test('ignores keys that are not signals', () => {
    const useStore = defineStore('patch-ignore', () => ({
      count: signal(0),
      greet: () => 'hello',
    }))
    const api = useStore()
    // Should not throw
    api.patch({ count: 5, greet: 'nope' as any, nonExistent: 99 })
    expect(api.store.count()).toBe(5)
  })
})

describe('subscribe', () => {
  test('fires on direct signal changes', () => {
    const useStore = defineStore('sub-direct', () => ({
      count: signal(0),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((mutation) => {
      mutations.push(mutation)
    })
    api.store.count.set(5)
    expect(mutations).toHaveLength(1)
    expect(mutations[0]!.type).toBe('direct')
    expect(mutations[0]!.storeId).toBe('sub-direct')
    expect(mutations[0]!.events).toEqual([{ key: 'count', oldValue: 0, newValue: 5 }])
  })

  test('provides current state snapshot', () => {
    const useStore = defineStore('sub-state', () => ({
      count: signal(0),
      name: signal('X'),
    }))
    const api = useStore()
    let capturedState: Record<string, unknown> | null = null
    api.subscribe((_mutation, state) => {
      capturedState = state
    })
    api.store.count.set(42)
    expect(capturedState).toEqual({ count: 42, name: 'X' })
  })

  test('immediate option calls callback right away', () => {
    const useStore = defineStore('sub-immediate', () => ({
      count: signal(7),
    }))
    const api = useStore()
    let called = false
    let capturedState: Record<string, unknown> | null = null
    api.subscribe(
      (_mutation, state) => {
        called = true
        capturedState = state
      },
      { immediate: true },
    )
    expect(called).toBe(true)
    expect(capturedState).toEqual({ count: 7 })
  })

  test('unsubscribe stops notifications', () => {
    const useStore = defineStore('sub-unsub', () => ({
      count: signal(0),
    }))
    const api = useStore()
    let callCount = 0
    const unsub = api.subscribe(() => {
      callCount++
    })
    api.store.count.set(1)
    expect(callCount).toBe(1)
    unsub()
    api.store.count.set(2)
    expect(callCount).toBe(1)
  })

  test('does not fire if signal is set to same value', () => {
    const useStore = defineStore('sub-same', () => ({
      count: signal(5),
    }))
    const api = useStore()
    let callCount = 0
    api.subscribe(() => {
      callCount++
    })
    api.store.count.set(5) // same value
    expect(callCount).toBe(0)
  })
})

describe('onAction', () => {
  test('intercepts action calls with name and args', () => {
    const useStore = defineStore('action-intercept', () => {
      const count = signal(0)
      const add = (n: number) => count.update((c) => c + n)
      return { count, add }
    })
    const api = useStore()
    const calls: { name: string; args: unknown[] }[] = []
    api.onAction(({ name, args }) => {
      calls.push({ name, args })
    })
    api.store.add(5)
    expect(calls).toEqual([{ name: 'add', args: [5] }])
  })

  test('after callback runs on success', () => {
    const useStore = defineStore('action-after', () => {
      const count = signal(0)
      const getCount = () => count()
      return { count, getCount }
    })
    const api = useStore()
    let result: unknown = null
    api.onAction(({ after }) => {
      after((r) => {
        result = r
      })
    })
    api.store.count.set(42)
    api.store.getCount()
    expect(result).toBe(42)
  })

  test('onError callback runs when action throws', () => {
    const useStore = defineStore('action-error', () => {
      const fail = () => {
        throw new Error('boom')
      }
      return { fail }
    })
    const api = useStore()
    let caughtError: unknown = null
    api.onAction(({ onError }) => {
      onError((err) => {
        caughtError = err
      })
    })
    expect(() => api.store.fail()).toThrow('boom')
    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toBe('boom')
  })

  test('storeId is provided in context', () => {
    const useStore = defineStore('action-store-id', () => ({
      noop: () => {
        /* noop */
      },
    }))
    const api = useStore()
    let capturedId: string | null = null
    api.onAction(({ storeId }) => {
      capturedId = storeId
    })
    api.store.noop()
    expect(capturedId).toBe('action-store-id')
  })

  test('unsubscribe stops interception', () => {
    const useStore = defineStore('action-unsub', () => ({
      noop: () => {
        /* noop */
      },
    }))
    const api = useStore()
    let callCount = 0
    const unsub = api.onAction(() => {
      callCount++
    })
    api.store.noop()
    expect(callCount).toBe(1)
    unsub()
    api.store.noop()
    expect(callCount).toBe(1)
  })

  test('after callback receives resolved value for async actions', async () => {
    const useStore = defineStore('action-async', () => {
      const fetchData = async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'resolved-data'
      }
      return { fetchData }
    })
    const api = useStore()
    let result: unknown = null
    api.onAction(({ after }) => {
      after((r) => {
        result = r
      })
    })
    await api.store.fetchData()
    expect(result).toBe('resolved-data')
  })

  test('onError callback fires for async action rejection', async () => {
    const useStore = defineStore('action-async-error', () => {
      const failAsync = async () => {
        await new Promise((r) => setTimeout(r, 5))
        throw new Error('async boom')
      }
      return { failAsync }
    })
    const api = useStore()
    let caughtError: unknown = null
    api.onAction(({ onError }) => {
      onError((err) => {
        caughtError = err
      })
    })
    await api.store.failAsync().catch(() => {
      /* expected */
    })
    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error).message).toBe('async boom')
  })
})

describe('reset', () => {
  test('resets all signals to initial values', () => {
    const useStore = defineStore('reset-test', () => ({
      count: signal(0),
      name: signal('initial'),
    }))
    const api = useStore()
    api.store.count.set(99)
    api.store.name.set('changed')
    api.reset()
    expect(api.store.count()).toBe(0)
    expect(api.store.name()).toBe('initial')
  })

  test('does not affect computed values (they recompute)', () => {
    const useStore = defineStore('reset-computed', () => {
      const count = signal(5)
      const double = computed(() => count() * 2)
      return { count, double }
    })
    const api = useStore()
    api.store.count.set(20)
    expect(api.store.double()).toBe(40)
    api.reset()
    expect(api.store.count()).toBe(5)
    expect(api.store.double()).toBe(10)
  })
})

describe('dispose', () => {
  test('removes store from registry', () => {
    const useStore = defineStore('dispose-test', () => ({
      count: signal(0),
    }))
    const api = useStore()
    api.dispose()
    // Next call should re-run setup
    const api2 = useStore()
    expect(api2).not.toBe(api)
    expect(api2.store.count()).toBe(0)
  })

  test('clears subscribers after dispose', () => {
    const useStore = defineStore('dispose-sub', () => ({
      count: signal(0),
    }))
    const api = useStore()
    let callCount = 0
    api.subscribe(() => {
      callCount++
    })
    api.store.count.set(1)
    expect(callCount).toBe(1)
    api.dispose()
    // Mutating the old signal should not trigger subscriber
    api.store.count.set(2)
    expect(callCount).toBe(1)
  })
})

// ─── Error handling & cleanup ─────────────────────────────────────────────

describe('dispose — signal cleanup', () => {
  test('disposed store does not trigger subscribe callbacks', () => {
    const useStore = defineStore('dispose-signals', () => ({
      count: signal(0),
    }))
    const api = useStore()
    let callCount = 0
    api.subscribe(() => {
      callCount++
    })
    api.store.count.set(1)
    expect(callCount).toBe(1)

    api.dispose()

    // After dispose, mutating the signal should not notify subscribers
    api.store.count.set(99)
    expect(callCount).toBe(1)
  })

  test('disposed store clears action listeners', () => {
    const useStore = defineStore('dispose-actions', () => ({
      count: signal(0),
      increment: () => {
        /* noop */
      },
    }))
    const api = useStore()
    let actionCount = 0
    api.onAction(() => {
      actionCount++
    })
    api.store.increment()
    expect(actionCount).toBe(1)

    api.dispose()

    // Re-create the store — old action listeners should not fire
    const api2 = useStore()
    api2.store.increment()
    // actionCount should not increase from old listener
    expect(actionCount).toBe(1)
  })
})

describe('subscribe/unsubscribe — no memory leak', () => {
  test('multiple subscribe and unsubscribe does not leak listeners', () => {
    const useStore = defineStore('sub-leak', () => ({
      count: signal(0),
    }))
    const api = useStore()

    // Subscribe and unsubscribe many times
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 100; i++) {
      unsubs.push(api.subscribe(() => {}))
    }

    // Unsubscribe all
    for (const unsub of unsubs) {
      unsub()
    }

    // Now a real subscriber should work cleanly
    let callCount = 0
    api.subscribe(() => {
      callCount++
    })
    api.store.count.set(42)
    expect(callCount).toBe(1)
  })

  test('unsubscribing same function twice is safe', () => {
    const useStore = defineStore('double-unsub', () => ({
      count: signal(0),
    }))
    const api = useStore()
    const unsub = api.subscribe(() => {})
    unsub()
    // Second unsubscribe should not throw
    expect(() => unsub()).not.toThrow()
  })
})

describe('action that throws', () => {
  test('store state is not corrupted after sync action throws', () => {
    const useStore = defineStore('action-throw', () => {
      const count = signal(0)
      const failingAction = () => {
        count.set(42)
        throw new Error('action failed')
      }
      return { count, failingAction }
    })
    const api = useStore()

    expect(() => api.store.failingAction()).toThrow('action failed')

    // The signal was set before the throw — state reflects the partial update
    expect(api.store.count()).toBe(42)

    // Store should still be usable
    api.store.count.set(10)
    expect(api.store.count()).toBe(10)
  })

  test('subscribe still works after action throws', () => {
    const useStore = defineStore('action-throw-sub', () => {
      const count = signal(0)
      const boom = () => {
        throw new Error('boom')
      }
      return { count, boom }
    })
    const api = useStore()

    const mutations: MutationInfo[] = []
    api.subscribe((m) => {
      mutations.push(m)
    })

    expect(() => api.store.boom()).toThrow('boom')

    // Subscribers should still fire on subsequent changes
    api.store.count.set(5)
    expect(mutations).toHaveLength(1)
    expect(mutations[0]!.events[0]!.newValue).toBe(5)
  })
})

describe('plugin that throws', () => {
  test('store still works when plugin throws during setup', () => {
    addStorePlugin(() => {
      throw new Error('plugin setup failed')
    })

    const useStore = defineStore('plugin-throw', () => ({
      count: signal(0),
    }))

    // Store should still be created despite plugin error
    const api = useStore()
    expect(api.store.count()).toBe(0)
    api.store.count.set(5)
    expect(api.store.count()).toBe(5)
  })

  test('other plugins still run when one throws', () => {
    let secondPluginRan = false

    addStorePlugin(() => {
      throw new Error('first plugin explodes')
    })
    addStorePlugin(() => {
      secondPluginRan = true
    })

    const useStore = defineStore('plugin-throw-multi', () => ({
      val: signal(0),
    }))
    useStore()

    expect(secondPluginRan).toBe(true)
  })
})

describe('addStorePlugin', () => {
  test('plugin receives StoreApi on creation', () => {
    let receivedId: string | null = null
    let receivedApi: any = null

    addStorePlugin((pluginApi) => {
      receivedId = pluginApi.id
      receivedApi = pluginApi
    })

    const useStore = defineStore('plugin-test', () => ({
      count: signal(0),
    }))
    const api = useStore()

    expect(receivedId).toBe('plugin-test')
    expect(receivedApi).toBe(api)
  })

  test('plugin can use subscribe', () => {
    const changes: MutationInfo[] = []

    addStorePlugin((pluginApi) => {
      pluginApi.subscribe((mutation: MutationInfo) => {
        changes.push(mutation)
      })
    })

    const useStore = defineStore('plugin-subscribe', () => ({
      count: signal(0),
    }))
    const api = useStore()
    api.store.count.set(5)

    expect(changes.length).toBeGreaterThanOrEqual(1)
    const relevant = changes.filter((m) => m.storeId === 'plugin-subscribe')
    expect(relevant).toHaveLength(1)
  })

  test('plugin can use onAction', () => {
    const actionNames: string[] = []

    addStorePlugin((pluginApi) => {
      pluginApi.onAction(({ name, storeId }: { name: string; storeId: string }) => {
        if (storeId === 'plugin-action') {
          actionNames.push(name)
        }
      })
    })

    const useStore = defineStore('plugin-action', () => ({
      count: signal(0),
      increment: () => {
        /* noop */
      },
    }))
    const api = useStore()
    api.store.increment()

    expect(actionNames).toContain('increment')
  })
})
