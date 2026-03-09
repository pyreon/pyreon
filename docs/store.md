# Store

`@pyreon/store` provides composable global state through `defineStore`. Stores are lazily initialized singletons — the setup function runs once the first time the store is used and the same instance is returned on every subsequent call.

## Installation

```bash
bun add @pyreon/store
```

## defineStore

```ts
import { defineStore } from "@pyreon/store"
import { signal, computed } from "@pyreon/reactivity"

const useCounter = defineStore("counter", () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)

  const increment = () => count.update(n => n + 1)
  const decrement = () => count.update(n => n - 1)
  const reset = () => count.set(0)

  return { count, doubled, increment, decrement, reset }
})
```

`defineStore` returns a hook function. Call it inside any component to get the store instance:

```tsx
function Counter() {
  const { count, increment, decrement } = useCounter()

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count()}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}
```

Both `Counter` instances share the same `count` signal. Updates in one are immediately visible in the other.

## API Reference

| Function | Signature | Description |
|---|---|---|
| `defineStore` | `defineStore<T>(id: string, setup: () => T): () => T` | Creates a store definition |
| `resetStore` | `resetStore(id: string): void` | Destroys and re-initializes a store |
| `resetAllStores` | `resetAllStores(): void` | Destroys and re-initializes all stores |

## Store Structure

The `setup` function is a standard Nova composition function. You can use any reactivity primitives, lifecycle hooks, or context inside it.

```ts
const useUserStore = defineStore("user", () => {
  // State — signals
  const userId = signal<string | null>(null)
  const profile = signal<UserProfile | null>(null)
  const loading = signal(false)

  // Derived — computed
  const isLoggedIn = computed(() => userId() !== null)
  const displayName = computed(() => profile()?.name ?? "Guest")

  // Actions — plain functions
  const login = async (credentials: Credentials) => {
    loading.set(true)
    try {
      const { id, ...data } = await api.login(credentials)
      userId.set(id)
      profile.set(data)
    } finally {
      loading.set(false)
    }
  }

  const logout = () => {
    userId.set(null)
    profile.set(null)
  }

  return { userId, profile, loading, isLoggedIn, displayName, login, logout }
})
```

## Cross-Store Composition

Stores can use other stores. Call the dependent store's hook inside the setup function:

```ts
const useCartStore = defineStore("cart", () => {
  const { userId } = useUserStore()  // compose stores
  const items = signal<CartItem[]>([])

  const total = computed(() =>
    items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  )

  const addItem = (item: CartItem) => {
    if (!userId()) throw new Error("Must be logged in to add to cart")
    items.update(list => [...list, item])
  }

  const clear = () => items.set([])

  return { items, total, addItem, clear }
})
```

## resetStore and resetAllStores

These are primarily for testing — they destroy the current store instance and re-initialize it on the next call.

```ts
import { resetStore, resetAllStores } from "@pyreon/store"

// After each test
afterEach(() => {
  resetAllStores()
})

// Or reset a specific store
afterEach(() => {
  resetStore("counter")
})
```

`resetStore` and `resetAllStores` should not be used in production application code. They are designed for unit tests that need a clean slate between runs.

## Persistence Pattern

To persist a store's state across page reloads, sync signals with `localStorage` in the setup function:

```ts
const useSettingsStore = defineStore("settings", () => {
  // Load initial value from storage
  const stored = localStorage.getItem("settings")
  const parsed = stored ? JSON.parse(stored) : { theme: "light", lang: "en" }

  const theme = signal<"light" | "dark">(parsed.theme)
  const lang = signal<string>(parsed.lang)

  // Persist on every change
  effect(() => {
    localStorage.setItem("settings", JSON.stringify({
      theme: theme(),
      lang: lang(),
    }))
  })

  const setTheme = (t: "light" | "dark") => theme.set(t)
  const setLang = (l: string) => lang.set(l)

  return { theme, lang, setTheme, setLang }
})
```

The `effect` runs immediately on setup (writing the initial value back to storage), then again whenever `theme` or `lang` changes.

## Pattern: Store with Async Initialization

```ts
const useProductStore = defineStore("products", () => {
  const products = signal<Product[]>([])
  const loading = signal(true)
  const error = signal<Error | null>(null)

  // Fetch on first use
  fetch("/api/products")
    .then(r => r.json())
    .then(data => { products.set(data); loading.set(false) })
    .catch(err => { error.set(err); loading.set(false) })

  const addProduct = (p: Product) =>
    products.update(list => [...list, p])

  const removeProduct = (id: number) =>
    products.update(list => list.filter(p => p.id !== id))

  return { products, loading, error, addProduct, removeProduct }
})
```

## Pattern: Undo/Redo

```ts
const useEditorStore = defineStore("editor", () => {
  const history = signal<string[]>([""])
  const cursor = signal(0)

  const current = computed(() => history()[cursor()])

  const set = (value: string) => {
    const prev = history().slice(0, cursor() + 1)
    history.set([...prev, value])
    cursor.update(n => n + 1)
  }

  const undo = () => {
    if (cursor() > 0) cursor.update(n => n - 1)
  }

  const redo = () => {
    if (cursor() < history().length - 1) cursor.update(n => n + 1)
  }

  const canUndo = computed(() => cursor() > 0)
  const canRedo = computed(() => cursor() < history().length - 1)

  return { current, set, undo, redo, canUndo, canRedo }
})
```

## Gotchas

**Store IDs must be unique.** If two `defineStore` calls use the same ID, the second call's setup function is ignored — the first instance is returned. Use namespaced IDs in large applications.

```ts
// Collision risk
defineStore("user", ...)  // in one file
defineStore("user", ...)  // in another — gets the first store's instance

// Safe
defineStore("auth/user", ...)
defineStore("shop/user", ...)
```

**The setup function runs lazily.** The store is not initialized until the hook is first called. If you rely on side effects in the setup (e.g., subscribing to WebSocket), ensure the hook is called during app initialization.

**Do not return reactive getters — return the signals themselves.** Returning `count()` instead of `count` gives consumers a plain number read once at store initialization.

```ts
// Wrong
return { count: count() }  // consumers get 0, not a signal

// Correct
return { count }  // consumers call count() to read reactively
```
