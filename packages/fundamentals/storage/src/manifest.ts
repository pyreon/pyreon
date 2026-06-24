import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/storage',
  title: 'Reactive Storage',
  tagline: 'Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB',
  description:
    'Signal-backed persistence for Pyreon. Every stored value is a reactive signal that persists writes automatically to the underlying storage backend. `useStorage` (localStorage, cross-tab synced), `useSessionStorage`, `useCookie` (SSR-readable, configurable expiry), `useIndexedDB` (large data, debounced writes), and `useMemoryStorage` (ephemeral, SSR-safe). All hooks return `StorageSignal<T>` which extends `Signal<T>` with `.remove()`. `createStorage(backend)` enables custom backends (encrypted, remote, etc.). SSR-safe — browser-API hooks return the default value on the server.',
  category: 'universal',
  longExample: `import { useStorage, useSessionStorage, useCookie, useIndexedDB, useMemoryStorage, createStorage } from '@pyreon/storage'

// localStorage — persistent, cross-tab synced via storage events:
const theme = useStorage('theme', 'light')
theme()            // 'light' — reactive signal read
theme.set('dark')  // updates signal + writes to localStorage
theme.remove()     // removes from storage, resets to default

// sessionStorage — per-tab, cleared on tab close:
const filter = useSessionStorage('filter', { query: '', page: 1 })
filter.set({ query: 'search', page: 2 })

// Cookie — SSR-readable, configurable expiry:
const locale = useCookie('locale', 'en', {
  maxAge: 365 * 86400,  // 1 year
  path: '/',
  sameSite: 'lax',
})

// IndexedDB — large data, debounced writes:
const draft = useIndexedDB('article-draft', {
  title: '',
  body: '',
  tags: [] as string[],
})

// Memory storage — ephemeral, SSR-safe fallback:
const temp = useMemoryStorage('temp-data', { count: 0 })

// Custom backend — encrypted, remote, etc.:
const encryptedBackend = {
  get: (key: string) => decrypt(localStorage.getItem(key)),
  set: (key: string, value: string) => localStorage.setItem(key, encrypt(value)),
  remove: (key: string) => localStorage.removeItem(key),
}
const useEncrypted = createStorage(encryptedBackend)
const secret = useEncrypted('api-key', '')`,
  features: [
    'useStorage — localStorage-backed with cross-tab sync via storage events',
    'useSessionStorage — per-tab ephemeral storage',
    'useCookie — SSR-readable with configurable path, maxAge, sameSite',
    'useIndexedDB — large data with debounced async writes',
    'useMemoryStorage — in-memory fallback, SSR-safe',
    'createStorage(backend) — factory for custom storage backends',
    'StorageSignal<T> extends Signal<T> with .remove()',
  ],
  api: [
    {
      name: 'useStorage',
      kind: 'hook',
      signature:
        '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
      summary:
        'Create a reactive signal backed by localStorage. Reads the stored value on creation (falling back to `defaultValue` if absent or on SSR), writes on every `.set()`, and syncs across browser tabs via `storage` events. Returns `StorageSignal<T>` which extends `Signal<T>` with `.remove()` to delete the key and reset to default. Serialization defaults to JSON; provide custom `serializer`/`deserializer` in options for non-JSON types.',
      example: `const theme = useStorage('theme', 'light')
theme()           // 'light'
theme.set('dark') // persists + cross-tab sync
theme.remove()    // delete from storage, reset to default`,
      mistakes: [
        'Expecting cross-tab sync with `useSessionStorage` — only `useStorage` (localStorage) fires storage events across tabs',
        'Storing non-serializable values (functions, class instances) without custom `serializer`/`deserializer` — JSON.stringify drops them silently',
        'Reading `.remove()` return value — it returns void, not the removed value',
      ],
      seeAlso: ['useSessionStorage', 'useCookie', 'useIndexedDB', 'createStorage'],
    },
    {
      name: 'useCookie',
      kind: 'hook',
      signature: '<T>(key: string, defaultValue: T, options?: CookieOptions) => StorageSignal<T>',
      summary:
        'Reactive signal backed by browser cookies. SSR-readable — on the server, reads from the request cookie header via `setCookieSource()`. Options include `maxAge`, `path`, `domain`, `sameSite`, `secure`. Same `StorageSignal<T>` return type as other hooks.',
      example: `const locale = useCookie('locale', 'en', { maxAge: 365 * 86400, path: '/' })
locale.set('fr')`,
      mistakes: [
        'Forgetting `setCookieSource(req.headers.get("cookie"))` on SSR — without it the server-side render starts from `defaultValue`, not the user\'s actual cookie; the page flashes the wrong locale/theme until client-side hydration corrects it.',
        'Omitting `sameSite` for auth-style cookies — the browser default has tightened across vendors. Be explicit: `sameSite: "lax"` (default for nav) or `"strict"` (login cookies) or `"none"` (cross-origin embeds with `secure: true`).',
        "Setting `maxAge` in milliseconds — it's in SECONDS (matches the HTTP spec). `maxAge: 86400` is one DAY, not one minute.",
        'Storing > 4KB in a cookie — browsers enforce a ~4KB per-cookie limit. Reach for `useIndexedDB` for large values; cookies are for small server-readable state.',
      ],
      seeAlso: ['useStorage', 'setCookieSource', 'useSessionStorage'],
    },
    {
      name: 'useSessionStorage',
      kind: 'hook',
      signature:
        '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
      summary:
        "Per-tab ephemeral reactive storage. Same shape as `useStorage` but writes go to `sessionStorage` instead of `localStorage` — cleared when the tab closes. NO cross-tab sync (browsers do not fire storage events for sessionStorage). Useful for per-visit filter state, unsaved form drafts that shouldn't survive tab close, and any state that should NOT outlive the current browsing session.",
      example: `const filter = useSessionStorage('list-filter', { query: '', page: 1 })
filter.set({ query: 'pyreon', page: 1 })
// → persists for the tab's lifetime; gone on close`,
      mistakes: [
        'Expecting cross-tab sync — sessionStorage is per-tab by spec. Two tabs on the same page each have their own independent sessionStorage. For shared state across tabs, use `useStorage` (localStorage).',
        'Treating sessionStorage as "private" — same JavaScript-readable shape as localStorage; do not store secrets there.',
      ],
      seeAlso: ['useStorage', 'useMemoryStorage'],
    },
    {
      name: 'useMemoryStorage',
      kind: 'hook',
      signature: '<T>(key: string, defaultValue: T) => StorageSignal<T>',
      summary:
        'In-memory reactive signal that mimics the storage hook shape — useful as an SSR-safe fallback or in environments without `localStorage`/`sessionStorage` (sandbox iframes, web workers without DOM, some embedded WebViews). Same `StorageSignal<T>` shape with `.remove()`. Values are lost on page reload; no persistence.',
      example: `const draft = useMemoryStorage('draft-id-42', '')
draft.set('typing...')
// → reactive, but cleared on reload`,
      mistakes: [
        "Reaching for useMemoryStorage when a plain `signal()` would do — if you don't need the StorageSignal `.remove()` shape or the cross-storage-backend interchangeability, a plain `signal(defaultValue)` is simpler.",
        'Expecting persistence — values vanish on reload by design. If persistence is needed, swap to `useStorage` / `useSessionStorage` / `useIndexedDB`.',
      ],
      seeAlso: ['useStorage', 'useSessionStorage'],
    },
    {
      name: 'setCookieSource',
      kind: 'function',
      signature: 'setCookieSource(source: string | (() => string) | null) => void',
      summary:
        "Tell `useCookie` how to read cookies during SSR. Pass the raw cookie header string (or an accessor returning it) at the top of each request handler so server-side renders see the user's actual cookies. Pass `null` to clear (typically at request cleanup). The module-level cookie source is per-request-context-isolated via `runWithRequestContext` so concurrent SSR requests do not see each other's cookies.",
      example: `import { setCookieSource } from '@pyreon/storage'

// Inside an SSR handler:
setCookieSource(request.headers.get('cookie') ?? '')
const html = await renderToString(<App />)`,
      mistakes: [
        "Forgetting to call setCookieSource on SSR — `useCookie` falls back to `defaultValue` on every request, ignoring the user's real cookie state. The page hydrates correctly on the client but flashes the default first.",
        'Passing a stale cookie source after redirect or login — the source is captured once; re-call after any operation that should change the cookie set.',
        'Calling setCookieSource(null) too early — call it at request CLEANUP (after the response is sent), not before render. Cleaning up mid-render erases the source from later loaders.',
      ],
      seeAlso: ['useCookie'],
    },
    {
      name: 'useIndexedDB',
      kind: 'hook',
      signature:
        '<T>(key: string, defaultValue: T, options?: IndexedDBOptions) => StorageSignal<T>',
      summary:
        'Reactive signal backed by IndexedDB for large data. Writes are debounced to avoid excessive I/O. The signal initializes with `defaultValue` synchronously and hydrates from IndexedDB asynchronously — the value updates reactively once the read completes. Silent init error logging in dev mode.',
      example: `const draft = useIndexedDB('article-draft', { title: '', body: '' })
draft.set({ title: 'New Article', body: 'Content...' })`,
      mistakes: [
        'Reading the signal in render and expecting the persisted value on FIRST render — IDB initialization is async. The signal starts at `defaultValue`, then the persisted value flows in on the next tick. UIs that need the persisted value before paint should pair with a synchronous fallback (e.g. `useStorage` for a small marker).',
        'Storing huge blobs without considering quota — IDB has per-origin quotas (~50% of free disk, browser-dependent). Bumping into the quota throws on `setItem` async; handle with try/catch around `.set()` if the write may exceed.',
        'Expecting cross-tab sync — IndexedDB does NOT fire storage events. Two tabs writing to the same key will overwrite each other silently. Use `BroadcastChannel` alongside if multi-tab consistency matters.',
        'Setting the value rapidly in a loop — writes are debounced but unbounded loop assignments still queue. Throttle at the caller for high-frequency mutations.',
      ],
      seeAlso: ['useStorage', 'useMemoryStorage'],
    },
    {
      name: 'createStorage',
      kind: 'function',
      signature:
        '(backend: StorageBackend | AsyncStorageBackend) => <T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
      summary:
        'Factory for custom storage backends. Pass an object with `get`, `set`, `remove` methods (sync or async) and receive a hook function with the same signature as `useStorage`. Use for encrypted storage, remote backends, or any custom persistence layer.',
      example: `const useEncrypted = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})
const secret = useEncrypted('api-key', '')`,
      mistakes: [
        'Returning `undefined` from the backend `get` when the key is absent — return `null` (matches the localStorage / sessionStorage contract). `undefined` may be JSON-serialized as the literal string `"undefined"` by some serialize-deserialize pipelines.',
        'Throwing synchronously from setItem — backend errors should be either logged + swallowed (graceful degradation, the signal still updates) OR propagated via a rejected Promise for async backends. A thrown error breaks the calling `.set()` and leaves the in-memory signal in a state inconsistent with the backend.',
        'Forgetting that the backend must implement ALL three (`get`, `set`, `remove`) — `.remove()` calls the backend `remove`, and omitting it makes the hook crash on cleanup paths.',
      ],
      seeAlso: ['useStorage'],
    },
  ],
  gotchas: [
    {
      label: 'SSR safety',
      note: 'Browser-backed hooks (`useStorage`, `useSessionStorage`, `useIndexedDB`) return the default value on the server. `useCookie` is SSR-readable via `setCookieSource()` which reads from the request headers.',
    },
    {
      label: 'Cross-tab sync',
      note: 'Only `useStorage` (localStorage) syncs across tabs via `storage` events. `useSessionStorage` is per-tab. Cookies and IndexedDB have no built-in cross-tab notification.',
    },
    {
      label: 'IndexedDB async init',
      note: 'The IndexedDB hook initializes synchronously with the default value, then hydrates asynchronously. Components reading the value in their first render see the default — the value updates reactively once the IDB read completes.',
    },
  ],
})
