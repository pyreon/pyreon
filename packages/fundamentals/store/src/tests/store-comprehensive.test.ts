import {
  addStorePlugin,
  computed,
  defineStore,
  type MutationInfo,
  resetAllStores,
  setStoreRegistryProvider,
  signal,
} from "../index"

afterEach(() => resetAllStores())

// ─── defineStore singleton by ID ────────────────────────────────────────────

describe("defineStore — singleton by ID", () => {
  test("returns identical StoreApi reference on repeated calls", () => {
    const useStore = defineStore("singleton-ref", () => ({
      count: signal(0),
    }))
    const a = useStore()
    const b = useStore()
    expect(a).toBe(b)
  })

  test("setup function is never called more than once for same id", () => {
    let setupCount = 0
    const useStore = defineStore("singleton-setup", () => {
      setupCount++
      return { val: signal(setupCount) }
    })
    useStore()
    useStore()
    useStore()
    expect(setupCount).toBe(1)
    expect(useStore().store.val()).toBe(1)
  })

  test("different defineStore calls with same ID return same instance (first-wins)", () => {
    const use1 = defineStore("shared-id", () => ({ a: signal(1) }))
    const use2 = defineStore("shared-id", () => ({ a: signal(999) }))
    const inst1 = use1()
    const inst2 = use2()
    expect(inst1).toBe(inst2)
    expect(inst1.store.a()).toBe(1) // first setup wins
  })
})

// ─── patch — partial update ────────────────────────────────────────────────

describe("patch — partial update", () => {
  test("object form updates only specified keys", () => {
    const useStore = defineStore("patch-partial", () => ({
      a: signal(1),
      b: signal(2),
      c: signal(3),
    }))
    const api = useStore()
    api.patch({ b: 20 })
    expect(api.store.a()).toBe(1)
    expect(api.store.b()).toBe(20)
    expect(api.store.c()).toBe(3)
  })

  test("patch with empty object is a no-op", () => {
    const useStore = defineStore("patch-empty", () => ({
      val: signal(42),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((m) => mutations.push(m))
    api.patch({})
    expect(api.store.val()).toBe(42)
    expect(mutations).toHaveLength(0)
  })

  test("patch skips prototype pollution keys", () => {
    const useStore = defineStore("patch-proto", () => ({
      count: signal(0),
    }))
    const api = useStore()
    api.patch({ __proto__: null, constructor: null, prototype: null, count: 5 } as any)
    expect(api.store.count()).toBe(5)
  })

  test("function form receives signals for manual updates", () => {
    const useStore = defineStore("patch-fn-2", () => ({
      x: signal(0),
      y: signal(0),
    }))
    const api = useStore()
    api.patch((state) => {
      state.x.set(10)
      state.y.update((n: number) => n + 5)
    })
    expect(api.store.x()).toBe(10)
    expect(api.store.y()).toBe(5)
  })
})

// ─── subscribe — mutation tracking with event details ──────────────────────

describe("subscribe — mutation tracking details", () => {
  test("direct mutation includes correct key, oldValue, newValue", () => {
    const useStore = defineStore("sub-details", () => ({
      name: signal("Alice"),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((m) => mutations.push(m))

    api.store.name.set("Bob")

    expect(mutations).toHaveLength(1)
    expect(mutations[0]!.type).toBe("direct")
    expect(mutations[0]!.storeId).toBe("sub-details")
    expect(mutations[0]!.events).toEqual([{ key: "name", oldValue: "Alice", newValue: "Bob" }])
  })

  test("multiple direct mutations produce separate notifications", () => {
    const useStore = defineStore("sub-multi", () => ({
      count: signal(0),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((m) => mutations.push(m))

    api.store.count.set(1)
    api.store.count.set(2)
    api.store.count.set(3)

    expect(mutations).toHaveLength(3)
    expect(mutations[0]!.events[0]!.oldValue).toBe(0)
    expect(mutations[0]!.events[0]!.newValue).toBe(1)
    expect(mutations[2]!.events[0]!.oldValue).toBe(2)
    expect(mutations[2]!.events[0]!.newValue).toBe(3)
  })

  test("patch mutation coalesces multiple signal changes into one notification", () => {
    const useStore = defineStore("sub-patch-coalesce", () => ({
      a: signal(0),
      b: signal("x"),
    }))
    const api = useStore()
    const mutations: MutationInfo[] = []
    api.subscribe((m) => mutations.push(m))

    api.patch({ a: 10, b: "y" })

    expect(mutations).toHaveLength(1)
    expect(mutations[0]!.type).toBe("patch")
    expect(mutations[0]!.events).toHaveLength(2)
    expect(mutations[0]!.events).toEqual(
      expect.arrayContaining([
        { key: "a", oldValue: 0, newValue: 10 },
        { key: "b", oldValue: "x", newValue: "y" },
      ]),
    )
  })

  test("subscribe with immediate provides initial state snapshot", () => {
    const useStore = defineStore("sub-immed-snap", () => ({
      x: signal(10),
      y: signal(20),
    }))
    const api = useStore()
    let capturedState: Record<string, unknown> | undefined
    api.subscribe(
      (_m, state) => {
        capturedState = state
      },
      { immediate: true },
    )
    expect(capturedState).toEqual({ x: 10, y: 20 })
  })

  test("multiple subscribers all receive the same mutation", () => {
    const useStore = defineStore("sub-multi-listeners", () => ({
      val: signal(0),
    }))
    const api = useStore()
    const log1: MutationInfo[] = []
    const log2: MutationInfo[] = []
    api.subscribe((m) => log1.push(m))
    api.subscribe((m) => log2.push(m))

    api.store.val.set(5)

    expect(log1).toHaveLength(1)
    expect(log2).toHaveLength(1)
    expect(log1[0]!.events[0]!.newValue).toBe(5)
    expect(log2[0]!.events[0]!.newValue).toBe(5)
  })
})

// ─── onAction — interception ───────────────────────────────────────────────

describe("onAction — interception details", () => {
  test("receives action name, storeId, and args", () => {
    const useStore = defineStore("action-detail", () => {
      const val = signal(0)
      const add = (n: number, label: string) => val.set(n)
      return { val, add }
    })
    const api = useStore()
    const captured: { name: string; storeId: string; args: unknown[] }[] = []
    api.onAction(({ name, storeId, args }) => {
      captured.push({ name, storeId, args })
    })
    api.store.add(42, "test")
    expect(captured).toEqual([{ name: "add", storeId: "action-detail", args: [42, "test"] }])
  })

  test("multiple onAction listeners all fire", () => {
    const useStore = defineStore("action-multi", () => ({
      noop: () => {},
    }))
    const api = useStore()
    let count1 = 0
    let count2 = 0
    api.onAction(() => count1++)
    api.onAction(() => count2++)

    api.store.noop()
    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })

  test("after callback receives return value of sync action", () => {
    const useStore = defineStore("action-after-sync", () => ({
      getVal: () => 42,
    }))
    const api = useStore()
    let result: unknown
    api.onAction(({ after }) => {
      after((r) => {
        result = r
      })
    })
    api.store.getVal()
    expect(result).toBe(42)
  })
})

// ─── reset — restores initial values ───────────────────────────────────────

describe("reset — restores initial values", () => {
  test("resets all signal values to their initial state", () => {
    const useStore = defineStore("reset-full", () => ({
      count: signal(0),
      name: signal("default"),
      active: signal(false),
    }))
    const api = useStore()
    api.store.count.set(100)
    api.store.name.set("changed")
    api.store.active.set(true)

    api.reset()

    expect(api.store.count()).toBe(0)
    expect(api.store.name()).toBe("default")
    expect(api.store.active()).toBe(false)
  })

  test("reset triggers subscribe notification", () => {
    const useStore = defineStore("reset-notify", () => ({
      count: signal(5),
    }))
    const api = useStore()
    api.store.count.set(99)

    const mutations: MutationInfo[] = []
    api.subscribe((m) => mutations.push(m))
    api.reset()

    // reset calls batch+set which triggers notification
    expect(mutations.length).toBeGreaterThanOrEqual(1)
  })

  test("computed values recompute after reset", () => {
    const useStore = defineStore("reset-computed-2", () => {
      const count = signal(10)
      const doubled = computed(() => count() * 2)
      return { count, doubled }
    })
    const api = useStore()
    api.store.count.set(50)
    expect(api.store.doubled()).toBe(100)

    api.reset()
    expect(api.store.count()).toBe(10)
    expect(api.store.doubled()).toBe(20)
  })
})

// ─── dispose — cleanup ─────────────────────────────────────────────────────

describe("dispose — full cleanup", () => {
  test("removes store from registry so next call re-creates", () => {
    let setupCount = 0
    const useStore = defineStore("dispose-recreate", () => {
      setupCount++
      return { val: signal(0) }
    })
    useStore()
    expect(setupCount).toBe(1)

    useStore().dispose()
    useStore()
    expect(setupCount).toBe(2)
  })

  test("clears all subscribe listeners", () => {
    const useStore = defineStore("dispose-subs", () => ({
      count: signal(0),
    }))
    const api = useStore()
    let callCount = 0
    api.subscribe(() => callCount++)

    api.store.count.set(1)
    expect(callCount).toBe(1)

    api.dispose()
    api.store.count.set(2) // should not fire
    expect(callCount).toBe(1)
  })

  test("clears all onAction listeners", () => {
    const useStore = defineStore("dispose-actions", () => ({
      doSomething: () => {},
    }))
    const api = useStore()
    let actionCount = 0
    api.onAction(() => actionCount++)

    api.store.doSomething()
    expect(actionCount).toBe(1)

    api.dispose()

    // Re-create — old listeners should not fire on new instance
    const api2 = useStore()
    api2.store.doSomething()
    expect(actionCount).toBe(1)
  })
})

// ─── addStorePlugin — plugin system ────────────────────────────────────────

describe("addStorePlugin — plugin system", () => {
  test("plugin runs for each newly created store", () => {
    const pluginIds: string[] = []
    addStorePlugin((api) => {
      pluginIds.push(api.id)
    })

    const useA = defineStore("plugin-a", () => ({ val: signal(0) }))
    const useB = defineStore("plugin-b", () => ({ val: signal(0) }))
    useA()
    useB()

    expect(pluginIds).toContain("plugin-a")
    expect(pluginIds).toContain("plugin-b")
  })

  test("plugin receives the full StoreApi with store, id, patch, subscribe, etc.", () => {
    let receivedApi: any = null
    addStorePlugin((api) => {
      receivedApi = api
    })

    const useStore = defineStore("plugin-api", () => ({
      count: signal(0),
    }))
    useStore()

    expect(receivedApi).not.toBeNull()
    expect(receivedApi.id).toBe("plugin-api")
    expect(typeof receivedApi.patch).toBe("function")
    expect(typeof receivedApi.subscribe).toBe("function")
    expect(typeof receivedApi.onAction).toBe("function")
    expect(typeof receivedApi.reset).toBe("function")
    expect(typeof receivedApi.dispose).toBe("function")
  })

  test("plugin does not run again on second call to same store", () => {
    let runCount = 0
    addStorePlugin(() => {
      runCount++
    })

    const useStore = defineStore("plugin-once", () => ({ val: signal(0) }))
    useStore()
    useStore()
    useStore()

    expect(runCount).toBe(1)
  })
})

// ─── resetAllStores ────────────────────────────────────────────────────────

describe("resetAllStores — clears all", () => {
  test("all stores get fresh state after resetAllStores", () => {
    const useA = defineStore("all-reset-a", () => ({ val: signal(0) }))
    const useB = defineStore("all-reset-b", () => ({ val: signal(0) }))

    useA().store.val.set(100)
    useB().store.val.set(200)

    resetAllStores()

    expect(useA().store.val()).toBe(0)
    expect(useB().store.val()).toBe(0)
  })

  test("resetAllStores followed by defineStore runs setup again", () => {
    let runs = 0
    const useStore = defineStore("all-reset-setup", () => {
      runs++
      return { val: signal(0) }
    })
    useStore()
    expect(runs).toBe(1)

    resetAllStores()
    useStore()
    expect(runs).toBe(2)
  })
})

// ─── SSR isolation via setStoreRegistryProvider ────────────────────────────

describe("setStoreRegistryProvider — SSR isolation", () => {
  afterEach(() => {
    setStoreRegistryProvider(() => new Map())
  })

  test("different providers have independent store state", () => {
    const regA = new Map<string, unknown>()
    const regB = new Map<string, unknown>()

    const useCounter = defineStore("ssr-counter", () => ({ count: signal(0) }))

    // Request A
    setStoreRegistryProvider(() => regA)
    useCounter().store.count.set(42)

    // Request B — independent
    setStoreRegistryProvider(() => regB)
    expect(useCounter().store.count()).toBe(0) // fresh instance
    useCounter().store.count.set(99)

    // Switch back to A — state preserved
    setStoreRegistryProvider(() => regA)
    expect(useCounter().store.count()).toBe(42)

    // B still has its own state
    setStoreRegistryProvider(() => regB)
    expect(useCounter().store.count()).toBe(99)
  })

  test("resetAllStores clears only the current provider's registry", () => {
    const regA = new Map<string, unknown>()
    const regB = new Map<string, unknown>()

    const useStore = defineStore("ssr-reset", () => ({ val: signal(0) }))

    setStoreRegistryProvider(() => regA)
    useStore().store.val.set(10)

    setStoreRegistryProvider(() => regB)
    useStore().store.val.set(20)

    // Reset only B
    resetAllStores()
    expect(regB.size).toBe(0)

    // A is unaffected
    setStoreRegistryProvider(() => regA)
    expect(useStore().store.val()).toBe(10)
  })
})

// ─── state snapshot ────────────────────────────────────────────────────────

describe("state — read-only snapshot", () => {
  test("excludes computed values and actions", () => {
    const useStore = defineStore("state-excl", () => ({
      count: signal(5),
      doubled: computed(() => 10),
      action: () => {},
    }))
    const api = useStore()
    const state = api.state
    expect(state).toEqual({ count: 5 })
    expect(state).not.toHaveProperty("doubled")
    expect(state).not.toHaveProperty("action")
  })

  test("state is a fresh snapshot each time", () => {
    const useStore = defineStore("state-fresh", () => ({
      val: signal(0),
    }))
    const api = useStore()
    const snap1 = api.state
    api.store.val.set(5)
    const snap2 = api.state
    expect(snap1).toEqual({ val: 0 })
    expect(snap2).toEqual({ val: 5 })
    expect(snap1).not.toBe(snap2)
  })
})
