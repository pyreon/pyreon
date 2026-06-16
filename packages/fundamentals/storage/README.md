# @pyreon/storage

Reactive client-side storage — `localStorage`, `sessionStorage`, cookies, IndexedDB, custom backends.

`@pyreon/storage` exposes five reactive primitives backed by `@pyreon/reactivity` signals: `useStorage` (localStorage, cross-tab synced), `useSessionStorage` (tab-scoped), `useCookie` (SSR-readable, configurable expiry), `useIndexedDB` (large data, debounced writes), and `useMemoryStorage` (SSR/testing). All return `StorageSignal<T>` — extends `Signal<T>` with `.remove()`. Same key returns the same instance — two `useStorage('theme', 'light')` calls in different components share the SAME signal, so writes propagate instantly without registry wiring. A `createStorage(backend)` factory lets you bring your own backend (encrypted, remote, IPC, …).

## Install

```bash
bun add @pyreon/storage @pyreon/reactivity
```

`@pyreon/reactivity` is the only runtime dep — `@pyreon/core` is NOT required (these are framework-agnostic primitives).

## Quick start

```tsx
import {
  useStorage,
  useSessionStorage,
  useCookie,
  useIndexedDB,
  useMemoryStorage,
} from '@pyreon/storage'

// localStorage — persistent, cross-tab synced via the native `storage` event
const theme = useStorage('theme', 'light')
theme() // 'light' — read reactively
theme.set('dark') // updates signal + localStorage + any other tab
theme.remove() // resets to default and removes from storage

// sessionStorage — tab-scoped
const wizardStep = useSessionStorage('wizard-step', 0)

// Cookie — SSR-readable, configurable expiry
const locale = useCookie('locale', 'en', { maxAge: 365 * 86400 })

// IndexedDB — large data, debounced writes (default 100ms)
const draft = useIndexedDB('article-draft', { title: '', body: '' })

// Memory — SSR / testing — no persistence
const sessionId = useMemoryStorage('session-id', '')
```

## Hooks

All five hooks share the same signature: `useX(key, defaultValue, options?)` → `StorageSignal<T>`.

| Hook                                        | Backend         | Cross-tab | SSR-safe | Notes                                |
| ------------------------------------------- | --------------- | --------- | -------- | ------------------------------------ |
| `useStorage(key, default, options?)`        | localStorage    | ✅ yes    | safe     | Auto-syncs via `storage` event       |
| `useSessionStorage(key, default, options?)` | sessionStorage  | ❌ no     | safe     | Tab-scoped                           |
| `useCookie(key, default, options?)`         | document.cookie | ❌ no     | ✅ yes   | Reads server cookie via `setCookieSource` |
| `useIndexedDB(key, default, options?)`      | IndexedDB       | ❌ no     | safe     | Async; debounced writes              |
| `useMemoryStorage(key, default)`            | in-memory Map   | ❌ no     | safe     | SSR / testing                        |

Same key returns the SAME signal instance per backend:

```ts
const a = useStorage('theme', 'light')
const b = useStorage('theme', 'light')
a === b // true — registered once per (backend, key) pair
```

## `StorageSignal<T>` interface

```ts
interface StorageSignal<T> extends Signal<T> {
  remove(): void // clear storage, reset to default value
}
```

Inherits `Signal<T>`: `()` (read), `.set(v)` (write), `.update(fn)`, `.peek()`, `.subscribe(fn)`, `.direct(fn)`.

## Options (shared)

| Option           | Type                          | Description                                              |
| ---------------- | ----------------------------- | -------------------------------------------------------- |
| `serializer?`    | `(value: T) => string`        | Default: `JSON.stringify`                                |
| `deserializer?`  | `(raw: string) => T`          | Default: `JSON.parse`                                    |
| `onError?`       | `(error: Error) => T \| void` | Called on deserialization fail; return fallback or void  |

## `useCookie` options

Extends `StorageOptions<T>` with:

| Option       | Type                              | Default |
| ------------ | --------------------------------- | ------- |
| `maxAge?`    | `number` (seconds)                | —       |
| `expires?`   | `Date`                            | —       |
| `path?`      | `string`                          | `'/'`   |
| `domain?`    | `string`                          | —       |
| `secure?`    | `boolean`                         | `false` |
| `sameSite?`  | `'strict' \| 'lax' \| 'none'`     | `'lax'` |

## `useIndexedDB` options

Extends `StorageOptions<T>` with:

| Option       | Type     | Default            |
| ------------ | -------- | ------------------ |
| `dbName?`    | `string` | `'pyreon-storage'` |
| `storeName?` | `string` | `'kv'`             |
| `debounceMs?`| `number` | `100`              |

IndexedDB writes are debounced — rapid `.set()` calls coalesce to a single transaction. The signal updates synchronously; persistence is async.

## `setCookieSource(header)` — SSR

Cookies on the server come from the request header, not `document.cookie`. Call once per request:

```ts
import { setCookieSource, useCookie } from '@pyreon/storage'

// In your SSR request handler:
setCookieSource(request.headers.get('cookie') ?? '')

// Then anywhere downstream:
const locale = useCookie('locale', 'en') // reads from the request cookie on the server
```

## Custom backends — `createStorage`

```ts
import { createStorage } from '@pyreon/storage'

const useEncryptedStorage = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const secret = useEncryptedStorage('api-key', '')
```

`createStorage(backend, backendName?)` returns a hook of the same shape as `useStorage`. The `backendName` argument scopes the same-key-same-signal registry per backend — two `createStorage` calls produce hooks with isolated registries.

`StorageBackend` (sync) and `AsyncStorageBackend` (used internally by IndexedDB) are both exported types if you need to type a custom backend manually.

## Cleanup utilities

```ts
import { removeStorage, clearStorage } from '@pyreon/storage'

removeStorage('theme') // localStorage by default
removeStorage('step', { type: 'session' })
removeStorage('locale', { type: 'cookie' })

clearStorage('local') // clear all managed localStorage entries
clearStorage('all') // clear every backend
```

`removeStorage` calls `.remove()` on the registered signal (resetting it to default + clearing storage). `clearStorage` walks the registry for that backend and removes every entry. Unmanaged keys in raw storage are NOT touched.

## Internal `_v` getter contract

Every storage signal wraps a base `signal()` with a facade that **forwards `_v` (and `.direct`)** — required by the compiler-emitted `_bindText` / `_bindDirect` fast paths, which read `source._v` directly (skipping the function call) and subscribe via `source.direct(...)` for cached signals. Without the forwarding, every binding writes `''` on initial render and on every subscriber notification. **The canonical way to build such a facade is `wrapSignal(base, { set })` from `@pyreon/reactivity`** — it forwards `_v` / `.direct` / `.peek` / `.subscribe` / `.label` by construction, so the contract can't be forgotten. (Every storage backend here uses it.) The `pyreon/storage-signal-v-forwarding` lint rule still guards against HAND-ROLLED facades that delegate `.direct` but forget `_v`.

## Types

| Type                  | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `StorageSignal<T>`    | `Signal<T>` + `.remove()`                              |
| `StorageOptions<T>`   | Shared options — `serializer`, `deserializer`, `onError` |
| `CookieOptions<T>`    | Cookie-specific options (extends `StorageOptions`)     |
| `IndexedDBOptions<T>` | IndexedDB-specific options (extends `StorageOptions`)  |
| `StorageBackend`      | `{ get(key), set(key, value), remove(key) }` (sync)    |
| `AsyncStorageBackend` | Async variant — internal IndexedDB shape               |

## Gotchas

- **Same key returns the SAME signal instance per backend** — two `useStorage('theme', 'light')` calls in different components share state. This is by design; do NOT expect a fresh signal per call.
- **`useStorage` cross-tab listener is ref-counted** — attached on first `useStorage`, removed when the last signal disposes via `.remove()`. Pre-fix the listener leaked across the page lifetime.
- **The internal `_v` getter is load-bearing** — if you hand-roll a wrapper-signal on top of `@pyreon/reactivity` and forget to forward `_v` (or `.direct`), the compiler-emitted fast path binds to `undefined` and renders empty (the bug class PR #546 fixed). **Use `wrapSignal()` from `@pyreon/reactivity` for any new backend** — it forwards both by construction so the bug is impossible. The `pyreon/storage-signal-v-forwarding` lint rule guards the hand-rolled case.
- **Cookies need `setCookieSource(header)` on the server** — `document.cookie` doesn't exist in SSR. Without it, `useCookie` returns the default value during render.
- **IndexedDB writes are debounced** (default 100ms) — the signal updates immediately; persistence trails. On unload, in-flight writes complete (most browsers honor pending IndexedDB transactions).
- **`useMemoryStorage` doesn't persist** — values clear on reload. Useful for SSR, tests, and request-scoped state that should NOT survive navigation.
- **Don't write via call-shorthand** (`storageSignal(newValue)`) — that's a read with discarded arg. Use `.set(value)`. Caught by the opt-in lint rule `pyreon/no-storage-write-as-call` (auto-fixable).
- **`onError` doesn't fire for IndexedDB read failures** — they fall back to the default silently. Use `try/catch` around `useIndexedDB` if you need explicit error handling.

## Documentation

Full docs: [pyreon.dev/docs/storage](https://pyreon.dev/docs/storage) (or `docs/src/content/docs/storage.md` in this repo).

## License

MIT
