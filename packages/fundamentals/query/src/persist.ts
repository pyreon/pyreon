// ─── @pyreon/query/persist ───────────────────────────────────────────────────
// Offline / reload-survival persistence — a faithful adapter over TanStack's
// framework-agnostic persist engine + storage persisters, plus the Pyreon-
// reactive <PersistQueryClientProvider>. Isolated in this subpath so the
// persist deps stay out of the main @pyreon/query bundle.

// Framework-agnostic persist engine (identity re-export) …
export {
  experimental_createQueryPersister,
  PERSISTER_KEY_PREFIX,
  removeOldestQuery,
} from '@tanstack/query-persist-client-core'
// … except the four client-persistence entry points, which carry Pyreon's
// mutation contract (see persist-mutations.ts). Same signatures as TanStack's.
export {
  persistQueryClient,
  persistQueryClientRestore,
  persistQueryClientSave,
  persistQueryClientSubscribe,
  shouldPersistMutation,
} from './persist-mutations'
export type { MutationView } from './persist-mutations'
export type {
  MaybePromise,
  PersistedClient,
  PersistedQuery,
  Persister,
  PersistQueryClientOptions,
  PersistRetryer,
  Promisable,
} from '@tanstack/query-persist-client-core'

// Storage persisters: TanStack's, with the immediate write the mutation
// contract uses (persisters.ts). createSyncStoragePersister is the
// localStorage/sessionStorage one (the common case); the async variant backs
// IndexedDB / RN AsyncStorage / any Promise-returning store.
export { createAsyncStoragePersister, createSyncStoragePersister } from './persisters'

// Pyreon-reactive provider + the isRestoring surface.
export type { PersistQueryClientProviderProps } from './persist-provider'
export { PersistQueryClientProvider } from './persist-provider'
export type { IsRestoringProviderProps } from './is-restoring'
export { IsRestoringProvider, useIsRestoring } from './is-restoring'
