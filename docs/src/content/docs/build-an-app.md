---
title: Build a Real App in 30 Minutes
description: A hands-on tutorial — build a working todo app with Pyreon signals, components, and keyed lists. Every step is a live, editable example running on this page.
---

You'll build a working **todo app** — add items, check them off, filter, delete, clear completed. Every step below is a **live example running on this page** (no iframe — these are real Pyreon components mounted inline).

By the end you'll have used the whole core toolkit: `signal`, `computed`, `<For>`, `<Show>`, controlled inputs, and the one rule that makes Pyreon click — **components run once; reactivity lives in the thunks you pass to JSX**.

> **Prerequisites:** five minutes with [Getting Started](/docs/getting-started) (install + Vite setup). Coming from another framework? The [React](/docs/migrating-from-react) and [Solid](/docs/migrating-from-solid) guides map the concepts.

## Set up a project

The fastest start is the scaffolder — it wires Vite, the compiler, and a dev server:

```bash
npm create @pyreon/zero@latest my-todos
cd my-todos && npm run dev
```

Everything below lives in a single component file. Drop it into a route (or `src/App.tsx`) and follow along — or just read the live examples here, which run the exact code shown.

## Step 1 — Render a list

State in Pyreon is a **signal**: a reactive container you read by *calling* it. `<For>` is the keyed list renderer — `each` takes the signal, and `by` gives each row a stable key so the framework reconciles rows instead of throwing them away and rebuilding.

```tsx
import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

interface Todo { id: number; text: string }

export default function TodoList() {
  const todos = signal<Todo[]>([
    { id: 1, text: 'Learn signals' },
    { id: 2, text: 'Render a list' },
    { id: 3, text: 'Ship something' },
  ])

  return (
    <ul class="example-col example-list">
      <For each={todos} by={(t) => t.id}>
        {(todo) => <li class="example-card">{todo.text}</li>}
      </For>
    </ul>
  )
}
```

<Example file="./examples/tutorial/todo-1-list" />

Two things to notice. First, `each={todos}` takes the **signal itself**, not `todos()` — `<For>` subscribes to it and re-runs when the array changes. Second, the `by` key is required for efficient updates; without it, every change re-creates the whole list.

## Step 2 — Add items

A **controlled input** binds both directions: `value` reads a signal, `onInput` writes it. To add a todo we update the array **immutably** — `[...list, item]` produces a *new* array, which is how the signal knows it changed.

```tsx
const todos = signal<Todo[]>([])
const draft = signal('')
let nextId = 1

function add() {
  const text = draft().trim()
  if (text === '') return
  todos.update((list) => [...list, { id: nextId++, text }])
  draft.set('')
}

return (
  <form onSubmit={(e) => { e.preventDefault(); add() }}>
    <input
      value={() => draft()}
      onInput={(e) => draft.set(e.currentTarget.value)}
    />
    <button type="submit">Add</button>
  </form>
  // …plus the <For> list from step 1
)
```

<Example file="./examples/tutorial/todo-2-add" />

`e.currentTarget` is typed as the `<input>` element automatically — no `as HTMLInputElement` cast. And `value={() => draft()}` is a **thunk**: the compiler keeps it reactive, so the input always shows the current draft (try typing and submitting).

> **Gotcha:** `draft(5)` does **not** set the signal — calling a signal *reads* it. Always write with `draft.set(…)` or `draft.update(…)`. See [Signal reads and writes](/docs/patterns/signal-writes).

## Step 3 — Toggle completion

Here's the fine-grained move that sets Pyreon apart: give each todo's `done` its **own signal**. A keyed `<For>` row runs **once** — so `checked={() => todo.done()}` and `style={() => …}` are the reactive parts. Toggling one todo updates only that row's checkbox and strike-through. No list re-render, no row re-mount.

```tsx
import { signal, type Signal } from '@pyreon/reactivity'

interface Todo { id: number; text: string; done: Signal<boolean> }

let nextId = 1
const makeTodo = (text: string, done = false): Todo =>
  ({ id: nextId++, text, done: signal(done) })

// inside the <For> row:
{(todo) => (
  <li class="example-row example-card">
    <input
      type="checkbox"
      checked={() => todo.done()}
      onChange={() => todo.done.update((v) => !v)}
    />
    <span style={() => ({
      textDecoration: todo.done() ? 'line-through' : 'none',
      opacity: todo.done() ? '0.55' : '1',
    })}>
      {todo.text}
    </span>
  </li>
)}
```

<Example file="./examples/tutorial/todo-3-toggle" />

This is exactly Solid's per-row-signal pattern. The row's `{todo.text}` is a plain property read — static, baked once. The reactive bits are the *calls* (`todo.done()`) inside thunks. That distinction is the whole model. (More in [Reactivity Rules](/docs/reactivity-rules).)

## Step 4 — Derived counts

A **`computed`** derives a cached value from other signals. `remaining` reads `todos()` **and** each `todo.done()`, so it recomputes when you add a todo *or* toggle one — and only then.

```tsx
import { computed } from '@pyreon/reactivity'

const remaining = computed(() => todos().filter((t) => !t.done()).length)
const total = computed(() => todos().length)

// read it like any signal, inside a thunk:
<div>{() => String(remaining())} of {() => String(total())} remaining</div>
```

<Example file="./examples/tutorial/todo-4-counts" />

You never tell `computed` what its dependencies are — it tracks them automatically by what it *reads* while running. Toggle a checkbox and watch the count update with zero wiring.

## Step 5 — Filter the view

Now a `computed` that reads **two** signals. `visible` derives the list to show from the active `filter` and the `todos`. `<For each={visible}>` renders the derived list — change the filter or toggle a todo and the visible set re-derives itself.

```tsx
type Filter = 'all' | 'active' | 'completed'
const filter = signal<Filter>('all')

const visible = computed(() => {
  const f = filter()
  return todos().filter((t) =>
    f === 'all' ? true : f === 'active' ? !t.done() : t.done(),
  )
})

// <For each={visible} by={(t) => t.id}> … </For>
```

<Example file="./examples/tutorial/todo-5-filter" />

`visible` is a signal too, so it composes — you could feed it into another `computed`, a `<For>`, or an effect, and the dependency graph stays fine-grained the whole way down.

## The complete app

Put it together and add **delete** + **clear completed** (note the `<Show when={hasCompleted}>` — it mounts the button only when there's something to clear):

```tsx
import { signal, computed, type Signal } from '@pyreon/reactivity'
import { For, Show } from '@pyreon/core'

const remaining = computed(() => todos().filter((t) => !t.done()).length)
const hasCompleted = computed(() => todos().some((t) => t.done()))

function remove(id: number) {
  todos.update((list) => list.filter((t) => t.id !== id))
}
function clearCompleted() {
  todos.update((list) => list.filter((t) => !t.done()))
}

// …
<Show when={hasCompleted}>
  <button onClick={clearCompleted}>Clear completed</button>
</Show>
```

<Example file="./examples/tutorial/todo-app" />

That's a complete, interactive app. Look back at what you *didn't* write: no `useState`, no dependency arrays, no `useMemo`, no re-render. The component function ran **once** when it mounted. Every update since has touched only the exact DOM node that changed — a checkbox here, a count there.

## What you learned

- **`signal`** — reactive state; read by calling (`todos()`), write with `.set` / `.update`
- **`computed`** — cached derived values that auto-track their dependencies
- **`<For each={signal} by={fn}>`** — keyed list rendering
- **`<Show when={signal}>`** — conditional mounting
- **Controlled inputs** — `value={() => sig()}` + `onInput={(e) => sig.set(e.currentTarget.value)}`
- **The core rule** — components run once; reactivity is the thunks (`() => …`) you hand to JSX

## Where to go next

- **Make it persist** — swap the array signal for [`@pyreon/storage`](/docs/storage)'s `useStorage` and your todos survive a reload, automatically cross-tab synced.
- **Add routes** — [`@pyreon/router`](/docs/router) for client-side navigation, or [`@pyreon/zero`](/docs/zero) for the full file-system-routed, SSR/SSG meta-framework.
- **Forms at scale** — [`@pyreon/form`](/docs/form) for validation, field arrays, and submission state.
- **Go deeper on the model** — [Reactivity Rules](/docs/reactivity-rules) explains exactly where reads become reactive (and where they don't).
