---
'@pyreon/query': minor
---

`@pyreon/query/persist`: a persisted mutation is no longer lost when the tab closes while its request is in flight. TanStack persists a mutation only while it is paused; `<PersistQueryClientProvider>` and `persistQueryClient` / `persistQueryClientRestore` / `persistQueryClientSave` / `persistQueryClientSubscribe` (same signatures) now persist a mutation from start until it settles, paused or in flight, when a later page could send exactly the same request:

- only a resumable mutation: a `mutationKey` whose function is registered with `setMutationDefaults` and not overridden by an inline `mutationFn`. A keyless `useMutation({ mutationFn })` is never written to storage;
- not one marked `meta: { persist: false }`: use it for mutations whose variables are secrets;
- not one whose variables do not survive JSON (`File`, `Date`, `Map`, class instances, BigInt, cycles): it is left out with a dev warning, and the rest of the cache is still written.

Two tabs never both send one mutation: each persisted mutation holds a Web Lock, and a tab takes over another tab's mutation only once that tab has closed. Without Web Locks an in-flight mutation is not persisted (TanStack's behaviour). The storage persisters (`createSyncStoragePersister`, `createAsyncStoragePersister`) now write at once when a mutation starts, when it settles and when the page is hidden, instead of after their throttle. Precedence is TanStack's: an explicit `dehydrateOptions.shouldDehydrateMutation`, then the client's `defaultOptions.dehydrate`, then this default. New export `shouldPersistMutation(mutation, client)`.

Delivery is now at-least-once: a request the server received but whose response never reached the closing tab is sent again by the next page. Make mutation endpoints idempotent.
