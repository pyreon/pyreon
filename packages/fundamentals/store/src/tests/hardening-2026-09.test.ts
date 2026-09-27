import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  __clearStoreHydrationForTesting,
  addStorePlugin,
  defineStore,
  dehydrateStores,
  hydrateStores,
  resetAllStores,
  resetStore,
  type MutationInfo,
} from '../index'

beforeEach(() => {
  resetAllStores()
  __clearStoreHydrationForTesting()
})
afterEach(() => {
  resetAllStores()
  __clearStoreHydrationForTesting()
})

// ─── 1. per-store SSR opt-out ─────────────────────────────────────────────────

describe('defineStore({ ssr: false }) — excluded from the SSR payload', () => {
  const bridge = () =>
    (globalThis as { __PYREON_DEHYDRATE_STORES__?: () => Record<string, unknown> })
      .__PYREON_DEHYDRATE_STORES__!

  it('a setup store with ssr:false is not serialized (direct + framework bridge)', () => {
    const useSession = defineStore('session', () => ({ token: signal('secret-token') }), {
      ssr: false,
    })
    const usePublic = defineStore('public', () => ({ n: signal(1) }))
    useSession()
    usePublic()

    expect(dehydrateStores()).toEqual({ public: { n: 1 } })
    // The bridge `@pyreon/server`'s renderPage calls is the same function.
    expect(bridge()()).toEqual({ public: { n: 1 } })
    expect(JSON.stringify(bridge()())).not.toContain('secret-token')
  })

  it('a schema store with ssr:false is not serialized', () => {
    const useSecret = defineStore('secret', {
      schema: z.object({ apiKey: z.string() }),
      initial: { apiKey: 'sk-live' },
      ssr: false,
    })
    useSecret()
    expect(dehydrateStores()).toEqual({})
  })

  it('an ALREADY-CREATED ssr:false store is not patched by hydrateStores', () => {
    const useLocal = defineStore('local2', () => ({ v: signal('client-default') }), {
      ssr: false,
    })
    const local = useLocal()
    hydrateStores({ local2: { v: 'from-server' } })
    expect(local.store.v()).toBe('client-default')
  })

  it('an ssr:false store ignores incoming hydration data on the client', () => {
    hydrateStores({ local: { v: 'from-server' } })
    const useLocal = defineStore('local', () => ({ v: signal('client-default') }), {
      ssr: false,
    })
    expect(useLocal().store.v()).toBe('client-default')
  })
})

// ─── 2. dispose() identity check ──────────────────────────────────────────────

describe('dispose() — only removes ITS OWN registry entry', () => {
  it('a stale api.dispose() after resetStore + recreate leaves the NEW store registered', () => {
    const useA = defineStore('a', () => ({ n: signal(0) }))
    const old = useA()
    resetStore('a')
    const live = useA()
    live.patch({ n: 5 })

    old.dispose()

    const again = useA()
    expect(again).toBe(live)
    expect(again.store.n()).toBe(5)
  })
})

// ─── 3. hydration reads OWN keys only ─────────────────────────────────────────

describe('hydration — inherited prototype keys are not seeds', () => {
  it("a store id like 'valueOf' / 'toString' is not seeded from Object.prototype", () => {
    hydrateStores({ other: { x: 1 } })
    const useValueOf = defineStore('valueOf', () => ({ x: signal(0) }))
    const useToString = defineStore('toString', () => ({ x: signal(0) }))
    expect(() => useValueOf()).not.toThrow()
    expect(useValueOf().store.x()).toBe(0)
    expect(useToString().store.x()).toBe(0)
  })
})

// ─── 4. reset() notifies ONCE ─────────────────────────────────────────────────

describe('reset() with subscribers — one notification', () => {
  it('a multi-field reset emits a single mutation carrying every changed field', () => {
    const useS = defineStore('s', () => ({ a: signal(1), b: signal(2), c: signal(3) }))
    const s = useS()
    s.patch({ a: 10, b: 20, c: 30 })
    const seen: MutationInfo[] = []
    s.subscribe((m) => seen.push(m))

    s.reset()

    expect(seen).toHaveLength(1)
    expect(seen[0]!.events.map((e) => e.key).sort()).toEqual(['a', 'b', 'c'])
    expect(s.state).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('reset with no changes emits nothing', () => {
    const useS = defineStore('s2', () => ({ a: signal(1) }))
    const s = useS()
    const seen: MutationInfo[] = []
    s.subscribe((m) => seen.push(m))
    s.reset()
    expect(seen).toHaveLength(0)
  })
})

// ─── 5. addStorePlugin disposer ───────────────────────────────────────────────

describe('addStorePlugin — returns an unregister function', () => {
  it('the disposer stops the plugin running on later stores', () => {
    const ran: string[] = []
    const remove = addStorePlugin((api) => {
      ran.push(api.id)
    })
    defineStore('p1', () => ({ n: signal(0) }))()
    remove()
    defineStore('p2', () => ({ n: signal(0) }))()
    remove() // idempotent
    expect(ran).toEqual(['p1'])
  })

  it('removing one registration leaves another plugin in place', () => {
    const ran: string[] = []
    const removeA = addStorePlugin(() => {
      ran.push('A')
    })
    const removeB = addStorePlugin(() => {
      ran.push('B')
    })
    removeA()
    defineStore('p3', () => ({ n: signal(0) }))()
    removeB()
    expect(ran).toEqual(['B'])
  })
})
