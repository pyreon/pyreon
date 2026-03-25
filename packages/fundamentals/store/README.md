# @pyreon/store

Global reactive state management built on `@pyreon/reactivity` signals. Composition API returning structured `StoreApi<T>`.

## Install

```bash
bun add @pyreon/store
```

## Quick Start

```ts
import { defineStore, signal, computed } from "@pyreon/store"

const useCounter = defineStore("counter", () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const increment = () => count.update((n) => n + 1)
  return { count, doubled, increment }
})

// Destructure what you need:
const { store, patch, subscribe, reset, dispose } = useCounter()
store.count()       // 0
store.increment()
store.doubled()     // 2
patch({ count: 10 }) // batch-update
```

Stores are singletons. The setup function runs once per store ID; subsequent calls return the cached instance.

## API

### `defineStore(id, setup)`

Define a store with a unique string ID and a setup function. Returns a hook that produces a `StoreApi<T>`:

| Property | Description |
| --- | --- |
| `store` | The user-defined state, computed values, and actions |
| `id` | Store identifier |
| `state` | Read-only snapshot of all signal values |
| `patch(obj \| fn)` | Batch-update signals (object or function form) |
| `subscribe(cb, opts?)` | Listen to state mutations. `{ immediate: true }` fires instantly |
| `onAction(cb)` | Intercept action calls (sync + async). Returns unsubscribe |
| `reset()` | Reset all signals to initial values |
| `dispose()` | Teardown: unsubscribe all, remove from registry |

### `addStorePlugin(plugin)`

Register a global plugin. Plugins receive the `StoreApi` when a store is created.

### `resetStore(id)`

Destroy a store by ID. The next call to `useStore()` will re-run the setup function.

### `resetAllStores()`

Destroy all stores. Useful for testing and SSR isolation.

### `setStoreRegistryProvider(fn)`

Override the store registry provider for concurrent SSR. Each request can get its own isolated registry via `AsyncLocalStorage`.

```ts
import { AsyncLocalStorage } from "node:async_hooks"
import { setStoreRegistryProvider } from "@pyreon/store"

const als = new AsyncLocalStorage<Map<string, unknown>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())
```

## Re-exports

The following are re-exported from `@pyreon/reactivity` for convenience:

- `signal`, `computed`, `effect`, `batch`
- `Signal` (type)
