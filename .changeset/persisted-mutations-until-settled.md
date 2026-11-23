---
'@pyreon/query': minor
---

`@pyreon/query/persist`: a persisted mutation is no longer lost when the tab closes, reloads or crashes while its request is in flight. TanStack persists a mutation only while it is paused; `<PersistQueryClientProvider>` and `persistQueryClient` / `persistQueryClientRestore` / `persistQueryClientSave` / `persistQueryClientSubscribe` (same signatures) keep everything TanStack persists and also keep a mutation while its request is in flight, until it settles, when a later page could send it:

- an in-flight mutation is kept when its `mutationKey` resolves to a function registered with `setMutationDefaults` (a keyless `useMutation({ mutationFn })` is not); a keyed one left out gets a dev warning;
- never one marked `meta: { persist: false }` (use it for mutations whose variables are secrets; it also keeps a paused one out);
- never one that cannot be stored (`File`, `Date`, `Map`, class instances, BigInt, cycles in the variables, or a `meta`/context JSON cannot write): it is left out with a dev warning, and the rest of the cache is still written. A retry's `failureReason` that cannot be written is stored as `{ name, message }`.

Two tabs never both send one mutation: each persisted mutation holds a Web Lock, and a tab takes over another tab's mutation only once that tab has closed. A mutation's lock is released only after storage has dropped it (async storage included); a page that never persisted a mutation holds no Web Lock, so it stays eligible for the back/forward cache. Without Web Locks an in-flight mutation is not persisted (TanStack's behaviour). The storage persisters (`createSyncStoragePersister`, `createAsyncStoragePersister`) also write at once when a mutation becomes owned, when it settles and when the page is hidden; after `pagehide` nothing more is written, so a request a reload aborts stays stored. Precedence is TanStack's: an explicit `dehydrateOptions.shouldDehydrateMutation`, then the client's `defaultOptions.dehydrate`, then this default. New export `shouldPersistMutation(mutation, client)`.

Delivery is now at-least-once: a request the server received but whose response never reached the closing tab is sent again by the next page. Make mutation endpoints idempotent.
