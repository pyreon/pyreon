# @pyreon/solid-compat

SolidJS-compatible API shim that runs on Pyreon's signal-based reactive engine. Migrate Solid code by swapping the import path.

## Install

```bash
bun add @pyreon/solid-compat
```

## Quick Start

```tsx
// Replace:
// import { createSignal, createEffect } from "solid-js"
// With:
import { createSignal, createEffect } from "@pyreon/solid-compat"

function Counter() {
  const [count, setCount] = createSignal(0)
  createEffect(() => console.log("count:", count()))
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}
```

### Derived State and Memos

```tsx
import { createSignal, createMemo } from "@pyreon/solid-compat"

function PriceCalculator() {
  const [price, setPrice] = createSignal(100)
  const [quantity, setQuantity] = createSignal(1)
  const total = createMemo(() => price() * quantity())

  return (
    <div>
      <input
        type="number"
        value={price()}
        onInput={(e) => setPrice(Number(e.currentTarget.value))}
      />
      <input
        type="number"
        value={quantity()}
        onInput={(e) => setQuantity(Number(e.currentTarget.value))}
      />
      <p>Total: ${total()}</p>
    </div>
  )
}
```

### Control Flow Components

```tsx
import { createSignal } from "@pyreon/solid-compat"
import { Show, For } from "@pyreon/solid-compat"

function TodoList() {
  const [todos, setTodos] = createSignal([
    { id: 1, text: "Learn Pyreon", done: false },
    { id: 2, text: "Build app", done: false },
  ])
  const [showDone, setShowDone] = createSignal(false)

  return (
    <div>
      <button onClick={() => setShowDone((s) => !s)}>
        {showDone() ? "Hide" : "Show"} completed
      </button>
      <For each={todos()} by={(t) => t.id}>
        {(todo) => (
          <Show when={showDone() || !todo.done}>
            <p>{todo.text}</p>
          </Show>
        )}
      </For>
    </div>
  )
}
```

### Context and Dependency Injection

```tsx
import { createContext, useContext } from "@pyreon/solid-compat"
import { createSignal } from "@pyreon/solid-compat"

const CounterContext = createContext({ count: () => 0, increment: () => {} })

function CounterProvider(props: { children: any }) {
  const [count, setCount] = createSignal(0)
  const value = { count, increment: () => setCount((c) => c + 1) }
  return (
    <CounterContext.Provider value={value}>
      {props.children}
    </CounterContext.Provider>
  )
}

function Display() {
  const { count, increment } = useContext(CounterContext)
  return <button onClick={increment}>Clicks: {count()}</button>
}
```

## Key Differences from SolidJS

- **Same mental model.** Pyreon's reactivity is signal-based, just like Solid.
- **`createEffect` cleanup is not supported.** Pyreon's `effect()` does not use return values as cleanup functions.
- **`lazy` throws promises for Suspense.** Works with `<Suspense>` boundaries.

## API

### Primitives

- **`createSignal(initial)`** -- returns `[getter, setter]`.
- **`createEffect(fn)`** -- reactive side effect.
- **`createRenderEffect(fn)`** -- alias for `createEffect`.
- **`createComputed(fn)`** -- alias for `createEffect`.
- **`createMemo(fn)`** -- returns a computed getter.
- **`createRoot(fn)`** -- run in a new reactive scope with `dispose`.
- **`on(deps, fn)`** -- explicit dependency tracking.

### Utilities

- **`batch(fn)`** -- coalesce multiple signal writes.
- **`untrack(fn)`** -- read signals without tracking.
- **`mergeProps(...sources)`** -- merge multiple props objects (supports symbol keys).
- **`splitProps(props, ...keys)`** -- split props into groups (supports symbol keys).
- **`children(fn)`** -- resolve reactive children.

### Lifecycle

- **`onMount(fn)`** -- run after component mounts.
- **`onCleanup(fn)`** -- run on component unmount.

### Context

- **`createContext(defaultValue)`** -- create a context.
- **`useContext(ctx)`** -- read a context value.

### Ownership

- **`getOwner()`** -- get the current reactive scope.
- **`runWithOwner(owner, fn)`** -- run in a specific scope.

### Reactivity

- **`createSelector(source)`** -- O(1) equality selector.

### Components

- **`lazy(loader)`** -- dynamic import wrapper, throws promises for `<Suspense>`.
- **`Show`**, **`Switch`**, **`Match`**, **`For`** -- control flow components.
- **`Suspense`**, **`ErrorBoundary`** -- boundary components.
