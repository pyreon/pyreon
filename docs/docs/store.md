---
title: Store
description: Global state management built on Pyreon's reactivity signals.
---

`@pyreon/store` provides Pinia-inspired composition-style global state management. Stores are singletons backed by `@pyreon/reactivity` signals, giving you fine-grained reactivity with zero boilerplate. Define your state, computed values, and actions in a setup function, and access them anywhere in your application through a hook.

<PackageBadge name="@pyreon/store" href="/docs/store" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/store
```
```bash [bun]
bun add @pyreon/store
```
```bash [pnpm]
pnpm add @pyreon/store
```
```bash [yarn]
yarn add @pyreon/store
```
:::

## Quick Start

```ts
import { defineStore, signal, computed } from '@pyreon/store'

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)

  const increment = () => count.update(n => n + 1)
  const decrement = () => count.update(n => n - 1)

  return { count, doubled, increment, decrement }
})

// Use it anywhere:
const { store, patch, reset } = useCounter()
store.increment()
console.log(store.count())    // 1
console.log(store.doubled())  // 2
```

## Core Concepts

### Defining a Store

Use `defineStore` to create a store with a unique ID and a setup function. The setup function runs once (on first use) and returns an object of signals, computed values, and actions.

```ts
import { defineStore, signal, computed } from '@pyreon/store'

const useCounter = defineStore('counter', () => {
  // State — reactive signals
  const count = signal(0)

  // Computed — derived reactive values
  const doubled = computed(() => count() * 2)
  const isPositive = computed(() => count() > 0)

  // Actions — plain functions that mutate state
  const increment = () => count.update(n => n + 1)
  const decrement = () => count.update(n => n - 1)
  const setTo = (value: number) => count.set(value)

  return { count, doubled, isPositive, increment, decrement, setTo }
})
```

The `id` string must be unique across your application. If two `defineStore` calls share the same ID, the second call's setup function is never executed -- it receives the state created by the first:

```ts
const useA = defineStore('shared-id', () => ({ val: signal('first') }))
const useB = defineStore('shared-id', () => ({ val: signal('second') }))

const a = useA()
const b = useB()
console.log(a === b)              // true
console.log(a.store.val())        // "first" — second setup never ran
```

### The StoreApi Pattern

Every store hook returns a `StoreApi<T>` object that separates user state from framework methods:

```ts
const { store, id, state, patch, subscribe, onAction, reset, dispose } = useCounter()

// User state is under `store`:
store.count()        // read a signal
store.increment()    // call an action

// Framework methods are at the top level:
patch({ count: 5 })  // batch-update signals
subscribe(cb)        // listen to state changes
reset()              // reset to initial values
```

This clear separation avoids naming collisions between your state and the framework API.

### Singleton Behavior

Stores are singletons. The setup function runs exactly once, on the first call to the hook. Every subsequent call returns the same instance:

```ts
let setupRuns = 0
const useStore = defineStore('singleton-demo', () => {
  setupRuns++
  const count = signal(0)
  return { count }
})

useStore() // setupRuns === 1
useStore() // setupRuns === 1 (still 1, setup did not re-run)
useStore() // setupRuns === 1
```

State mutations are visible across all consumers because they share the same signal instances:

```ts
const useStore = defineStore('shared-state', () => {
  const count = signal(0)
  return { count }
})

const a = useStore()
const b = useStore()

a.store.count.set(42)
console.log(b.store.count()) // 42 — same signal instance
```

### Using in Components

Call the store hook inside a component's setup function. Destructure `store` to access your signals and actions, and use the framework methods (`patch`, `reset`, etc.) as needed:

```tsx
import { defineComponent } from '@pyreon/core'

const Counter = defineComponent(() => {
  const { store, reset } = useCounter()

  return () => (
    <div>
      <p>Count: {store.count()}</p>
      <p>Doubled: {store.doubled()}</p>
      <div>
        <button onClick={store.increment}>+</button>
        <button onClick={store.decrement}>-</button>
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  )
})
```

## Re-exported Reactivity Primitives

`@pyreon/store` re-exports all essential primitives from `@pyreon/reactivity` for convenience, so you do not need a separate import:

| Export | Description |
| --- | --- |
| `signal(value)` | Create a reactive signal |
| `computed(fn)` | Create a derived computed signal |
| `effect(fn)` | Run a side effect that tracks signal dependencies |
| `batch(fn)` | Batch multiple signal writes into a single notification flush |

```ts
import { signal, computed, effect, batch } from '@pyreon/store'
```

The `Signal` type is also re-exported for TypeScript usage:

```ts
import type { Signal } from '@pyreon/store'
```

## Real-World Store Examples

### Authentication Store

```ts
import { defineStore, signal, computed, effect } from '@pyreon/store'

interface User {
  id: string
  email: string
  name: string
  avatar?: string
}

const useAuth = defineStore('auth', () => {
  const user = signal<User | null>(null)
  const token = signal<string | null>(null)
  const loading = signal(false)
  const error = signal<string | null>(null)

  // Computed
  const isAuthenticated = computed(() => user() !== null && token() !== null)
  const displayName = computed(() => user()?.name ?? 'Guest')

  // Actions
  async function login(email: string, password: string) {
    loading.set(true)
    error.set(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new Error('Invalid credentials')
      }

      const data = await response.json()
      token.set(data.token)
      user.set(data.user)
      localStorage.setItem('auth_token', data.token)
    } catch (e) {
      error.set(e instanceof Error ? e.message : 'Login failed')
    } finally {
      loading.set(false)
    }
  }

  function logout() {
    user.set(null)
    token.set(null)
    localStorage.removeItem('auth_token')
  }

  async function restoreSession() {
    const savedToken = localStorage.getItem('auth_token')
    if (!savedToken) return

    loading.set(true)
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
      if (response.ok) {
        const data = await response.json()
        token.set(savedToken)
        user.set(data.user)
      }
    } finally {
      loading.set(false)
    }
  }

  return {
    user, token, loading, error,
    isAuthenticated, displayName,
    login, logout, restoreSession,
  }
})
```

### Shopping Cart Store

```ts
import { defineStore, signal, computed, batch } from '@pyreon/store'

interface CartItem {
  productId: string
  name: string
  price: number
  quantity: number
}

const useCart = defineStore('cart', () => {
  const items = signal<CartItem[]>([])
  const couponCode = signal<string | null>(null)
  const discount = signal(0)

  // Computed values
  const itemCount = computed(() =>
    items().reduce((sum, item) => sum + item.quantity, 0)
  )

  const subtotal = computed(() =>
    items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  )

  const total = computed(() => {
    const sub = subtotal()
    return sub - sub * (discount() / 100)
  })

  const isEmpty = computed(() => items().length === 0)

  // Actions
  function addItem(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    const current = items()
    const existing = current.find(i => i.productId === product.productId)

    if (existing) {
      items.set(
        current.map(i =>
          i.productId === product.productId
            ? { ...i, quantity: i.quantity + quantity }
            : i
        )
      )
    } else {
      items.set([...current, { ...product, quantity }])
    }
  }

  function removeItem(productId: string) {
    items.set(items().filter(i => i.productId !== productId))
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId)
      return
    }
    items.set(
      items().map(i =>
        i.productId === productId ? { ...i, quantity } : i
      )
    )
  }

  function clearCart() {
    batch(() => {
      items.set([])
      couponCode.set(null)
      discount.set(0)
    })
  }

  async function applyCoupon(code: string) {
    const response = await fetch(`/api/coupons/${code}`)
    if (response.ok) {
      const data = await response.json()
      batch(() => {
        couponCode.set(code)
        discount.set(data.discountPercent)
      })
      return true
    }
    return false
  }

  return {
    items, couponCode, discount,
    itemCount, subtotal, total, isEmpty,
    addItem, removeItem, updateQuantity, clearCart, applyCoupon,
  }
})
```

### Theme Store

```ts
import { defineStore, signal, computed, effect } from '@pyreon/store'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const useTheme = defineStore('theme', () => {
  const preference = signal<Theme>('system')

  const systemPrefersDark = signal(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  const resolved = computed<ResolvedTheme>(() => {
    const pref = preference()
    if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
    return pref
  })

  const isDark = computed(() => resolved() === 'dark')

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', (e) => {
      systemPrefersDark.set(e.matches)
    })
  }

  // Apply theme class to document
  effect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', isDark())
  })

  function setTheme(theme: Theme) {
    preference.set(theme)
    localStorage.setItem('theme', theme)
  }

  function restore() {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) preference.set(saved)
  }

  return { preference, resolved, isDark, setTheme, restore }
})
```

## Composing Stores

Stores can use other stores. Simply call the other store's hook inside your setup function:

```ts
const useUser = defineStore('user', () => {
  const name = signal('Alice')
  const email = signal('alice@example.com')
  return { name, email }
})

const useNotifications = defineStore('notifications', () => {
  const { store: user } = useUser() // Use the user store

  const messages = signal<string[]>([])

  const greeting = computed(() => `Hello, ${user.name()}! You have ${messages().length} messages.`)

  function addMessage(msg: string) {
    messages.set([...messages(), msg])
  }

  function clear() {
    messages.set([])
  }

  return { messages, greeting, addMessage, clear }
})
```

Because stores are singletons, calling `useUser()` inside `useNotifications` is safe -- it returns the same instance whether called from a component or from another store's setup function.

### Layered Architecture Example

```ts
// Base layer: API client store
const useApi = defineStore('api', () => {
  const baseUrl = signal('/api')
  const authToken = signal<string | null>(null)

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = authToken()
    const response = await fetch(`${baseUrl()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  return { baseUrl, authToken, request }
})

// Domain layer: uses API store
const useTodos = defineStore('todos', () => {
  const { store: api } = useApi()

  const items = signal<{ id: number; text: string; done: boolean }[]>([])
  const loading = signal(false)

  const pending = computed(() => items().filter(t => !t.done))
  const completed = computed(() => items().filter(t => t.done))

  async function fetchAll() {
    loading.set(true)
    try {
      const data = await api.request<typeof items extends () => infer T ? T : never>('/todos')
      items.set(data)
    } finally {
      loading.set(false)
    }
  }

  async function add(text: string) {
    const todo = await api.request<{ id: number; text: string; done: boolean }>('/todos', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    items.set([...items(), todo])
  }

  async function toggle(id: number) {
    const current = items().find(t => t.id === id)
    if (!current) return
    await api.request(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !current.done }),
    })
    items.set(items().map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  return { items, loading, pending, completed, fetchAll, add, toggle }
})
```

## Async Operations in Stores

Stores support async operations naturally. Actions can be `async` functions, and you manage loading/error state with signals:

```ts
const useProducts = defineStore('products', () => {
  const items = signal<Product[]>([])
  const loading = signal(false)
  const error = signal<string | null>(null)
  const currentPage = signal(1)

  async function fetchProducts(page = 1) {
    loading.set(true)
    error.set(null)

    try {
      const response = await fetch(`/api/products?page=${page}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()

      batch(() => {
        items.set(data.items)
        currentPage.set(page)
      })
    } catch (e) {
      error.set(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      loading.set(false)
    }
  }

  async function fetchNextPage() {
    await fetchProducts(currentPage() + 1)
  }

  return { items, loading, error, currentPage, fetchProducts, fetchNextPage }
})
```

### Optimistic Updates

```ts
const useTodos = defineStore('todos-optimistic', () => {
  const items = signal<{ id: string; text: string; done: boolean }[]>([])

  async function toggle(id: string) {
    // Optimistically update the UI
    const previous = items()
    items.set(previous.map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    ))

    try {
      await fetch(`/api/todos/${id}/toggle`, { method: 'POST' })
    } catch {
      // Revert on failure
      items.set(previous)
    }
  }

  return { items, toggle }
})
```

## Computed Getters Pattern

Computed values derive reactive state without manual subscription management:

```ts
const useInventory = defineStore('inventory', () => {
  const products = signal<{ id: string; name: string; stock: number; price: number }[]>([])

  // Simple computed
  const totalProducts = computed(() => products().length)

  // Filtered computed
  const inStock = computed(() => products().filter(p => p.stock > 0))
  const outOfStock = computed(() => products().filter(p => p.stock === 0))

  // Aggregated computed
  const totalValue = computed(() =>
    products().reduce((sum, p) => sum + p.stock * p.price, 0)
  )

  // Computed from other computed
  const lowStock = computed(() =>
    inStock().filter(p => p.stock < 10)
  )

  const summary = computed(() => ({
    total: totalProducts(),
    available: inStock().length,
    unavailable: outOfStock().length,
    lowStock: lowStock().length,
    inventoryValue: totalValue(),
  }))

  return {
    products,
    totalProducts, inStock, outOfStock, totalValue, lowStock, summary,
  }
})
```

Computed values are lazy and cached -- they only re-evaluate when their dependencies change.

## Effects with Stores

Use `effect` to run side effects that react to store state changes:

```ts
import { effect } from '@pyreon/store'

const useSettings = defineStore('settings', () => {
  const locale = signal('en')
  const fontSize = signal(16)

  // Persist to localStorage whenever values change
  effect(() => {
    localStorage.setItem('settings', JSON.stringify({
      locale: locale(),
      fontSize: fontSize(),
    }))
  })

  // Restore from localStorage on initialization
  const saved = localStorage.getItem('settings')
  if (saved) {
    const parsed = JSON.parse(saved)
    locale.set(parsed.locale)
    fontSize.set(parsed.fontSize)
  }

  return { locale, fontSize }
})
```

### Logging and Debugging with Effects

```ts
const useDebugStore = defineStore('debug-counter', () => {
  const count = signal(0)

  // Log every change in development
  if (import.meta.env.DEV) {
    effect(() => {
      console.log('[debug-counter] count changed to:', count())
    })
  }

  const increment = () => count.update(n => n + 1)

  return { count, increment }
})
```

## Batch Updates

When updating multiple signals simultaneously, use `batch` to defer reactive notifications until all writes are complete. This prevents intermediate renders:

```ts
import { batch } from '@pyreon/store'

const useForm = defineStore('form', () => {
  const firstName = signal('')
  const lastName = signal('')
  const email = signal('')
  const errors = signal<Record<string, string>>({})

  function resetForm() {
    // Without batch: each set() triggers a re-render (4 total)
    // With batch: all 4 updates trigger a single re-render
    batch(() => {
      firstName.set('')
      lastName.set('')
      email.set('')
      errors.set({})
    })
  }

  function loadUser(user: { firstName: string; lastName: string; email: string }) {
    batch(() => {
      firstName.set(user.firstName)
      lastName.set(user.lastName)
      email.set(user.email)
    })
  }

  return { firstName, lastName, email, errors, resetForm, loadUser }
})
```

## TypeScript Patterns

### Typing Store Return Values

The store's return type is inferred automatically from the setup function. The hook returns a `StoreApi<T>`:

```ts
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, doubled, increment }
})

// Type of useCounter() is StoreApi<{
//   count: Signal<number>
//   doubled: ComputedSignal<number>
//   increment: () => void
// }>
```

### Extracting Store Types

For cases where you need to reference the store's type elsewhere:

```ts
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const increment = () => count.update(n => n + 1)
  return { count, increment }
})

// Extract the StoreApi type from the hook
type CounterApi = ReturnType<typeof useCounter>
// StoreApi<{ count: Signal<number>; increment: () => void }>

// Extract just the user state type
type CounterStore = CounterApi['store']
// { count: Signal<number>; increment: () => void }

// Use in function parameters
function logCount(api: CounterApi) {
  console.log(api.store.count())
}
```

### Generic Store Factories

Create reusable store patterns with generics:

```ts
function createCrudStore<T extends { id: string }>(name: string, apiPath: string) {
  return defineStore(name, () => {
    const items = signal<T[]>([])
    const loading = signal(false)
    const error = signal<string | null>(null)

    const byId = computed(() => {
      const map = new Map<string, T>()
      for (const item of items()) {
        map.set(item.id, item)
      }
      return map
    })

    async function fetchAll() {
      loading.set(true)
      error.set(null)
      try {
        const res = await fetch(apiPath)
        items.set(await res.json())
      } catch (e) {
        error.set(e instanceof Error ? e.message : 'Failed')
      } finally {
        loading.set(false)
      }
    }

    async function create(data: Omit<T, 'id'>) {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const created = await res.json() as T
      items.set([...items(), created])
      return created
    }

    async function remove(id: string) {
      await fetch(`${apiPath}/${id}`, { method: 'DELETE' })
      items.set(items().filter(i => i.id !== id))
    }

    function getById(id: string): T | undefined {
      return byId().get(id)
    }

    return { items, loading, error, byId, fetchAll, create, remove, getById }
  })
}

// Usage:
interface Product { id: string; name: string; price: number }
const useProducts = createCrudStore<Product>('products', '/api/products')

interface Category { id: string; label: string }
const useCategories = createCrudStore<Category>('categories', '/api/categories')
```

### Using the Signal Type

```ts
import { signal } from '@pyreon/store'
import type { Signal } from '@pyreon/store'

// Type a signal explicitly
const count: Signal<number> = signal(0)

// Use Signal type in interfaces
interface FormField<T> {
  value: Signal<T>
  error: Signal<string | null>
  touched: Signal<boolean>
}

function createField<T>(initial: T): FormField<T> {
  return {
    value: signal(initial),
    error: signal(null),
    touched: signal(false),
  }
}
```

## StoreApi Methods

Every store hook returns a `StoreApi<T>` object with the user's state under `.store` and framework methods at the top level. These are added automatically -- no extra setup needed.

### `id`

The store's unique identifier:

```ts
const api = useCounter()
console.log(api.id) // "counter"
```

### `state`

A readonly snapshot of all signal values in the store:

```ts
const api = useCounter()
console.log(api.state) // { count: 0 }

api.store.increment()
console.log(api.state) // { count: 1 }
```

### `patch`

Batch-update multiple signals in a single notification. Accepts either an object or a function:

```ts
const { patch } = useUser()

// Object form — sets matching signal keys
patch({ firstName: "Alice", lastName: "Smith" })

// Function form — receives signal references for direct manipulation
patch((signals) => {
  signals.firstName.set("Alice")
  signals.lastName.set("Smith")
})
```

Patch mutations are batched via `batch()` and emit a single `subscribe` notification with `type: "patch"`.

### `subscribe`

Listen to all state changes in the store. The callback receives the mutation info and a snapshot of the current state:

```ts
const { subscribe } = useCounter()

const unsubscribe = subscribe((mutation, state) => {
  console.log(mutation.storeId)  // "counter"
  console.log(mutation.type)     // "direct" or "patch"
  console.log(mutation.events)   // [{ key: "count", oldValue: 0, newValue: 1 }]
  console.log(state)             // { count: 1 }
})

// Trigger immediately with current state:
subscribe(callback, { immediate: true })

// Stop listening:
unsubscribe()
```

### `onAction`

Intercept action calls with before/after/error hooks:

```ts
const { onAction } = useCounter()

const unsubscribe = onAction((context) => {
  console.log(`Action "${context.name}" called with args:`, context.args)

  context.after((result) => {
    console.log(`Action "${context.name}" completed with:`, result)
  })

  context.onError((error) => {
    console.error(`Action "${context.name}" failed:`, error)
  })
})
```

### `reset`

Reset all signals to their initial values (the values from when `setup()` first ran):

```ts
const { store, reset } = useCounter()
store.increment()
store.increment()
console.log(store.count()) // 2

reset()
console.log(store.count()) // 0
```

### `dispose`

Tear down the store entirely -- unsubscribes all signal listeners, clears subscribers and action listeners, and removes the store from the registry:

```ts
const { dispose } = useCounter()
dispose()

// Next call to useCounter() will re-run setup
```

## Plugins

Register global plugins that run when any store is first created. Plugins receive the full `StoreApi`:

```ts
import { addStorePlugin } from "@pyreon/store"

// Logger plugin
addStorePlugin(({ store, id, subscribe }) => {
  subscribe((mutation, state) => {
    console.log(`[${id}]`, mutation.type, mutation.events)
  })
})

// Persistence plugin
addStorePlugin(({ id, patch, subscribe }) => {
  // Restore from localStorage
  const saved = localStorage.getItem(`store:${id}`)
  if (saved) {
    patch(JSON.parse(saved))
  }

  // Persist on change
  subscribe((_mutation, state) => {
    localStorage.setItem(`store:${id}`, JSON.stringify(state))
  })
})
```

### StorePlugin type

```ts
type StorePlugin = (api: StoreApi<Record<string, unknown>>) => void
```

## Resetting Stores

### `resetStore(id)`

Destroy a single store by its ID. The next call to the store hook will re-run the setup function, producing fresh state:

```ts
import { resetStore } from '@pyreon/store'

resetStore('counter')

// Next call to useCounter() will re-run setup, starting from count = 0
const { store } = useCounter()
console.log(store.count()) // 0
```

Resetting a non-existent ID is a safe no-op:

```ts
resetStore('does-not-exist') // No error thrown
```

### `resetAllStores()`

Destroy all stores at once. Every store hook will re-run its setup function on next call:

```ts
import { resetAllStores } from '@pyreon/store'

resetAllStores()
```

## Testing Stores

### Basic Test Setup

Use `resetAllStores()` in `afterEach` to ensure test isolation:

```ts
import { describe, test, expect, afterEach } from 'vitest'
import { resetAllStores } from '@pyreon/store'

afterEach(() => {
  resetAllStores()
})

describe('useCounter', () => {
  test('starts at zero', () => {
    const { store } = useCounter()
    expect(store.count()).toBe(0)
  })

  test('increments', () => {
    const { store } = useCounter()
    store.increment()
    store.increment()
    expect(store.count()).toBe(2)
  })

  test('computed values update', () => {
    const { store } = useCounter()
    store.count.set(5)
    expect(store.doubled()).toBe(10)
  })

  test('reset produces fresh state', () => {
    const { store } = useCounter()
    store.count.set(99)
    resetStore('counter')
    const { store: fresh } = useCounter()
    expect(fresh.count()).toBe(0)
  })
})
```

### Testing Async Actions

```ts
import { describe, test, expect, afterEach, vi } from 'vitest'
import { resetAllStores } from '@pyreon/store'

afterEach(() => {
  resetAllStores()
  vi.restoreAllMocks()
})

describe('useProducts', () => {
  test('fetchProducts loads items', async () => {
    const mockProducts = [
      { id: '1', name: 'Widget', price: 9.99 },
      { id: '2', name: 'Gadget', price: 19.99 },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: mockProducts }), { status: 200 })
    )

    const { store } = useProducts()

    expect(store.loading()).toBe(false)
    const promise = store.fetchProducts()
    expect(store.loading()).toBe(true)

    await promise
    expect(store.loading()).toBe(false)
    expect(store.items()).toEqual(mockProducts)
  })

  test('fetchProducts handles errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const { store } = useProducts()
    await store.fetchProducts()
    expect(store.error()).toBe('Network error')
  })
})
```

### Testing Composed Stores

```ts
describe('useNotifications (depends on useUser)', () => {
  test('greeting includes user name', () => {
    const { store: user } = useUser()
    user.name.set('Bob')

    const { store: notifications } = useNotifications()
    expect(notifications.greeting()).toContain('Bob')
  })

  test('greeting updates when user name changes', () => {
    const { store: user } = useUser()
    const { store: notifications } = useNotifications()

    user.name.set('Alice')
    expect(notifications.greeting()).toContain('Alice')

    user.name.set('Charlie')
    expect(notifications.greeting()).toContain('Charlie')
  })
})
```

### Testing with Custom Registry Providers

For advanced isolation scenarios, you can swap the registry provider in tests:

```ts
import { setStoreRegistryProvider, resetAllStores } from '@pyreon/store'

describe('isolated registry tests', () => {
  afterEach(() => {
    // Restore the default registry behavior
    setStoreRegistryProvider(() => new Map())
  })

  test('custom provider isolates state', () => {
    const registryA = new Map<string, unknown>()
    const registryB = new Map<string, unknown>()

    const useStore = defineStore('isolated', () => ({ val: signal(0) }))

    setStoreRegistryProvider(() => registryA)
    useStore().store.val.set(10)

    setStoreRegistryProvider(() => registryB)
    expect(useStore().store.val()).toBe(0) // Fresh state in registry B

    setStoreRegistryProvider(() => registryA)
    expect(useStore().store.val()).toBe(10) // Preserved state in registry A
  })
})
```

## SSR with Concurrent Requests

### The Problem

By default, stores use a module-level singleton registry. This works for client-side rendering and single-threaded SSR. However, for concurrent SSR (multiple requests handled in parallel), store state would leak between requests since all requests share the same module-level `Map`.

### The Solution: `setStoreRegistryProvider`

Use `setStoreRegistryProvider` to inject a per-request isolated registry backed by `AsyncLocalStorage`:

```ts
import { setStoreRegistryProvider } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<Map<string, unknown>>()

setStoreRegistryProvider(() => als.getStore() ?? new Map())
```

### Full Server Integration

```ts
import { setStoreRegistryProvider, resetAllStores } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'
import { renderToString } from '@pyreon/runtime-server'
import express from 'express'
import App from './App'

const als = new AsyncLocalStorage<Map<string, unknown>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())

const app = express()

app.get('*', (req, res) => {
  als.run(new Map(), async () => {
    try {
      // All stores created during this request are fully isolated
      const html = await renderToString(App)
      res.send(`<!DOCTYPE html><html><body>${html}</body></html>`)
    } finally {
      // Clean up (optional — the Map is GC'd when the async context ends)
      resetAllStores()
    }
  })
})

app.listen(3000)
```

This pattern is typically handled automatically by `@pyreon/runtime-server`. You only need to set it up manually if building a custom server integration.

### How It Works Internally

The store registry is a simple `Map<string, unknown>` accessed through a provider function:

```ts
// Default: module-level singleton
const _defaultRegistry = new Map<string, unknown>()
let _registryProvider: () => Map<string, unknown> = () => _defaultRegistry

// When you call setStoreRegistryProvider, you replace this function:
setStoreRegistryProvider(() => als.getStore() ?? new Map())

// Every defineStore hook calls getRegistry() to find the right Map:
function getRegistry(): Map<string, unknown> {
  return _registryProvider()
}
```

With `AsyncLocalStorage`, each request's `als.run(new Map(), ...)` creates a new `Map` that is only visible within that async context. Two simultaneous requests each get their own store instances.

## Debugging Stores

### Development Logging

Add an effect to log state changes during development:

```ts
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const increment = () => count.update(n => n + 1)

  if (import.meta.env.DEV) {
    effect(() => {
      console.group('[store:counter]')
      console.log('count:', count())
      console.groupEnd()
    })
  }

  return { count, increment }
})
```

### Store Inspector Utility

Build a simple inspector that snapshots all exposed state:

```ts
function inspectStore<T extends Record<string, unknown>>(api: StoreApi<T>): Record<string, unknown> {
  return api.state
}

// Usage:
const api = useCounter()
console.table(inspectStore(api))
// | key   | value |
// |-------|-------|
// | count | 0     |
```

## API Reference

### `defineStore(id, setup)`

Define a store with a unique ID and a setup function.

- **`id`** (`string`) -- Unique identifier for the store. Must be unique across the application.
- **`setup`** (`() => T`) -- Factory function that returns the store's public API. Runs once per store lifetime (until reset). `T` must extend `Record<string, unknown>`.
- **Returns** `() => StoreApi<T>` -- A hook function that returns the `StoreApi` wrapping the singleton store state.

### `StoreApi<T>`

The structured result returned by every store hook.

| Property | Type | Description |
|----------|------|-------------|
| `store` | `T` | The user-defined store state, computeds, and actions |
| `id` | `string` | The store's unique identifier string |
| `state` | `Record<string, unknown>` | Readonly snapshot of all signal values |
| `patch(obj)` | `(partial: Record<string, unknown>) => void` | Batch-set signals from an object |
| `patch(fn)` | `(fn: (signals) => void) => void` | Batch-set signals via function receiving signal refs |
| `subscribe(cb, opts?)` | `(cb, opts?) => () => void` | Listen to state changes, returns unsubscribe |
| `onAction(cb)` | `(cb) => () => void` | Intercept action calls with after/error hooks, returns unsubscribe |
| `reset()` | `() => void` | Reset all signals to initial values |
| `dispose()` | `() => void` | Tear down the store and remove from registry |

### `setStoreRegistryProvider(fn)`

Override the store registry provider for concurrent SSR isolation.

- **`fn`** (`() => Map<string, unknown>`) -- Function that returns the registry map for the current context. Called on every store access.

### `resetStore(id)`

Destroy a store by ID so the next call to its hook re-runs the setup function.

- **`id`** (`string`) -- The store ID to reset. No-op if the ID does not exist.

### `resetAllStores()`

Destroy all stores in the current registry. Useful for test teardown, HMR, and SSR cleanup.

### `addStorePlugin(plugin)`

Register a global plugin that runs when any store is first created.

- **`plugin`** (`StorePlugin`) -- Function receiving the full `StoreApi`.

### Re-exported from `@pyreon/reactivity`

| Export | Description |
|--------|-------------|
| `signal(value)` | Create a reactive signal with `.set()`, `.update()`, and getter call |
| `computed(fn)` | Create a lazy, cached derived signal |
| `effect(fn)` | Run a tracked side effect |
| `batch(fn)` | Batch multiple writes into one flush |
| `Signal` (type) | TypeScript type for signal instances |
