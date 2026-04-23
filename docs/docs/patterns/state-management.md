---
title: "State management — stores vs signals vs models"
summary: "signal for local UI state, defineStore for shared app state, state-tree models for structured snapshots."
seeAlso: [signal-writes]
---

# State management — stores vs signals vs models

## The pattern

Three tiers, pick by scope:

### 1. Plain `signal` — local component state

```tsx
import { signal } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  return <button onClick={() => count.update((n) => n + 1)}>{count}</button>
}
```

No setup cost, no id, no registry. Dies with the component. Use for 80% of UI state.

### 2. `defineStore` — shared app state with id + plugins + devtools

```ts
import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'

export const useCartStore = defineStore('cart', () => {
  const items = signal<CartItem[]>([])
  const total = computed(() =>
    items().reduce((sum, i) => sum + i.price * i.qty, 0),
  )

  function add(item: CartItem) {
    items.update((prev) => [...prev, item])
  }

  function reset() {
    items.set([])
  }

  return { items, total, add, reset }
})

// Consumer
const cart = useCartStore()
cart.add({ id: 'sku-1', price: 10, qty: 2 })
cart.total()  // 20
```

The setup function runs once per store ID — consumers get the same instance. Signals auto-register for devtools introspection; function returns become wrapped actions with `onAction` hooks.

### 3. `@pyreon/state-tree` — structured models with snapshots, patches, middleware

For state that needs JSON serialisation, undo/redo, or computed views:

```ts
import { model } from '@pyreon/state-tree'

const TodoModel = model({
  state: { todos: [] as Todo[], filter: 'all' as 'all' | 'active' | 'done' },
  views: {
    visible(self) {
      if (self.filter === 'all') return self.todos
      return self.todos.filter((t) => (self.filter === 'done' ? t.done : !t.done))
    },
  },
  actions: {
    add(self, text: string) {
      self.todos.push({ id: crypto.randomUUID(), text, done: false })
    },
    toggle(self, id: string) {
      const todo = self.todos.find((t) => t.id === id)
      if (todo) todo.done = !todo.done
    },
  },
})

const store = TodoModel.create({ todos: [], filter: 'all' })
store.add('Buy milk')
store.visible()
```

Supports `getSnapshot()` / `applySnapshot()` for serialisation, `onPatch()` / `applyPatch()` for record-replay, and `addMiddleware()` for logging / analytics / optimistic updates.

## Why three tiers?

- **`signal`** — zero ceremony, zero allocation beyond the signal itself. Local state should stay local.
- **`defineStore`** — adds id + plugin system (devtools, persistence, reset) but still composes naturally. Pick this for shared state that doesn't need serialisation.
- **`state-tree`** — adds type-safe snapshots + patches + middleware. Pick this when the shape matters (offline sync, collaborative editing, audit logs).

## Anti-pattern

```tsx
// BROKEN — creating a store inside a component body
function App() {
  const cart = defineStore('cart', () => ...)   // re-registers on every mount
}

// Correct: module-scope definition, component-scope consumption
export const useCartStore = defineStore('cart', () => ...)

function App() {
  const cart = useCartStore()
}
```

```ts
// BROKEN — reading store state by destructure at setup
const { items } = useCartStore()
const initial = items()   // captures initial value, not reactive

// Correct — keep the store reference, call inside reactive scopes:
const cart = useCartStore()
return <div>{() => cart.items().length}</div>
```

## Related

- Reference API: `signal`, `computed`, `effect`, `defineStore`, `model` — `get_api`
- Pattern: `signal-writes` for the fundamentals of reading/writing signals
- Devtools: `@pyreon/store/devtools` + `@pyreon/state-tree/devtools` — tree-shaken in production
