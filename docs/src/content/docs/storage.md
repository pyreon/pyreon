---
title: Storage
description: Reactive client-side storage for Pyreon — localStorage, sessionStorage, cookies, IndexedDB, and custom backends.
---

`@pyreon/storage` is signal-backed persistence. Every stored value **is a reactive signal** — read it like a signal, write it with `.set()`, and the underlying storage backend persists automatically. There is no separate "load / save" step, no `useEffect` to sync, no manual `JSON.parse`. A `useStorage('theme', 'light')` value participates in the exact same fine-grained reactivity as a plain `signal()`: it patches the DOM in place, drives `computed()` derivations, and re-runs `effect()`s.

<PackageBadge name="@pyreon/storage" href="/docs/storage" />

Five backends share one API shape, so you can swap persistence strategy by changing the hook name:

| Hook                | Backend          | Persists across | Cross-tab sync | SSR-readable |
| ------------------- | ---------------- | --------------- | -------------- | ------------ |
| `useStorage`        | `localStorage`   | reloads + tabs  | ✅ yes          | no (default) |
| `useSessionStorage` | `sessionStorage` | reloads (per-tab) | ❌ no         | no (default) |
| `useCookie`         | cookies          | configurable expiry | ❌ no      | ✅ via `setCookieSource` |
| `useIndexedDB`      | IndexedDB        | reloads + tabs (large data) | ❌ no | no (default) |
| `useMemoryStorage`  | in-memory `Map`  | nothing (ephemeral) | ❌ no      | ✅ safe fallback |

Plus `createStorage(backend)` for custom backends (encrypted, remote, etc.) — it produces a hook with the identical signature.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/storage
```

```bash [bun]
bun add @pyreon/storage
```

```bash [pnpm]
pnpm add @pyreon/storage
```

```bash [yarn]
yarn add @pyreon/storage
```

:::

Peer dependency: `@pyreon/reactivity`.

## Quick Start

```tsx
import { useStorage } from '@pyreon/storage'

const theme = useStorage('theme', 'light')

theme() // 'light' — or the stored value if one exists
theme.set('dark') // updates the signal AND writes to localStorage
theme.remove() // deletes the key, resets the signal to 'light'
```

Because the return value is a signal, it works everywhere a signal works — JSX, effects, computeds, stores:

```tsx
function ThemeToggle() {
  const theme = useStorage('theme', 'light')
  return (
    <button onClick={() => theme.set(theme() === 'dark' ? 'light' : 'dark')}>
      {theme()} {/* patches in place when theme changes */}
    </button>
  )
}
```

<Example file="./examples/storage/reactive-storage" title="Reactive Storage" />

## The `StorageSignal<T>` shape

Every hook returns a `StorageSignal<T>` — a full `Signal<T>` plus one extra method:

```ts
interface StorageSignal<T> extends Signal<T> {
  /** Remove the value from storage and reset the signal to the default value. */
  remove(): void
}
```

So you get the complete signal surface — call it to read (`theme()`), `.set(next)`, `.update(fn)`, `.peek()`, `.subscribe(fn)`, `.direct(fn)` — and `.remove()` on top.

```tsx
const count = useStorage('count', 0)

count() //                  read (reactive)
count.set(5) //             write + persist
count.update((n) => n + 1) // write + persist (functional)
count.peek() //             read WITHOUT subscribing
count.remove() //           delete from storage, reset to 0
```

:::warning `.remove()` returns `void`, not the removed value
`.remove()` clears storage and resets the signal to its default — it does **not** return the value that was removed. Read `count()` (or `count.peek()`) before removing if you need the prior value.
:::

Internally each `StorageSignal` is built with `wrapSignal` from `@pyreon/reactivity`: reads (including the `.direct()` channel and the internal `_v` field the compiler's `_bindText` fast path reads) delegate to a shared base `signal()`, while `.set` routes through the backend's persist function. This is what lets `<strong>{theme()}</strong>` patch in place on `theme.set(…)` with no re-render — full participation in the reactivity system.

## Backends

### `useStorage()` — localStorage

Persistent across reloads **and synced across tabs**. Change a value in one tab and every other tab's signal updates instantly via the native `storage` event.

```tsx
import { useStorage } from '@pyreon/storage'
import { effect } from '@pyreon/reactivity'

// Primitives
const theme = useStorage('theme', 'light')
const sidebarOpen = useStorage('sidebar-open', true)

// Objects — JSON-serialized automatically
const prefs = useStorage('prefs', { density: 'comfortable', lang: 'en' })

// Read reactively — works in effects, computeds, JSX
effect(() => {
  document.body.className = theme() === 'dark' ? 'dark-mode' : ''
})

// Cross-tab: another tab calling theme.set('dark') updates THIS signal too.
```

#### Same key → same signal

`useStorage('theme', …)` called from two different components returns the **same** signal instance — there is one signal per `(backend, key)` pair, refcounted so it survives until the last consumer removes it:

```tsx
// Header.tsx
const theme = useStorage('theme', 'light')

// Settings.tsx — identical object, no drift
const theme = useStorage('theme', 'light')
```

This means a `.remove()` in one component does **not** orphan the others from cross-tab updates: the registry entry (and the window `storage` listener) is only torn down on the *last* consumer's `.remove()`. Until then, surviving consumers keep receiving cross-tab events.

#### Write coalescing — `writeDebounceMs`

`localStorage.setItem` is synchronous main-thread I/O. For a value persisted on every keystroke (a draft), that is a `JSON.stringify` + `setItem` per character. Pass `writeDebounceMs` to coalesce the **write** — the signal still updates **synchronously** (the UI stays reactive), only the persist is debounced. The latest value wins, and a pending write is flushed on `pagehide` / `beforeunload` so the last value is never lost on tab close.

```ts
// Signal is reactive immediately; the localStorage write is coalesced to 300ms.
const draft = useStorage('post-draft', '', { writeDebounceMs: 300 })
draft.set(e.target.value) // sync signal update, debounced persist
```

`writeDebounceMs` is opt-in — omit it (or `0`) for the default synchronous write. It applies to `useStorage` and `useSessionStorage` only; cookie / IndexedDB (already async-debounced) / memory backends ignore it. A single shared `pagehide`/`beforeunload` listener flushes all pending writes (not one listener per signal — avoiding listener pile-up), and `.remove()` cancels any pending write so a removed key can't be resurrected by a stale timer.

### `useSessionStorage()` — per-tab

Same shape as `useStorage`, but writes go to `sessionStorage`: scoped to the current tab and cleared when the tab closes. **No cross-tab sync** — `sessionStorage` is per-tab by spec, and browsers do not fire `storage` events for it.

```tsx
import { useSessionStorage } from '@pyreon/storage'

const wizardStep = useSessionStorage('wizard-step', 0)
const formDraft = useSessionStorage('contact-draft', { name: '', message: '' })
```

Use it for per-visit state that should *not* survive a tab close: multi-step wizard progress, an unsaved form draft, a scroll position, a "you have unsaved changes" flag.

:::warning sessionStorage does not sync across tabs
Two tabs on the same page each have their own independent `sessionStorage`. If you expect a change in one tab to appear in another, you want `useStorage` (localStorage). `useSessionStorage` writes are isolated per tab by design.
:::

:::warning sessionStorage is not "private"
It is the same JavaScript-readable surface as `localStorage` — any script on the page can read it. Do not store secrets, tokens, or PII there.
:::

### `useCookie()` — server-readable

Backed by browser cookies, with configurable expiry, path, domain, secure, and SameSite. Cookies are the **only** backend readable during SSR.

```tsx
import { useCookie } from '@pyreon/storage'

const locale = useCookie('locale', 'en', {
  maxAge: 60 * 60 * 24 * 365, // 1 year, in SECONDS
  path: '/',
  sameSite: 'lax',
})

const consent = useCookie('cookie-consent', false, {
  maxAge: 60 * 60 * 24 * 180, // 6 months
})

locale.set('de') // writes document.cookie + updates signal
locale.remove() // deletes the cookie, resets to 'en'
```

#### Cookie options

`CookieOptions<T>` extends `StorageOptions<T>`, so it also accepts `serializer` / `deserializer` / `onError` (see [Serialization](#serialization)). Cookie-specific options:

| Option     | Type                          | Default | Description                                                  |
| ---------- | ----------------------------- | ------- | ------------------------------------------------------------ |
| `maxAge`   | `number`                      | —       | Max age in **seconds** (HTTP spec). `86400` = one day.       |
| `expires`  | `Date`                        | —       | Absolute expiry date (alternative to `maxAge`).              |
| `path`     | `string`                      | `'/'`   | Cookie path scope.                                           |
| `domain`   | `string`                      | —       | Cookie domain scope.                                         |
| `secure`   | `boolean`                     | `false` | Send only over HTTPS.                                        |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | SameSite policy (emitted lowercased).                        |

:::warning `maxAge` is in SECONDS, not milliseconds
This matches the HTTP cookie spec. `maxAge: 86400` is **one day**, not one minute. A common bug is passing `Date.now()`-style millisecond values, which yield absurd expiry far in the future.
:::

:::warning Be explicit about `sameSite` for auth-style cookies
The browser default for `sameSite` has tightened across vendors. Choose deliberately: `'lax'` (the package default — good for navigation/preference cookies), `'strict'` (login/session cookies), or `'none'` for cross-origin embeds — and `'none'` **requires** `secure: true`.
:::

:::warning Cookies have a ~4KB per-cookie limit
Cookies are sent on every request to their `path`/`domain`, so keep them small — server-readable preference flags, locale, theme. For large client-side data, reach for `useIndexedDB`.
:::

#### SSR support — `setCookieSource()`

On the server there is no `document.cookie`. Tell `useCookie` where to read by passing the request's raw `Cookie` header to `setCookieSource()` at the top of your request handler — then SSR renders with the user's actual cookie state instead of the default.

```tsx
import { setCookieSource, useCookie } from '@pyreon/storage'
import { renderToString } from '@pyreon/runtime-server'

// In your SSR request handler:
setCookieSource(request.headers.get('cookie') ?? '')

// Now useCookie reads from the request header on the server.
const html = await renderToString(<App />)
```

In the browser `useCookie` reads `document.cookie` directly; the source set by `setCookieSource` is only consulted on the server.

:::warning Set the cookie source before SSR render
If you skip `setCookieSource`, `useCookie` falls back to its `defaultValue` on every server render — the page hydrates correctly on the client, but flashes the default first (wrong locale/theme on first paint). Call `setCookieSource(request.headers.get('cookie') ?? '')` before `renderToString`.
:::

:::warning The cookie source is module-level, set per request
`setCookieSource` sets a single module-level string. Call it at the start of each request handler with that request's header. Re-call it after any operation that should change the cookie set (login, redirect) so later loaders see the new value.
:::

### `useIndexedDB()` — large data

For data that exceeds the ~5MB `localStorage` budget (offline drafts, cached datasets, structured blobs). Writes are debounced; the value hydrates **asynchronously**.

```tsx
import { useIndexedDB } from '@pyreon/storage'

const draft = useIndexedDB('article-draft', { title: '', body: '' })

// Signal updates immediately; the IDB write is debounced (default 100ms).
draft.set({ title: 'My Post', body: '...10KB of content...' })
```

#### IndexedDB options

`IndexedDBOptions<T>` extends `StorageOptions<T>` (so `serializer` / `deserializer` / `onError` apply) plus:

| Option       | Type     | Default            | Description                          |
| ------------ | -------- | ------------------ | ------------------------------------ |
| `dbName`     | `string` | `'pyreon-storage'` | IndexedDB database name.             |
| `storeName`  | `string` | `'kv'`             | Object store name within the DB.     |
| `debounceMs` | `number` | `100`              | Debounce window for the async write. |

Note `useIndexedDB` uses its own `debounceMs` option (not `writeDebounceMs`) — IDB writes are always async-debounced.

:::warning The first render sees the DEFAULT, not the persisted value
IndexedDB initialization is asynchronous. The signal starts at `defaultValue` synchronously, then the persisted value flows in on a later tick and updates reactively. If you must have the persisted value *before* first paint, pair it with a synchronous fallback (e.g. a small `useStorage` marker) — or render a loading state until the IDB read settles.
:::

:::warning IndexedDB does not sync across tabs
IDB fires no `storage` event. Two tabs writing the same key will silently overwrite each other (last write wins). If multi-tab consistency matters, coordinate with a `BroadcastChannel` alongside.
:::

:::warning Per-origin quotas + rapid writes
IDB has per-origin quotas (browser-dependent, often ~50% of free disk). Hitting the quota rejects the async write — the in-memory signal still holds the value, but the persist failed silently. Writes are debounced, but an unbounded loop of `.set()` calls still queues every value; throttle at the caller for very high-frequency mutations.
:::

### `useMemoryStorage()` — ephemeral / SSR-safe

An in-memory signal that mimics the storage-hook shape (`.remove()` and all). It is backed by a module-level `Map`, so values are lost on reload — there is no persistence. Use it as an SSR-safe fallback or in environments without `localStorage`/`sessionStorage` (sandboxed iframes, web workers without DOM, some embedded WebViews).

```tsx
import { useMemoryStorage } from '@pyreon/storage'

const temp = useMemoryStorage('draft-id-42', '')
temp.set('typing...') // reactive, but gone on reload
```

It accepts the same `(key, defaultValue, options?)` signature as the other hooks (it is literally `createStorage(memoryBackend)`), so `serializer` / `deserializer` / `onError` work — though for an in-memory store you rarely need them.

:::tip A plain `signal()` is often simpler
If you do not need the `StorageSignal` `.remove()` shape or interchangeability with the persistent backends, a plain `signal(defaultValue)` from `@pyreon/reactivity` is lighter. Reach for `useMemoryStorage` specifically when you want the storage-hook shape as an SSR-safe stand-in for a real backend.
:::

### `createStorage()` — custom backends

`createStorage(backend)` returns a hook with the same signature as `useStorage`, backed by any persistence layer you supply. Use it for encrypted storage, a remote API, or any custom adapter.

The backend object implements three methods — **`get` / `set` / `remove`** (not `getItem`/`setItem`/`removeItem`):

```ts
interface StorageBackend {
  /** Read a raw string value. Return null if the key is absent. */
  get(key: string): string | null
  /** Write a raw string value. */
  set(key: string, value: string): void
  /** Remove a key. */
  remove(key: string): void
}
```

```tsx
import { createStorage } from '@pyreon/storage'

const useEncryptedStorage = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const secret = useEncryptedStorage('api-key', '')
secret.set('sk-…') // encrypted before it touches localStorage
```

The backend receives the **already-serialized string** (`set` is called with `serialize(value)`), and its `get` return is passed to `deserialize`. So your backend deals only in strings — serialization/deserialization stays the hook's job (override it via `serializer`/`deserializer` if needed).

An optional second argument names the backend for registry isolation (`createStorage(backend, 'my-backend')`); it defaults to `'custom'`.

:::warning Return `null` from `get`, never `undefined`
The contract matches `localStorage` / `sessionStorage`: return `null` when a key is absent. `undefined` can be JSON-serialized as the literal string `"undefined"` by some pipelines, corrupting the round-trip.
:::

:::warning Implement all three methods
`.remove()` calls `backend.remove`. Omitting any of `get` / `set` / `remove` breaks the corresponding code path. The hook swallows synchronous throws from `get`/`set`/`remove` (graceful degradation — the in-memory signal still updates), but a missing method is a structural error.
:::

:::note `createStorage` backends are read synchronously
The `StorageBackend` interface is synchronous (`get` returns `string | null`, not a Promise). The package also exports an `AsyncStorageBackend` *type* (used internally by the IndexedDB layer), but `createStorage` itself takes the synchronous `StorageBackend`. For an async custom backend, model it after `useIndexedDB` rather than wiring a Promise through `createStorage`.
:::

## Serialization

By default values are serialized with `JSON.stringify` and read back with `JSON.parse`. Anything JSON-representable (primitives, plain objects, arrays) round-trips automatically. For non-JSON types, supply `serializer` / `deserializer` (note: **`serializer`/`deserializer`**, not `serialize`/`deserialize`):

```tsx
// Store a Date
const lastVisit = useStorage('last-visit', new Date(), {
  serializer: (d) => d.toISOString(),
  deserializer: (s) => new Date(s),
})

// Store a Set
const favorites = useStorage('favorites', new Set<string>(), {
  serializer: (s) => JSON.stringify([...s]),
  deserializer: (s) => new Set(JSON.parse(s)),
})

// Store a Map
const cache = useStorage('cache', new Map<string, number>(), {
  serializer: (m) => JSON.stringify([...m]),
  deserializer: (s) => new Map(JSON.parse(s)),
})
```

:::warning Functions and class instances drop silently under JSON
The default `JSON.stringify` discards functions, `undefined` properties, and the prototype of class instances. If you store a value with non-serializable parts and read it back, those parts are gone — with no error. Provide custom `serializer`/`deserializer` for anything beyond plain JSON data.
:::

### `StorageOptions<T>`

Shared by every hook (and extended by `CookieOptions` / `IndexedDBOptions`):

| Option            | Type                          | Default          | Description                                                                 |
| ----------------- | ----------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `serializer`      | `(value: T) => string`        | `JSON.stringify` | Serialize a value to a string before persisting.                            |
| `deserializer`    | `(raw: string) => T`          | `JSON.parse`     | Parse a stored string back to a value.                                      |
| `onError`         | `(error: Error) => T \| undefined` | —           | Called when deserialization throws. Return a fallback, or `void` for the default. |
| `writeDebounceMs` | `number`                      | `0`              | Coalesce the persist write (localStorage / sessionStorage only).            |

## Error handling

A corrupt or unparseable stored value will not crash your app. Deserialization is wrapped in a `try/catch`: on failure it falls back to the `defaultValue`, or to whatever `onError` returns:

```tsx
const value = useStorage('key', 'fallback', {
  onError: (error) => {
    console.warn('Storage read failed:', error)
    return 'custom-fallback' // or return undefined to use the default
  },
})
```

Write failures (quota exceeded, private-browsing restrictions, a throwing custom backend) are also swallowed for the synchronous backends — the in-memory signal still updates, so the UI stays consistent even though the persist failed. `getWebStorage` additionally probes `localStorage`/`sessionStorage` for write access on first use and degrades to a no-op if it is blocked (private mode), so `useStorage` never throws on construction.

## Cleanup utilities

Two top-level helpers remove managed keys without holding the signal:

```tsx
import { removeStorage, clearStorage } from '@pyreon/storage'
```

### `removeStorage(key, options?)`

Removes one key and resets its signal to the default. The backend is chosen with `options.type` (default `'local'`):

```tsx
removeStorage('theme') //                       localStorage
removeStorage('wizard-step', { type: 'session' }) // sessionStorage
removeStorage('locale', { type: 'cookie' }) //       cookie
removeStorage('draft', { type: 'indexeddb' }) //     IndexedDB
```

If a key was never registered through a hook, `removeStorage` still attempts to clear the raw underlying storage (localStorage / sessionStorage `removeItem`, or a cookie-delete write) as a best effort.

### `clearStorage(type?)`

Removes **all** keys managed by `@pyreon/storage` for a backend. `type` is positional (default `'local'`), with `'all'` covering every backend:

```tsx
clearStorage() //          all managed localStorage entries
clearStorage('session') // all managed sessionStorage entries
clearStorage('cookie') //  all managed cookies
clearStorage('indexeddb') // all managed IndexedDB entries
clearStorage('all') //     everything
```

:::note "Managed" means registered through a hook
`clearStorage` only clears keys that were created via a `@pyreon/storage` hook in the current session (it iterates the internal registry). Pre-existing `localStorage` keys your app never touched through these hooks are left alone — use the native `localStorage.clear()` if you need a total wipe.
:::

## SSR & hydration

`@pyreon/storage` is SSR-safe in both string-rendered (`renderToString`) and hydrated apps.

**On the server**, the browser-only backends — `useStorage`, `useSessionStorage`, `useIndexedDB`, `useMemoryStorage` — have no server equivalent, so `isBrowser()` returns false, the read path bails, and the signal initializes to the `defaultValue` you passed. The rendered HTML reflects the default:

```tsx
const theme = useStorage('theme', 'light')
// Server: theme() → 'light' (no localStorage on the server)
// SSR HTML: <strong>light</strong>
```

**`useCookie` is the exception** — it reads from the request via `setCookieSource(request.headers.get('cookie'))`, so the SSR markup reflects the client's *actual* cookie state.

**On client hydration**, browser-backed signals re-read the real stored value and patch the DOM if it differs from the SSR default. A user with `localStorage.theme = 'dark'` may see a brief `light → dark` flash. For preferences that change rendering critically (theme, language), mirror the choice into a cookie so SSR reads the right value on first paint — no flash:

```tsx
// Companion cookie writes alongside the localStorage signal.
const themeCookie = useCookie('theme', 'light', { maxAge: 60 * 60 * 24 * 365 })
const theme = useStorage('theme', themeCookie())
// SSR reads the cookie (via setCookieSource) → renders the right theme on first paint.
// Client hydrates with the matching localStorage value → no flash.
```

Reactive bindings through storage signals ride the compiler's `_bindText` fast path, same as base `signal()` / `computed()` — `<strong>{theme()}</strong>` patches the text node in place when `theme.set(…)` fires; no re-render, no re-mount.

## Cross-tab sync

Only `useStorage` (localStorage) syncs across tabs. The package attaches a single window `storage` listener (refcounted, detached when the last localStorage signal is removed); when another tab writes a managed key, the listener deserializes the new value and `.set`s the local signal — propagating into every effect, computed, and bound DOM node in this tab automatically.

```tsx
const cart = useStorage('cart', [] as Item[])
// Tab A: cart.set([...cart(), item])
// Tab B: cart() updates instantly — no polling, no manual wiring.
```

The other backends do **not** notify across tabs: `sessionStorage` is per-tab by spec, and cookies / IndexedDB fire no cross-tab event. If you need multi-tab consistency on those, coordinate with a `BroadcastChannel` yourself.

## Real-world patterns

### Persisted theme with no SSR flash

```tsx
// Cookie is the source of truth for SSR; localStorage mirrors it for fast client reads.
const themeCookie = useCookie('theme', 'light', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
const theme = useStorage('theme', themeCookie())

function setTheme(next: 'light' | 'dark') {
  theme.set(next) // localStorage + cross-tab
  themeCookie.set(next) // cookie for next SSR
}
```

### Draft persisted on every keystroke

```tsx
function PostEditor() {
  // Reactive immediately; localStorage write debounced 500ms; flushed on tab close.
  const draft = useStorage('post-draft', '', { writeDebounceMs: 500 })
  return <textarea value={draft()} onInput={(e) => draft.set(e.currentTarget.value)} />
}
```

### Encrypted secret via a custom backend

```tsx
const useSecure = createStorage({
  get: (key) => {
    const raw = localStorage.getItem(key)
    return raw === null ? null : decrypt(raw)
  },
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const apiKey = useSecure('api-key', '')
apiKey.set('sk-live-…') // encrypted at rest
```

## API Reference

### Hooks

| Export                                     | Signature                                                                       | Returns            |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------ |
| `useStorage(key, default, options?)`       | `<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>`     | localStorage signal, cross-tab synced |
| `useSessionStorage(key, default, options?)`| `<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>`     | sessionStorage signal, per-tab |
| `useCookie(key, default, options?)`        | `<T>(key: string, defaultValue: T, options?: CookieOptions<T>) => StorageSignal<T>`      | cookie signal, SSR-readable |
| `useIndexedDB(key, default, options?)`     | `<T>(key: string, defaultValue: T, options?: IndexedDBOptions<T>) => StorageSignal<T>`   | IndexedDB signal, async-hydrated |
| `useMemoryStorage(key, default, options?)` | `<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>`     | in-memory signal, ephemeral |

### Factory & SSR

| Export                            | Signature                                                                                                  | Description                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `createStorage(backend, name?)`   | `(backend: StorageBackend, backendName?: string) => <T>(key, default, options?) => StorageSignal<T>`        | Build a custom-backend hook with the `useStorage` shape. |
| `setCookieSource(cookieHeader)`   | `(cookieHeader: string) => void`                                                                            | Tell `useCookie` the raw request `Cookie` header for SSR.|

### Utilities

| Export                         | Signature                                                                          | Description                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `removeStorage(key, options?)` | `(key: string, options?: { type?: 'local' \| 'session' \| 'cookie' \| 'indexeddb' }) => void` | Remove one key (default backend `'local'`) + reset its signal.    |
| `clearStorage(type?)`          | `(type?: 'local' \| 'session' \| 'cookie' \| 'indexeddb' \| 'all') => void`        | Remove all managed keys for a backend (default `'local'`).        |

### `StorageSignal<T>` instance

| Member            | Returns      | Description                                                  |
| ----------------- | ------------ | ------------------------------------------------------------ |
| `signal()`        | `T`          | Read the value (reactive in effects / computeds / JSX).      |
| `signal.set(v)`   | `void`       | Write the value to the signal + persist to the backend.      |
| `signal.update(fn)` | `void`     | Functional write — `set(fn(peek()))` + persist.              |
| `signal.peek()`   | `T`          | Read **without** subscribing.                                |
| `signal.subscribe(fn)` | `() => void` | Subscribe to changes; returns an unsubscribe.          |
| `signal.direct(fn)` | `() => void` | Low-level direct subscription channel.                     |
| `signal.remove()` | `void`       | Delete from storage and reset the signal to its default.     |

### Types

| Type                  | Shape                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `StorageSignal<T>`    | `Signal<T>` extended with `remove(): void`.                                                 |
| `StorageOptions<T>`   | `{ serializer?, deserializer?, onError?, writeDebounceMs? }`.                                |
| `CookieOptions<T>`    | `StorageOptions<T>` + `{ maxAge?, expires?, path?, domain?, secure?, sameSite? }`.          |
| `IndexedDBOptions<T>` | `StorageOptions<T>` + `{ dbName?, storeName?, debounceMs? }`.                                |
| `StorageBackend`      | `{ get(key): string \| null; set(key, value): void; remove(key): void }` (synchronous).    |
| `AsyncStorageBackend` | `{ get(key): Promise<string \| null>; set(key, value): Promise<void>; remove(key): Promise<void> }`. |
