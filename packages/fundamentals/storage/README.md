# @pyreon/storage

Reactive client-side storage for Pyreon. Signal-backed persistence across localStorage, sessionStorage, cookies, IndexedDB, and custom backends. Same key returns the same signal instance — no drift between components.

## Install

```bash
bun add @pyreon/storage
```

## Quick Start

```tsx
import { useStorage, useCookie, useSessionStorage, useIndexedDB } from '@pyreon/storage'

// localStorage — persistent, cross-tab synced
const theme = useStorage('theme', 'light')
theme()            // read reactively
theme.set('dark')  // updates signal + localStorage
theme.remove()     // remove from storage

// Cookie — SSR-readable, configurable expiry
const locale = useCookie('locale', 'en', { maxAge: 365 * 86400 })

// sessionStorage — tab-scoped
const wizardStep = useSessionStorage('wizard-step', 0)

// IndexedDB — large data, debounced writes
const draft = useIndexedDB('article-draft', { title: '', body: '' })
```

## Custom Backends

```tsx
import { createStorage } from '@pyreon/storage'

const useEncryptedStorage = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const secret = useEncryptedStorage('api-key', '')
```

## API

### Hooks

| Hook | Backend | Description |
| --- | --- | --- |
| `useStorage(key, default, options?)` | localStorage | Persistent, cross-tab synced |
| `useSessionStorage(key, default, options?)` | sessionStorage | Tab-scoped |
| `useCookie(key, default, options?)` | document.cookie | SSR-readable, configurable expiry |
| `useIndexedDB(key, default, options?)` | IndexedDB | Large data, debounced writes |
| `useMemoryStorage(key, default)` | in-memory | SSR/testing |

All hooks return `StorageSignal<T>` — extends `Signal<T>` with `.remove()`.

### `createStorage(backend)`

Factory for custom storage backends (encrypted, remote, etc.).

### `setCookieSource(header)`

Set SSR cookie source for server-side rendering.

### `removeStorage(key, options?)` / `clearStorage(type?)`

Cleanup utilities for removing stored values.

## License

MIT
