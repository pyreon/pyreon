import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/storage',
  title: 'Reactive Storage',
  tagline:
    'Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB',
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
  getItem: (key: string) => decrypt(localStorage.getItem(key)),
  setItem: (key: string, value: string) => localStorage.setItem(key, encrypt(value)),
  removeItem: (key: string) => localStorage.removeItem(key),
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
      signature: '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
      summary:
        'Create a reactive signal backed by localStorage. Reads the stored value on creation (falling back to `defaultValue` if absent or on SSR), writes on every `.set()`, and syncs across browser tabs via `storage` events. Returns `StorageSignal<T>` which extends `Signal<T>` with `.remove()` to delete the key and reset to default. Serialization defaults to JSON; provide custom `serialize`/`deserialize` in options for non-JSON types.',
      example: `const theme = useStorage('theme', 'light')
theme()           // 'light'
theme.set('dark') // persists + cross-tab sync
theme.remove()    // delete from storage, reset to default`,
      mistakes: [
        'Expecting cross-tab sync with `useSessionStorage` — only `useStorage` (localStorage) fires storage events across tabs',
        'Storing non-serializable values (functions, class instances) without custom `serialize`/`deserialize` — JSON.stringify drops them silently',
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
      seeAlso: ['useStorage', 'setCookieSource'],
    },
    {
      name: 'useIndexedDB',
      kind: 'hook',
      signature: '<T>(key: string, defaultValue: T, options?: IndexedDBOptions) => StorageSignal<T>',
      summary:
        'Reactive signal backed by IndexedDB for large data. Writes are debounced to avoid excessive I/O. The signal initializes with `defaultValue` synchronously and hydrates from IndexedDB asynchronously — the value updates reactively once the read completes. Silent init error logging in dev mode.',
      example: `const draft = useIndexedDB('article-draft', { title: '', body: '' })
draft.set({ title: 'New Article', body: 'Content...' })`,
      seeAlso: ['useStorage', 'useMemoryStorage'],
    },
    {
      name: 'createStorage',
      kind: 'function',
      signature: '(backend: StorageBackend | AsyncStorageBackend) => <T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
      summary:
        'Factory for custom storage backends. Pass an object with `getItem`, `setItem`, `removeItem` methods (sync or async) and receive a hook function with the same signature as `useStorage`. Use for encrypted storage, remote backends, or any custom persistence layer.',
      example: `const useEncrypted = createStorage({
  getItem: (key) => decrypt(localStorage.getItem(key)),
  setItem: (key, value) => localStorage.setItem(key, encrypt(value)),
  removeItem: (key) => localStorage.removeItem(key),
})
const secret = useEncrypted('api-key', '')`,
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
