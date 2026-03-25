# @pyreon/storage

Reactive client-side storage -- localStorage, sessionStorage, cookies, IndexedDB, and custom backends. Every stored value is a reactive signal that persists writes automatically.

## Installation

```bash
bun add @pyreon/storage
```

## Usage

### localStorage (cross-tab synced)

```ts
import { useStorage } from "@pyreon/storage"

const theme = useStorage("theme", "light")
theme()            // read reactively
theme.set("dark")  // updates signal + localStorage
theme.remove()     // remove from storage
```

### sessionStorage (tab-scoped)

```ts
import { useSessionStorage } from "@pyreon/storage"

const wizardStep = useSessionStorage("wizard-step", 0)
```

### Cookies (SSR-readable)

```ts
import { useCookie, setCookieSource } from "@pyreon/storage"

const locale = useCookie("locale", "en", {
  maxAge: 365 * 86400,
  path: "/",
  sameSite: "lax",
  secure: true,
})

// SSR: provide cookie header for server-side reading
setCookieSource(request.headers.get("cookie") ?? "")
```

### IndexedDB (large data, debounced)

```ts
import { useIndexedDB } from "@pyreon/storage"

const draft = useIndexedDB("article-draft", { title: "", body: "" })
draft.set({ title: "New Article", body: "Content..." })
```

### Custom Backend

```ts
import { createStorage, useMemoryStorage } from "@pyreon/storage"

// Custom backend (e.g. encrypted storage, remote sync)
const useEncrypted = createStorage({
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})

const secret = useEncrypted("api-key", "")

// In-memory storage (SSR/testing)
const temp = useMemoryStorage("key", "default")
```

### Cleanup

```ts
import { removeStorage, clearStorage } from "@pyreon/storage"

removeStorage("theme")          // remove a single key
clearStorage("local")           // clear all localStorage
clearStorage("session")         // clear all sessionStorage
```

## Signal Deduplication

Same key returns the same signal instance across components -- no drift:

```ts
// In component A:
const theme = useStorage("theme", "light")
// In component B:
const theme = useStorage("theme", "light")
// Both reference the exact same signal
```

## StorageSignal

All hooks return `StorageSignal<T>` which extends `Signal<T>` with:

- `signal()` -- reactive read
- `signal.set(value)` -- write (persists automatically)
- `signal.remove()` -- remove from storage and reset to default

## API Reference

| Export | Description |
| --- | --- |
| `useStorage(key, default, options?)` | localStorage signal, cross-tab synced |
| `useSessionStorage(key, default, options?)` | sessionStorage signal |
| `useCookie(key, default, options?)` | Cookie signal with maxAge, path, sameSite, secure |
| `useIndexedDB(key, default, options?)` | IndexedDB signal for large data |
| `createStorage(backend)` | Factory for custom storage backends |
| `useMemoryStorage(key, default)` | In-memory storage for SSR/testing |
| `setCookieSource(header)` | SSR cookie source |
| `removeStorage(key, options?)` | Remove a stored value |
| `clearStorage(type?)` | Clear all storage of a given type |
