/**
 * Consumer-shaped coverage for two undertested surfaces:
 *
 *  1. CONCURRENT SSR isolation via an AsyncLocalStorage-backed registry
 *     provider — the exact wiring `configureStoreIsolation` (runtime-server)
 *     installs. Two interleaved async "requests" must get independent store
 *     instances with zero cross-talk.
 *
 *  2. Dev diagnostics added in the excellence pass:
 *     - `patch()` unknown-key warning (was a fully silent no-op),
 *     - same-id redefinition warning (two defineStore calls / HMR re-eval),
 *     - a signal field literally named `constructor` is now patchable (the
 *       old string-compare proto-guard was replaced by membership-first
 *       checking, which is both faster and stricter — unknown keys never
 *       touch `raw`, so pollution is structurally impossible).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { defineStore, resetAllStores, setStoreRegistryProvider } from '../index'

const defaultProvider = new Map<string, unknown>()

afterEach(() => {
  // Restore a plain provider + clear (tests below swap providers).
  setStoreRegistryProvider(() => defaultProvider)
  resetAllStores()
})

describe('concurrent SSR isolation (AsyncLocalStorage provider)', () => {
  test('two interleaved async requests get independent store instances', async () => {
    const als = new AsyncLocalStorage<Map<string, unknown>>()
    const fallback = new Map<string, unknown>()
    setStoreRegistryProvider(() => als.getStore() ?? fallback)

    const useCart = defineStore('ssr-cart', () => {
      const items = signal<string[]>([])
      const add = (item: string) => items.set([...items(), item])
      return { items, add }
    })

    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

    const requestA = als.run(new Map<string, unknown>(), async () => {
      const cart = useCart()
      cart.store.add('a1')
      await tick() // yield — request B mutates ITS cart meanwhile
      cart.store.add('a2')
      await tick()
      return { items: cart.store.items(), api: cart }
    })

    const requestB = als.run(new Map<string, unknown>(), async () => {
      const cart = useCart()
      cart.store.add('b1')
      await tick()
      return { items: cart.store.items(), api: cart }
    })

    const [a, b] = await Promise.all([requestA, requestB])
    expect(a.items).toEqual(['a1', 'a2'])
    expect(b.items).toEqual(['b1'])
    // Different registries → different instances (no shared singleton).
    expect(a.api).not.toBe(b.api)
    // The fallback (non-request) registry never saw the store.
    expect(fallback.size).toBe(0)
  })

  test('schema-mode stores are per-request isolated too', async () => {
    const als = new AsyncLocalStorage<Map<string, unknown>>()
    setStoreRegistryProvider(() => als.getStore() ?? new Map())

    const useUser = defineStore('ssr-user', {
      schema: {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (v: unknown) => ({ value: v as { name: string } }),
        },
      },
      initial: { name: 'anon' },
    })

    const a = await als.run(new Map<string, unknown>(), async () => {
      const u = useUser()
      u.set({ name: 'alice' })
      return u.state.name
    })
    const b = await als.run(new Map<string, unknown>(), async () => useUser().state.name)

    expect(a).toBe('alice')
    expect(b).toBe('anon') // request B never saw request A's write
  })
})

describe('dev diagnostics', () => {
  test('patch() warns on an unknown key instead of silently dropping it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const useStore = defineStore('diag-unknown-key', () => ({
        count: signal(0),
        double: () => 2,
      }))
      const api = useStore()
      api.patch({ cuont: 5 }) // typo'd key
      expect(api.store.count()).toBe(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"cuont" is not a signal field'))
      // Known keys don't warn.
      warn.mockClear()
      api.patch({ count: 5 })
      expect(api.store.count()).toBe(5)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test('same-id redefinition from a different setup function warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const useA = defineStore('diag-redefine', () => ({ a: signal(1) }))
      const apiA = useA()

      // Second definition, same id, DIFFERENT setup — HMR / copy-paste shape.
      const useB = defineStore('diag-redefine', () => ({ b: signal(2) }))
      const apiB = useB()

      expect(apiB).toBe(apiA) // registry returns the existing instance
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DIFFERENT setup function'))
      // Warn-once per id.
      warn.mockClear()
      useB()
      expect(warn).not.toHaveBeenCalled()
      // Same-setup registry hits never warn.
      useA()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test('a signal field named "constructor" is patchable (membership-first key check)', () => {
    const useStore = defineStore('diag-ctor-field', () => ({
      // Own enumerable key named `constructor` holding a signal — legal, if odd.
      constructor: signal(1),
      count: signal(0),
    }))
    const api = useStore()
    api.patch({ constructor: 7, count: 3 })
    expect((api.store.constructor as unknown as () => number)()).toBe(7)
    expect(api.store.count()).toBe(3)
  })

  test('unknown "__proto__"-shaped keys never pollute (JSON.parse payload)', () => {
    const useStore = defineStore('diag-proto-key', () => ({ count: signal(0) }))
    const api = useStore()
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "count": 9}') as Record<
      string,
      unknown
    >
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      api.patch(payload)
    } finally {
      warn.mockRestore()
    }
    expect(api.store.count()).toBe(9)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })
})
