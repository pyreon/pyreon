---
title: Storage
description: Reactive client-side storage for Pyreon — localStorage, sessionStorage, cookies, IndexedDB
---

# @pyreon/storage

Reactive signal-backed persistence across all client-side storage backends. Every stored value is a reactive signal that automatically persists writes.

## Installation

::: code-group

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

Peer dependencies: `@pyreon/reactivity`

## Quick Start

```tsx
import { useStorage } from '@pyreon/storage'

const theme = useStorage('theme', 'light')
theme() // 'light' (or stored value)
theme.set('dark') // updates signal + localStorage
```

## Storage Backends

### localStorage — `useStorage()`

Persistent, cross-tab synced via native `storage` event.

```tsx
import { useStorage } from '@pyreon/storage'

// Simple values
const theme = useStorage('theme', 'light')
const sidebarOpen = useStorage('sidebar-open', true)

// Objects — auto JSON serialized
const prefs = useStorage('prefs', { density: 'comfortable', lang: 'en' })

// Read reactively — works in effects, computeds, JSX
effect(() => {
  document.body.class = theme() === 'dark' ? 'dark-mode' : ''
})

// Remove from storage, reset to default
theme.remove()
```

Cross-tab sync is automatic — change a value in one tab, all tabs update instantly.

### sessionStorage — `useSessionStorage()`

Tab-scoped. Cleared when the tab closes.

```tsx
import { useSessionStorage } from '@pyreon/storage'

const wizardStep = useSessionStorage('wizard-step', 0)
const formDraft = useSessionStorage('contact-draft', { name: '', message: '' })
```

### Cookies — `useCookie()`

Configurable expiry, path, domain, secure, sameSite. SSR-readable.

```tsx
import { useCookie } from '@pyreon/storage'

const locale = useCookie('locale', 'en', {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: '/',
  sameSite: 'lax',
})

const consent = useCookie('cookie-consent', false, {
  maxAge: 60 * 60 * 24 * 180, // 6 months
})
```

#### Cookie Options

| Option     | Type                          | Default | Description                         |
| ---------- | ----------------------------- | ------- | ----------------------------------- |
| `maxAge`   | `number`                      | —       | Max age in seconds                  |
| `expires`  | `Date`                        | —       | Expiry date (alternative to maxAge) |
| `path`     | `string`                      | `'/'`   | Cookie path                         |
| `domain`   | `string`                      | —       | Cookie domain                       |
| `secure`   | `boolean`                     | `false` | HTTPS only                          |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | SameSite policy                     |

#### SSR Support

Cookies are the only backend readable on the server:

```tsx
import { setCookieSource } from '@pyreon/storage'

// In your SSR request handler
setCookieSource(request.headers.get('cookie') ?? '')

// Now useCookie reads from the request headers
const locale = useCookie('locale', 'en')
```

### IndexedDB — `useIndexedDB()`

For large data that exceeds localStorage limits. Writes are debounced.

```tsx
import { useIndexedDB } from '@pyreon/storage'

const draft = useIndexedDB('article-draft', { title: '', body: '' })

// Signal updates immediately, IDB write is debounced
draft.set({ title: 'My Post', body: '...10KB of content...' })
```

#### IndexedDB Options

| Option       | Type     | Default            | Description          |
| ------------ | -------- | ------------------ | -------------------- |
| `dbName`     | `string` | `'pyreon-storage'` | Database name        |
| `storeName`  | `string` | `'kv'`             | Object store name    |
| `debounceMs` | `number` | `100`              | Write debounce in ms |

### Custom Backend — `createStorage()`

Build your own storage hook from any synchronous backend:

```tsx
import { createStorage } from '@pyreon/storage'

const useEncryptedStorage = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const secret = useEncryptedStorage('api-key', '')
```

### Memory Storage — `useMemoryStorage()`

In-memory storage for SSR and testing. Values are lost on page unload.

```tsx
import { useMemoryStorage } from '@pyreon/storage'

const temp = useMemoryStorage('key', 'default')
```

## Signal Deduplication

Same key always returns the same signal instance — no drift between components:

```tsx
// In Header component
const theme = useStorage('theme', 'light')

// In Settings component — same signal
const theme = useStorage('theme', 'light')

// These are the same object
```

## Custom Serialization

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
```

## Error Handling

Corrupt storage values won't crash your app:

```tsx
const value = useStorage('key', 'fallback', {
  onError: (error) => {
    console.warn('Storage read failed:', error)
    return 'custom-fallback' // or return undefined for default
  },
})
```

## Cleanup Utilities

```tsx
import { removeStorage, clearStorage } from '@pyreon/storage'

removeStorage('theme') // from localStorage
removeStorage('step', { type: 'session' }) // from sessionStorage
removeStorage('locale', { type: 'cookie' }) // delete cookie

clearStorage() // all managed localStorage entries
clearStorage('session') // all managed sessionStorage entries
clearStorage('all') // everything
```

## StorageSignal Type

All hooks return `StorageSignal<T>` — a full `Signal<T>` with an added `.remove()` method:

```ts
interface StorageSignal<T> extends Signal<T> {
  remove(): void // Clear from storage, reset to default
}
```

Works everywhere signals work: effects, computeds, JSX, stores.
