import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'
import { createAsyncStoragePersister as tanstackAsync } from '@tanstack/query-async-storage-persister'
import { createSyncStoragePersister as tanstackSync } from '@tanstack/query-sync-storage-persister'
import { withFlush } from './persist-mutations'

// TanStack's storage persisters, plus the immediate write the mutation contract
// needs. Both throttle their writes (1 s by default, trailing), so storage held
// a mutation for up to a second after it SUCCEEDED, and a reload in that window
// sent it again. The contract writes through `FLUSH` the moment a mutation
// starts being persisted, when it settles, and when the page is hidden; the
// throttled write still runs and carries the same (or a newer) snapshot.

const DEFAULT_KEY = 'REACT_QUERY_OFFLINE_CACHE'

type SyncOptions = Parameters<typeof tanstackSync>[0]
type AsyncOptions = Parameters<typeof tanstackAsync>[0]

/**
 * TanStack's `createSyncStoragePersister` (localStorage / sessionStorage), with
 * an immediate write the mutation contract uses on settle and on page hide.
 * Same options.
 */
export function createSyncStoragePersister(options: SyncOptions): Persister {
  const persister = tanstackSync(options)
  const storage = options.storage
  if (!storage) return persister
  const key = options.key ?? DEFAULT_KEY
  const serialize = options.serialize ?? JSON.stringify

  return withFlush(persister, (client: PersistedClient) => {
    try {
      storage.setItem(key, serialize(client))
    } catch {
      // A full storage: the throttled write right behind this one applies `retry`.
    }
  })
}

/**
 * TanStack's `createAsyncStoragePersister` (IndexedDB, React Native
 * AsyncStorage, any Promise-returning store), with the same immediate write.
 * It starts at once and completes asynchronously; locks are released only
 * after it has landed, but a page torn down in the same moment may not finish it.
 */
export function createAsyncStoragePersister(options: AsyncOptions): Persister {
  const persister = tanstackAsync(options)
  const storage = options.storage
  if (!storage) return persister
  const key = options.key ?? DEFAULT_KEY
  const serialize = options.serialize ?? JSON.stringify

  // Returns the write: lock releases wait for it to land (see persist-mutations.ts).
  return withFlush(persister, (client: PersistedClient) =>
    Promise.resolve()
      .then(() => serialize(client))
      .then((text) => storage.setItem(key, text))
      .then(
        () => undefined,
        () => undefined,
      ),
  )
}
