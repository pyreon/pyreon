import { QueryClient } from '@tanstack/query-core'
import { createSyncStoragePersister, persistQueryClientSubscribe } from '../persist'

// On the server (or in a worker) there is no page to hide: subscribing must not
// touch `document` / `window`, and the settle-time writes still apply.
vi.mock('@pyreon/reactivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyreon/reactivity')>()),
  isServer: true,
}))

const never = <T>() => new Promise<T>(() => undefined)
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

it('without a document only the settle-time writes apply', async () => {
  const held = new Set<string>()
  Object.defineProperty(globalThis.navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, _o: unknown, cb: (lock: unknown) => unknown) => {
        held.add(name)
        return Promise.resolve(cb({ name }))
      },
      query: async () => ({ held: [...held].map((name) => ({ name })) }),
    },
  })
  const add = vi.spyOn(window, 'addEventListener')
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
  const client = new QueryClient()
  client.setMutationDefaults(['add'], { mutationFn: () => never() })
  const unsubscribe = persistQueryClientSubscribe({
    queryClient: client,
    persister: createSyncStoragePersister({ storage }),
  })
  expect(add).not.toHaveBeenCalledWith('pagehide', expect.anything())
  void client
    .getMutationCache()
    .build(client, { mutationKey: ['add'] })
    .execute({ id: 1 })
    .catch(() => undefined)
  await tick()
  expect(map.get('REACT_QUERY_OFFLINE_CACHE')).toContain('"id":1')
  unsubscribe()
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: undefined })
})
