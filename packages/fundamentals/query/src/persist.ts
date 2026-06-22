// ─── @pyreon/query/persist ───────────────────────────────────────────────────
// Offline / reload-survival persistence — a faithful adapter over TanStack's
// framework-agnostic persist engine + storage persisters, plus the Pyreon-
// reactive <PersistQueryClientProvider>. Isolated in this subpath so the
// persist deps stay out of the main @pyreon/query bundle.

// Framework-agnostic persist engine (identity re-export).
export {
  experimental_createQueryPersister,
  PERSISTER_KEY_PREFIX,
  persistQueryClient,
  persistQueryClientRestore,
  persistQueryClientSave,
  persistQueryClientSubscribe,
  removeOldestQuery,
} from '@tanstack/query-persist-client-core'
export type {
  MaybePromise,
  PersistedClient,
  PersistedQuery,
  Persister,
  PersistQueryClientOptions,
  PersistRetryer,
  Promisable,
} from '@tanstack/query-persist-client-core'

// Storage persisters (identity re-export). createSyncStoragePersister is the
// localStorage/sessionStorage one (the common case); the async variant backs
// IndexedDB / RN AsyncStorage / any Promise-returning store.
export { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
export { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

// Pyreon-reactive provider + the isRestoring surface.
export type { PersistQueryClientProviderProps } from './persist-provider'
export { PersistQueryClientProvider } from './persist-provider'
export type { IsRestoringProviderProps } from './is-restoring'
export { IsRestoringProvider, useIsRestoring } from './is-restoring'
