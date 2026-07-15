---
title: Store
description: Global state management built on Pyreon's reactivity signals.
---

`@pyreon/store` provides Pinia-inspired composition-style global state management. Stores are singletons backed by `@pyreon/reactivity` signals, giving you fine-grained reactivity with zero boilerplate. Define your state, computed values, and actions in a setup function, and access them anywhere in your application through a hook.

<PackageBadge name="@pyreon/store" href="/docs/store" />

## Installation

:::code-group

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

  const increment = () => count.update((n) => n + 1)
  const decrement = () => count.update((n) => n - 1)

  return { count, doubled, increment, decrement }
})

// Use it anywhere:
const { store, patch, reset } = useCounter()
store.increment()
console.log(store.count()) // 1
console.log(store.doubled()) // 2
```

<Example file="./examples/store/counter-store-signals-derived" title="Counter store — signals + derived" />

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
  const increment = () => count.update((n) => n + 1)
  const decrement = () => count.update((n) => n - 1)
  const setTo = (value: number) => count.set(value)

  return { count, doubled, isPositive, increment, decrement, setTo }
})
```

The `id` string must be unique across your application. If two `defineStore` calls share the same ID, the second call's setup function is never executed -- it receives the state created by the first (Pyreon warns once per id in dev when the two setup functions differ):

```ts
const useA = defineStore('shared-id', () => ({ val: signal('first') }))
const useB = defineStore('shared-id', () => ({ val: signal('second') }))

const a = useA()
const b = useB()
console.log(a === b) // true
console.log(a.store.val()) // "first" — second setup never ran
```

### The StoreApi Pattern

Every store hook returns a `StoreApi<T>` object that separates user state from framework methods:

```ts
const { store, id, state, patch, subscribe, onAction, reset, dispose } = useCounter()

// User state is under `store`:
store.count() // read a signal
store.increment() // call an action

// Framework methods are at the top level:
patch({ count: 5 }) // batch-update signals
subscribe(cb) // listen to state changes
reset() // reset to initial values
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

The setup function runs inside a **store-owned effect scope**. That matters in two directions:

- A store lazily created inside a component body (the common shape — the first `useStore()` call happens during some component's setup) does NOT hand its `computed`s/`effect`s to that component's scope. The component unmounting can never dispose the singleton's reactivity out from under every other consumer.
- `dispose()` stops the scope, so everything reactive the setup created is torn down deterministically with the store.

Two definitions with the **same id** don't merge: the registry returns the first instance and the second definition is inert (Pyreon warns once per id in dev when the setup functions differ). This is also what an HMR re-eval of a store module looks like — state is preserved, but edited actions/computeds do NOT apply until `resetStore(id)` or a full page reload.

<Example file="./examples/store/global-shared-store" title="Singleton — two panels, one store, bars grow together" />

### Store Families — parameterized stores

For keyed instances (one store per entity), derive the ID — `defineStore` is cheap and the registry is the cache:

```ts
const useDoc = (docId: string) =>
  defineStore(`doc:${docId}`, () => {
    const title = signal('')
    const rename = (t: string) => title.set(t)
    return { title, rename }
  })()

useDoc('a').store.title.set('Alpha')
useDoc('a').store.title() // 'Alpha' — same instance per key
useDoc('b').store.title() // ''      — independent instance
```

Lifecycle is yours: call `useDoc(id).dispose()` (or ``resetStore(`doc:${id}`)``) when the entity goes away. There is deliberately no automatic family GC — a registry that guesses when your entity is dead guesses wrong.

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

<Example file="./examples/store/store-color-channels" title="Per-field writes — store.r.set() recolors the swatch" />

## Re-exported Reactivity Primitives

`@pyreon/store` re-exports all essential primitives from `@pyreon/reactivity` for convenience, so you do not need a separate import:

| Export          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `signal(value)` | Create a reactive signal                                      |
| `computed(fn)`  | Create a derived computed signal                              |
| `effect(fn)`    | Run a side effect that tracks signal dependencies             |
| `batch(fn)`     | Batch multiple signal writes into a single notification flush |

```ts
import { signal, computed, effect, batch } from '@pyreon/store'
```

The `Signal` type is also re-exported for TypeScript usage:

```ts
import type { Signal } from '@pyreon/store'
```

<Example file="./examples/store/todo-store-list-derived-count" title="Todo store — list + derived count" />

## Real-World Store Examples

### Authentication Store

```ts
import { defineStore, signal, computed } from '@pyreon/store'
import { useStorage } from '@pyreon/storage'

interface User {
  id: string
  email: string
  name: string
  avatar?: string
}

const useAuth = defineStore('auth', () => {
  const user = signal<User | null>(null)
  // Persisted — useStorage returns a real Signal backed by localStorage, so
  // the token survives reloads with zero manual setItem/getItem plumbing
  // (see the Persistence section below).
  const token = useStorage<string | null>('auth_token', null)
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
      token.set(data.token) // persisted automatically — token is a StorageSignal
      user.set(data.user)
    } catch (e) {
      error.set(e instanceof Error ? e.message : 'Login failed')
    } finally {
      loading.set(false)
    }
  }

  function logout() {
    user.set(null)
    token.remove() // clears the signal AND the persisted localStorage entry
  }

  // The token is already restored from localStorage at store creation —
  // this only re-validates it against the server and loads the user.
  async function restoreSession() {
    const savedToken = token()
    if (!savedToken) return

    loading.set(true)
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
      if (response.ok) {
        const data = await response.json()
        user.set(data.user)
      } else {
        token.remove() // stale token — drop it
      }
    } finally {
      loading.set(false)
    }
  }

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    displayName,
    login,
    logout,
    restoreSession,
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
  const itemCount = computed(() => items().reduce((sum, item) => sum + item.quantity, 0))

  const subtotal = computed(() =>
    items().reduce((sum, item) => sum + item.price * item.quantity, 0),
  )

  const total = computed(() => {
    const sub = subtotal()
    return sub - sub * (discount() / 100)
  })

  const isEmpty = computed(() => items().length === 0)

  // Actions
  function addItem(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    const current = items()
    const existing = current.find((i) => i.productId === product.productId)

    if (existing) {
      items.set(
        current.map((i) =>
          i.productId === product.productId ? { ...i, quantity: i.quantity + quantity } : i,
        ),
      )
    } else {
      items.set([...current, { ...product, quantity }])
    }
  }

  function removeItem(productId: string) {
    items.set(items().filter((i) => i.productId !== productId))
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId)
      return
    }
    items.set(items().map((i) => (i.productId === productId ? { ...i, quantity } : i)))
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
    items,
    couponCode,
    discount,
    itemCount,
    subtotal,
    total,
    isEmpty,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    applyCoupon,
  }
})
```

### Theme Store

```ts
import { defineStore, signal, computed, effect } from '@pyreon/store'
import { useStorage } from '@pyreon/storage'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const useTheme = defineStore('theme', () => {
  // Persisted preference — restored from localStorage at creation, written
  // on every .set(), synced across tabs. No manual restore() needed.
  const preference = useStorage<Theme>('theme', 'system')

  const systemPrefersDark = signal(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
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

  const setTheme = (theme: Theme) => preference.set(theme) // persists automatically

  return { preference, resolved, isDark, setTheme }
})
```

## Persistence

There is no persist middleware — none is needed. `@pyreon/storage`'s `useStorage()` returns a `StorageSignal` (a real `Signal` plus a persistence side-effect), so **returning one from `setup` gives you a persisted store field** with everything a store field has: it's classified as state, `patch` / `reset` / `subscribe` / `dehydrateStores` all flow through it, and cross-tab sync plus optional debounced writes (`writeDebounceMs`) come from `@pyreon/storage` for free. You persist exactly the fields you wrap — the composition IS the selection (no `partialize` config):

```ts
import { computed, defineStore, signal } from '@pyreon/store'
import { useStorage } from '@pyreon/storage'

const useCart = defineStore('cart', () => {
  const lines = useStorage<CartLine[]>('cart.lines', [])   // persisted
  const currency = useStorage('cart.currency', 'USD')      // persisted
  const drawerOpen = signal(false)                         // deliberately NOT persisted
  const total = computed(() => lines().reduce((s, l) => s + l.price * l.qty, 0))
  const add = (line: CartLine) => lines.set([...lines(), line])
  return { lines, currency, drawerOpen, total, add }
})
```

Other backends compose identically: `useSessionStorage`, `useCookie`, `useIndexedDB` (async-backed), `useMemoryStorage`.

Two caveats worth knowing:

- **`reset()` restores the setup-time snapshot** — for a persisted field that's the value read from storage at store creation, not your declared default. To clear the persisted value itself, call `field.remove()` (resets the signal to the default AND deletes the storage entry).
- **Shape migrations are yours** — there is no `version`/`migrate` option. If the persisted shape evolves across releases, validate/normalize the raw value in setup (or use a schema-mode store and normalize through an action).

## Schema-driven Stores

For state that needs runtime validation, `defineStore` accepts a **schema-driven** config that derives signals + types from a validation library (zod, valibot, arktype, or any Standard Schema-compliant library). Every `set` and `patch` is validated through the schema; types are inferred end-to-end with zero manual annotations.

```ts
import { zodSchema } from '@pyreon/validation'
import { defineStore, computed } from '@pyreon/store'
import { z } from 'zod'

const UserSchema = zodSchema(z.object({
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
  prefs: z.object({ theme: z.enum(['light', 'dark']) }),
}))

const useUser = defineStore('user', {
  schema: UserSchema,
  initial: { name: '', age: 0, prefs: { theme: 'light' } },
  setup: ({ state, set, patch, reset }) => ({
    // state.name: Signal<string>           ← inferred from schema
    // state.age:  Signal<number>
    // state.prefs: Signal<{ theme: 'light' | 'dark' }>
    greet: computed(() => `Hello, ${state.name()}`),
    incAge: () => state.age.update(n => n + 1),
  }),
})

const u = useUser()
u.store.name()                              // Signal<string>
u.store.greet()                             // computed
u.store.incAge()                            // action
u.set({ name: 'Alice', age: 30, prefs: { theme: 'dark' } })  // full replace + validate
u.patch({ age: 31 })                        // partial merge + validate
u.store.age.set(-1)                         // direct write — bypasses validation (escape hatch)
```

### Library support

The schema-mode overload works with **every** validation library through two complementary mechanisms.

**Tier A — First-party + Standard Schema (zero user work):**

| Library | Adapter | Standard Schema |
| --- | --- | --- |
| Zod | `zodSchema(zSchema)` | ✅ raw schema (zod 3.24+) |
| Valibot | `valibotSchema(vSchema, v.safeParse)` | ✅ raw schema (valibot 1.0+) |
| ArkType | `arktypeSchema(aType)` | ✅ raw schema (arktype 2.0+) |
| Effect Schema | — | ✅ raw schema (Effect Schema 0.66+) |
| Other Standard-Schema libs | — | ✅ raw schema |

Standard Schema-compliant schemas are **auto-detected** via the `'~standard'` property. Pass the raw schema directly — no adapter wrapping required:

```ts
// Tier A.2: raw zod schema (Standard Schema-compliant)
const useUser = defineStore('user', {
  schema: z.object({ name: z.string(), age: z.number() }),  // ← no wrap
  initial: { name: 'Alice', age: 30 },
})
```

**Tier B — User-authored adapter (any other library):**

For libraries that don't implement Standard Schema (yup, joi, ajv, io-ts, runtypes, Superstruct, custom validators), write a 5-10 line adapter:

```ts
import * as yup from 'yup'
import type { TypedSchemaAdapter } from '@pyreon/validation'

function yupSchema<T extends Record<string, unknown>>(
  schema: yup.Schema<T>
): TypedSchemaAdapter<T> {
  return {
    _infer: undefined as never,
    validator: async () => ({}) as never,
    parse: (value) => {
      try { return { ok: true, value: schema.validateSync(value) } }
      catch (err) {
        return { ok: false, issues: [{ path: '', message: String(err) }] }
      }
    },
  }
}

defineStore('user', { schema: yupSchema(yupUserSchema), initial })
```

### Mutation methods

The schema-driven `defineStore` overload returns a `SchemaStoreApi<TRaw, TStore>` — where `TRaw` is the schema's inferred field values and `TStore` is `.store` (the per-field signals + any `setup` actions/computeds). It exposes four validated mutation methods, all strictly typed from the schema (a wrong-typed value, an unknown field, or an `update` on a non-field key fails typecheck — zero casts):

```ts
const useStore = defineStore('s', {
  schema: zodSchema(z.object({
    count: z.number(),
    items: z.array(z.object({ id: z.number(), label: z.string() })),
    prefs: z.object({ theme: z.string(), density: z.string() }),
  })),
  initial: {
    count: 0,
    items: [{ id: 1, label: 'one' }],
    prefs: { theme: 'light', density: 'cozy' },
  },
})
const s = useStore()

// `set` — REPLACES the whole state atomically.
// Requires the full schema shape; throws on mismatch.
s.set({ count: 5, items: [], prefs: { theme: 'dark', density: 'compact' } })

// `patch` — SHALLOW merge of top-level fields. The whole `prefs` object
// is replaced if you pass it; sibling keys at depth ≥ 2 are NOT preserved.
s.patch({ count: 10 })                                  // writes `count`
s.patch({ prefs: { theme: 'dark', density: 'cozy' } })  // replaces whole `prefs`

// `deepPatch` — RECURSIVE merge of nested plain objects. Arrays and
// class instances (Date, Map, Set, etc.) REPLACE — only plain objects
// recurse. Use this when you want to update a nested key without
// spreading the parent yourself.
s.deepPatch({ prefs: { theme: 'dark' } })  // density survives, theme changes
s.deepPatch({ items: [{ id: 2, label: 'replaced' }] })  // array REPLACES

// `update` — transform a single top-level field via callback. Covers
// add / remove / filter / map / object-key-delete patterns in one method.
// `key` is constrained to the schema field names, and the transformer's
// argument + return are typed as that field's exact type — no casts.
s.update('count', n => n + 1)                            // n: number
s.update('items', items => items.filter(x => x.id !== 1))  // items: { id: number; label: string }[]
s.update('items', items => [...items, { id: 2, label: 'two' }])  // append
s.update('prefs', prefs => ({ ...prefs, theme: 'dark' }))  // prefs: { theme: string; density: string }
```

All four methods validate the merged result against the schema and either throw or invoke `onValidationError` if configured. The choice between them:

| Method | Shape | Merge depth | Use when |
| --- | --- | --- | --- |
| `set(full)` | full state | n/a (replaces) | resetting to a known full shape |
| `patch(partial)` | top-level partial | shallow (depth-1) | replacing one or more top-level fields |
| `deepPatch(partial)` | recursive partial | deep (plain objects only) | updating nested fields without spreading the parent |
| `update(key, fn)` | one field | n/a (transformer-controlled) | array filter/append, object key delete/add, primitive math |

### Validation rules

- **`set(full)` and `patch(partial)` validate.** Invalid input throws (or invokes `onValidationError` if provided). State stays at its previous value on failure.
- **Direct signal writes bypass validation** by design — `store.fieldName.set(v)` is an escape hatch for hot paths where the per-write schema parse cost (~50-200µs) matters. For guaranteed validation, route through `set` or `patch`.
- **Initial is validated once at defineStore-time.** Invalid initial throws immediately. Schema defaults (`z.string().default('Alice')`) and transforms are applied — the PARSED value is written to signals.
- **Async validators are unsupported.** A schema whose validator returns a `Promise` is rejected at defineStore-time. Use `@pyreon/form` for async refinements.

### Validation error handling

By default, validation failures throw. Provide `onValidationError` to suppress the throw and handle errors yourself (e.g. show a toast):

```ts
defineStore('user', {
  schema: UserSchema,
  initial: { name: 'Alice', age: 30 },
  onValidationError: (issues, op) => {
    toast.error(`${op}: ${issues.map(i => i.message).join(', ')}`)
  },
})
```

### Limitations

- **Top-level fields only get signals.** Nested objects (e.g. `prefs: { theme: 'light' }`) remain as values inside the parent signal. To update `prefs.theme` without spreading the parent, use `deepPatch({ prefs: { theme: 'dark' } })` — recursive signal-ization is intentionally not supported (it would require library-specific schema introspection).
- **Reserved StoreApi keys.** A schema field named `set` collides with the `StoreApi` method — defineStore throws at construction with a clear message. Rename the field.

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

  const pending = computed(() => items().filter((t) => !t.done))
  const completed = computed(() => items().filter((t) => t.done))

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
    const current = items().find((t) => t.id === id)
    if (!current) return
    await api.request(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !current.done }),
    })
    items.set(items().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
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
    items.set(previous.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

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
  const inStock = computed(() => products().filter((p) => p.stock > 0))
  const outOfStock = computed(() => products().filter((p) => p.stock === 0))

  // Aggregated computed
  const totalValue = computed(() => products().reduce((sum, p) => sum + p.stock * p.price, 0))

  // Computed from other computed
  const lowStock = computed(() => inStock().filter((p) => p.stock < 10))

  const summary = computed(() => ({
    total: totalProducts(),
    available: inStock().length,
    unavailable: outOfStock().length,
    lowStock: lowStock().length,
    inventoryValue: totalValue(),
  }))

  return {
    products,
    totalProducts,
    inStock,
    outOfStock,
    totalValue,
    lowStock,
    summary,
  }
})
```

Computed values are lazy and cached -- they only re-evaluate when their dependencies change.

## Effects with Stores

Use `effect` to run side effects that react to store state changes:

```ts
import { effect } from '@pyreon/store'

const useNotifications = defineStore('notifications', () => {
  const unread = signal(0)

  // Reflect unread count into the document title whenever it changes
  effect(() => {
    if (typeof document === 'undefined') return
    const n = unread()
    document.title = n > 0 ? `(${n}) Inbox` : 'Inbox'
  })

  return {
    unread,
    markAllRead: () => unread.set(0),
    notify: () => unread.update((n) => n + 1),
  }
})
```

(For persistence, don't hand-roll an effect + `localStorage` — return a `useStorage()` signal from setup instead; see [Persistence](#persistence).)

Effects created in setup are owned by the **store's effect scope**: they are NOT adopted by whichever component happened to create the store first (a component unmount can't kill them), and they are disposed deterministically by `dispose()`.

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

  const increment = () => count.update((n) => n + 1)

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
  const increment = () => count.update((n) => n + 1)
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
  const increment = () => count.update((n) => n + 1)
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
      const created = (await res.json()) as T
      items.set([...items(), created])
      return created
    }

    async function remove(id: string) {
      await fetch(`${apiPath}/${id}`, { method: 'DELETE' })
      items.set(items().filter((i) => i.id !== id))
    }

    function getById(id: string): T | undefined {
      return byId().get(id)
    }

    return { items, loading, error, byId, fetchAll, create, remove, getById }
  })
}

// Usage:
interface Product {
  id: string
  name: string
  price: number
}
const useProducts = createCrudStore<Product>('products', '/api/products')

interface Category {
  id: string
  label: string
}
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
patch({ firstName: 'Alice', lastName: 'Smith' })

// Function form — receives signal references for direct manipulation
patch((signals) => {
  signals.firstName.set('Alice')
  signals.lastName.set('Smith')
})
```

Patch mutations are batched via `batch()` and emit a single `subscribe` notification with `type: "patch"`.

### `subscribe`

Listen to all state changes in the store. The callback receives the mutation info and a snapshot of the current state:

```ts
const { subscribe } = useCounter()

const unsubscribe = subscribe((mutation, state) => {
  console.log(mutation.storeId) // "counter"
  console.log(mutation.type) // "direct" or "patch"
  console.log(mutation.events) // [{ key: "count", oldValue: 0, newValue: 1 }]
  console.log(state) // { count: 1 }
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

Full teardown — runs plugin cleanups, unsubscribes all signal listeners, clears subscribers and action listeners, **stops the store's effect scope** (disposing every `computed`/`effect` created in setup or plugin bodies), and removes the store from the registry:

```ts
const { dispose } = useCounter()
dispose()

// Next call to useCounter() will re-run setup
```

Because setup runs inside a store-owned effect scope, `dispose()` is the ONE deterministic teardown point for everything the store created — no zombie effects keep firing on external signals afterwards.

## Plugins

Register global plugins that run when any store is first created. Plugins receive the full `StoreApi` and may return a **cleanup function** that runs on that store's `dispose()`:

```ts
import { addStorePlugin } from '@pyreon/store'

// Logger plugin
addStorePlugin(({ store, id, subscribe }) => {
  subscribe((mutation, state) => {
    console.log(`[${id}]`, mutation.type, mutation.events)
  })
})

// Server-sync plugin with dispose-time teardown
addStorePlugin(({ id, subscribe }) => {
  const socket = connectSync(id)
  subscribe((_mutation, state) => socket.send(state))
  return () => socket.close() // runs on store.dispose()
})
```

Plugin bodies run inside the store's effect scope — `effect()` / `computed()` created in a plugin are disposed automatically on `dispose()`; the returned cleanup is for EXTERNAL resources (timers, sockets, subscriptions to other systems). For localStorage persistence, prefer per-field `useStorage()` composition (see [Persistence](#persistence)) over a whole-store plugin — it persists exactly the fields you choose and syncs across tabs.

### StorePlugin type

```ts
type StorePlugin = (api: StoreApi<Record<string, unknown>>) => void | (() => void)
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
      new Response(JSON.stringify({ items: mockProducts }), { status: 200 }),
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
      const html = await renderToString(<App />)
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
  const increment = () => count.update((n) => n + 1)

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
function inspectStore<T extends Record<string, unknown>>(
  api: StoreApi<T>,
): Record<string, unknown> {
  return api.state
}

// Usage:
const api = useCounter()
console.table(inspectStore(api))
// | key   | value |
// |-------|-------|
// | count | 0     |
```

## Non-Goals — what the paradigm already covers

Coming from Zustand / Pinia / Jotai / Valtio, several familiar features are absent from `@pyreon/store` ON PURPOSE — fine-grained signals make them unnecessary:

| Familiar feature | Why it's absent |
| --- | --- |
| `subscribeWithSelector` / selector middleware | Signals ARE the selectors — subscribe to one field via `store.x.subscribe(...)`, derive with `computed(...)`. There is no coarse store subscription to narrow. |
| `immer` / `produce` middleware | Per-field signals make granular writes the idiom (`store.x.set`, `patch`). Deep trees with snapshots/patches are `@pyreon/state-tree`'s job. |
| `storeToRefs` (Pinia) | Store fields are stable signal callables — destructuring `const { count } = store` is safe by construction. The reactivity lives in READING `count()`, not in property access. |
| Redux-style reducers / dispatch | Constrained transitions are `@pyreon/machine`'s job. Actions here are plain functions. |
| Framework binding hooks (`useStore(selector)`) | There is no re-render layer to bind — components read signals directly. |
| Refcounted auto-dispose (nanostores `onMount`) | Stores are app-level singletons with explicit `dispose()`; component-scoped resources belong in component hooks. |
| Async derived-data primitives (async atoms, `loadable`) | Server/async data is `@pyreon/query`'s job. Async ACTIONS are first-class here — `onAction` is thenable-aware. |
| Whole-store persist middleware (`partialize`, storage adapters) | Per-field `useStorage()` composition (see [Persistence](#persistence)) — you persist exactly the fields you wrap. |

## API Reference

### `defineStore(id, setup)`

Define a store with a unique ID and a setup function.

- **`id`** (`string`) -- Unique identifier for the store. Must be unique across the application.
- **`setup`** (`() => T`) -- Factory function that returns the store's public API. Runs once per store lifetime (until reset). `T` must extend `Record<string, unknown>`.
- **Returns** `() => StoreApi<T>` -- A hook function that returns the `StoreApi` wrapping the singleton store state.

### `StoreApi<T>`

The structured result returned by every store hook.

| Property               | Type                                         | Description                                                        |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `store`                | `T`                                          | The user-defined store state, computeds, and actions               |
| `id`                   | `string`                                     | The store's unique identifier string                               |
| `state`                | `Record<string, unknown>`                    | Readonly snapshot of all signal values                             |
| `patch(obj)`           | `(partial: Record<string, unknown>) => void` | Batch-set signals from an object                                   |
| `patch(fn)`            | `(fn: (signals) => void) => void`            | Batch-set signals via function receiving signal refs               |
| `subscribe(cb, opts?)` | `(cb, opts?) => () => void`                  | Listen to state changes, returns unsubscribe                       |
| `onAction(cb)`         | `(cb) => () => void`                         | Intercept action calls with after/error hooks, returns unsubscribe |
| `reset()`              | `() => void`                                 | Reset all signals to initial values                                |
| `dispose()`            | `() => void`                                 | Full teardown: plugin cleanups, listeners, the store's effect scope, registry entry |

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

- **`plugin`** (`StorePlugin`) -- Function receiving the full `StoreApi`. May return a cleanup function that runs on that store's `dispose()`.

### Re-exported from `@pyreon/reactivity`

| Export          | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `signal(value)` | Create a reactive signal with `.set()`, `.update()`, and getter call |
| `computed(fn)`  | Create a lazy, cached derived signal                                 |
| `effect(fn)`    | Run a tracked side effect                                            |
| `batch(fn)`     | Batch multiple writes into one flush                                 |
| `Signal` (type) | TypeScript type for signal instances                                 |
