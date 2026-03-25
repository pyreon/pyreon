# @pyreon/store

Composition-style global state management built on `@pyreon/reactivity` signals.

## Installation

```bash
bun add @pyreon/store
```

## Quick Start

```ts
import { defineStore, signal, computed } from "@pyreon/store"

const useCounter = defineStore("counter", () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, double, increment }
})

// Anywhere in your app:
const { store, patch, subscribe } = useCounter()
store.increment()
store.count() // 1
patch({ count: 10 })
```

## API

### `defineStore(id, setup)`

Define a singleton store with a unique id and a composition-style setup function.

```ts
const useAuth = defineStore("auth", () => {
  const user = signal<User | null>(null)
  const isLoggedIn = computed(() => user() !== null)

  const login = async (credentials: Credentials) => {
    const result = await api.login(credentials)
    user.set(result.user)
  }

  const logout = () => user.set(null)

  return { user, isLoggedIn, login, logout }
})
```

**Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique store identifier |
| `setup` | `() => T` | Setup function returning the store's state, computed values, and actions |

**Returns:** `() => StoreApi<T>` — a hook function. Every call returns the same singleton instance.

The setup function runs once (on first access). Subsequent calls return the cached instance.

### `resetStore(id)`

Destroy a store by id. The next call to the store hook re-runs the setup function with fresh state.

```ts
resetStore("counter")
// Next useCounter() call creates a new instance
```

### `resetAllStores()`

Destroy all stores. Useful for test cleanup and HMR.

```ts
afterEach(() => resetAllStores())
```

### `setStoreRegistryProvider(fn)`

Override the store registry for concurrent SSR. Each request gets an isolated registry, preventing state leakage between requests.

```ts
import { AsyncLocalStorage } from "node:async_hooks"
import { setStoreRegistryProvider } from "@pyreon/store"

const als = new AsyncLocalStorage<Map<string, unknown>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())

// Wrap each request:
als.run(new Map(), () => renderToString(app))
```

## Re-exports

`@pyreon/store` re-exports these from `@pyreon/reactivity` for convenience:

- `signal`, `computed`, `effect`, `batch`
- `Signal` (type)

## Patterns

### Composing stores

Stores can reference other stores:

```ts
const useUser = defineStore("user", () => {
  const name = signal("")
  return { name }
})

const useGreeting = defineStore("greeting", () => {
  const { store: user } = useUser()
  const message = computed(() => `Hello, ${user.name()}!`)
  return { message }
})
```

### Async actions

Actions can be async — signals update reactively when the promise resolves:

```ts
const useTodos = defineStore("todos", () => {
  const items = signal<Todo[]>([])
  const loading = signal(false)

  const fetch = async () => {
    loading.set(true)
    items.set(await api.getTodos())
    loading.set(false)
  }

  return { items, loading, fetch }
})
```

## StoreApi Properties

Every store hook returns a `StoreApi<T>` with these properties:

### `store`

The user-defined state, computed values, and actions as returned by the setup function.

```ts
const { store } = useCounter()
store.count() // 0
store.increment()
```

### `id`

The store's unique identifier string, as passed to `defineStore`.

```ts
const api = useCounter()
api.id // "counter"
```

### `state`

Get a snapshot of all signal values as a plain object:

```ts
const api = useCounter()
api.state // { count: 0 }
```

### `patch(obj)` / `patch(fn)`

Batch-update multiple signals at once. Accepts either a partial object or a mutator function:

```ts
const { store, patch } = useCounter()

// Object form — merge partial state
patch({ count: 10 })

// Function form — access signal references directly
patch((signals) => {
  signals.count.set(signals.count.peek() + 5)
})
```

All writes within `patch` are batched into a single reactive flush.

### `subscribe(callback, options?)`

Watch for state changes. The callback receives a mutation descriptor and the current state:

```ts
const { subscribe } = useCounter()

subscribe((mutation, state) => {
  console.log(mutation.storeId) // "counter"
  console.log(mutation.type)    // "direct" | "patch"
  console.log(mutation.events)  // change details
  console.log(state)            // { count: 10 }
})

// Fire immediately with current state:
subscribe(callback, { immediate: true })
```

Returns an unsubscribe function.

### `onAction(callback)`

Intercept actions with `after` and `onError` hooks:

```ts
const { onAction } = useCounter()

onAction(({ name, args, after, onError }) => {
  console.log(`Action "${name}" called with`, args)

  after((result) => {
    console.log(`Action "${name}" completed with`, result)
  })

  onError((error) => {
    console.error(`Action "${name}" failed:`, error)
  })
})
```

Returns an unsubscribe function.

### `reset()`

Reset all signals to their initial values:

```ts
const { store, reset } = useCounter()
store.increment()
store.count() // 1
reset()
store.count() // 0
```

### `dispose()`

Remove the store from the registry and clean up all subscriptions:

```ts
const api = useCounter()
api.dispose()
// Store is removed — next hook call creates a fresh instance
```

## Plugins

### `addStorePlugin(plugin)`

Register a global plugin that runs on every store creation. Plugins receive the full `StoreApi` and can extend stores with additional properties or side effects:

```ts
import { addStorePlugin } from "@pyreon/store"

addStorePlugin((api) => {
  // Log every action
  api.onAction(({ name, args }) => {
    console.log(`[${api.id}] ${name}`, args)
  })
})
```

Plugins run once per store instance during creation.

## Devtools

Import from `@pyreon/store/devtools` for runtime inspection:

```ts
import {
  getRegisteredStores,
  getStoreById,
  onStoreChange,
} from "@pyreon/store/devtools"

getRegisteredStores()       // Array of all active store IDs
const api = getStoreById("counter") // Get a specific StoreApi
api?.state                  // Snapshot of signal values
api?.reset()                // Reset from devtools

onStoreChange(() => {
  console.log("Stores changed:", getRegisteredStores())
}) // Returns unsubscribe function
```

## Gotchas

**Stores are singletons.** Two `defineStore` calls with the same id share the same instance — the first setup function wins.

**Reset in tests.** Always call `resetAllStores()` in `afterEach` to prevent test pollution.

**SSR isolation requires a provider.** Without `setStoreRegistryProvider`, stores are shared across all requests in concurrent SSR.
