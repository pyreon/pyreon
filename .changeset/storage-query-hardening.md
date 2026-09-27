---
'@pyreon/storage': minor
'@pyreon/query': minor
---

**@pyreon/storage**

- Cross-tab sync no longer writes back. An inbound `storage` event updates this tab's signal without re-persisting it, so a removal in another tab is no longer undone here, and two tabs on different `version`s no longer re-serialize each other's value. An inbound value also cancels this tab's pending debounced write of an older value.
- `localStorage.clear()` in another tab (a `storage` event with `key === null`) now resets every `useStorage` signal to its default, instead of leaving values such as auth tokens alive in memory. Events for a different storage area are ignored. **Behaviour change.**
- `useIndexedDB`: a `.set()` / `.remove()` made before the initial async read settles is no longer overwritten by that read. Several `storeName`s in one `dbName` now work — a missing store is created by upgrading the database version (previously every read/write to a second store failed). An open connection now closes when another tab upgrades the database.
- `useIndexedDB` returns an `IndexedDBSignal<T>` with `ready()` (reactive), `whenReady()` and `flush()`, and flushes a pending debounced write on `pagehide` / `beforeunload`.
- `useCookie`: cookie names that need URI encoding (spaces, `;`, `=`, non-ASCII) now read back. `secure` now defaults to `true` on `https:` pages and for `sameSite: 'none'` (browsers reject `SameSite=None` without it); an explicit `secure` still wins. **Behaviour change.** Dev warnings for `sameSite: 'none'` + `secure: false`, for cookies over ~4 KB, and for a `.set()` on the server (which sends no `Set-Cookie`).
- Dev warning when a same-key call passes a different default or options than the call that created the shared signal (those are ignored).

**@pyreon/query**

- `useSubscription` / `useSSE`: the reconnect backoff is now capped (`maxReconnectDelay`, default 30 s) and jittered. Uncapped, unlimited attempts overflowed the `setTimeout` limit after ~31 failures and reconnected immediately in a loop. When attempts run out, `status()` is the new `'failed'` state, and a browser `online` event restarts the connection. **Behaviour change:** the status unions gain `'failed'`.
- `useSSE`: a `parse` failure now surfaces on `error()` (keeping the last good `data()`) instead of being swallowed; `error` is typed `Signal<Event | Error | null>`. A throwing `onMessage` (both hooks) is reported with `console.error` in dev.
- `useQuery` / `useSuspenseQuery` take TanStack's generic order `<TQueryFnData, TError, TData = TQueryFnData, TQueryKey>`, so `select` can change the result type without casts. A single explicit generic still means the data type. **Breaking** only for callers passing three explicit generics (the third was the key type, now `TData`).
- `useQueries` infers each entry's result type from its `queryFn` (or annotated `select`); a tuple of queries gives a tuple of typed results. New exported types `UseQueriesInput`, `QueriesResults`, `QueriesEntryData`.
- Every observer-backed hook evaluates its `options()` builder once per run instead of twice at mount.
