---
title: "Global State Management"
description: "How to share state across your app with @pyreon/store (composition stores) and @pyreon/state-tree (structured models with snapshots, patches, and undo)."
---

# Global State Management

Local state is just a `signal()`. For state shared across many components — or state that needs actions, snapshots, time-travel, or middleware — Pyreon offers two layers:

- **`@pyreon/store`** — lightweight composition stores, singleton by ID. Best for app-wide state with actions.
- **`@pyreon/state-tree`** — structured reactive models with views, actions, JSON snapshots/patches, undo, and middleware. Best for complex domains.

## When to use which

- A handful of shared signals + a few actions → `@pyreon/store`.
- A nested domain model that needs serialization, time-travel, or patch record/replay → `@pyreon/state-tree`.
- State scoped to one component → don't reach for either; a plain `signal()` is enough.

## @pyreon/store

`defineStore(id, setup)` returns a singleton `StoreApi`. The setup return is auto-classified: signals become tracked state, functions become wrapped actions.

```tsx
// @check
import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.set(count() + 1)
  return { count, double, increment }
})

function Counter() {
  const s = useCounter().store
  return <button onClick={s.increment}>{() => s.count()}</button>
}
```

`StoreApi` also exposes `.state` (snapshot), `patch()`, `subscribe()`, `onAction()`, `reset()`, and `dispose()`. Reset all stores with `resetAllStores()`; for SSR, set a registry provider with `setStoreRegistryProvider()`.

A counter store with a derived value, live:

<Example file="./examples/store/counter-store-signals-derived" />

A list store deriving a count:

<Example file="./examples/store/todo-store-list-derived-count" />

## @pyreon/state-tree

`model({ state, views, actions })` builds a structured model. Instances via `.create(initial?)`, or a singleton hook via `.asHook(id)`.

```tsx
import { model } from '@pyreon/state-tree'

const Todos = model({
  state: () => ({ items: [] as string[] }),
  views: { count: (self) => self.items.length },
  actions: {
    add: (self, text: string) => { self.items = [...self.items, text] },
  },
})

const todos = Todos.create({ items: ['first'] })
todos.add('second')
```

Serialization and time-travel are first-class: `getSnapshot(instance)` / `applySnapshot(instance, snap)` for typed recursive serialization; `onPatch(instance, fn)` / `applyPatch(instance, patch)` for JSON-patch record/replay; `addMiddleware(instance, fn)` to intercept actions.

Undo built on snapshots:

<Example file="./examples/state-tree/state-tree-history-undo" />

## Common pitfalls

- **Re-augmenting a model's snapshot type.** Let `getSnapshot` infer; don't hand-write a parallel snapshot interface that drifts.
- **Reading store state outside a reactive scope.** `s.count()` must be read in JSX / an effect / a computed to track — a top-of-body `const c = s.count()` captures once.
- **Reaching for a store for component-local state.** A singleton store shared by one component is overhead; use `signal()`.

## Related

- [Store reference](/docs/reference/store) · [State Tree reference](/docs/reference/state-tree)
- [State management pattern](/docs/patterns/state-management)
- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
