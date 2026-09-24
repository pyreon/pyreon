# @pyreon/storage

- `useStorage(key, default, opts?)`, `useSessionStorage`, `useCookie`, `useIndexedDB`, `useMemoryStorage`; `createStorage(backend)` for a custom backend (`{ get, set, remove }`). All return `StorageSignal<T>` (a `Signal<T>` plus `.remove()`).
- `writeDebounceMs` (opt-in, local/session) coalesces the synchronous `setItem`; pending writes flush on `pagehide`/`beforeunload` through one shared listener.
- `version` + `migrate` (all backends, cross-tab aware): a versioned value is stored in a JSON envelope (`__pyreonStorageV`/`__pyreonStorageD`). Reading at a higher `version` runs `migrate(oldValue, fromVersion)`; a pre-versioning value migrates `from 0`. The storage-event handler migrates cross-tab values too.
- `onError` also fires on write failures (quota, blocked `setItem`) as a notification; the signal has already updated.
- `setCookieSource(source)` accepts `string | (() => string) | null`. Use the accessor form for per-request SSR; a bare string is one shared module slot and is not isolated across concurrent requests.
- Built on `wrapSignal`. Any hand-written signal wrapper must forward `_v` through a getter, because the compiler's `_bindText` fast path reads `source._v` directly (missing it binds `''`). Enforced by `pyreon/storage-signal-v-forwarding`.
- Competitor bench: `bun run --filter '@pyreon/storage' bench:storage` (vs jotai `atomWithStorage` and zustand `persist` over a shared in-memory engine). Its correctness gate reads the backing store after a write; a bench fixture must be a real `StorageBackend`, or writes throw inside the quota guard and the row measures the catch.
