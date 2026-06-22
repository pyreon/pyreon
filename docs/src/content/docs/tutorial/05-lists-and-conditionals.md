---
title: "5. Lists & conditionals"
description: "Tutorial chapter 5 — render dynamic lists with keyed <For> and conditional UI with <Show>, the fine-grained control-flow primitives."
---

# 5. Lists & conditionals

Because components run once, you don't `.map()` arrays or use `&&` for conditionals the way a re-rendering framework does — those would run once and never update. Pyreon gives you **control-flow components** that are reactive: `<For>` for lists, `<Show>` for conditionals.

## Lists — `<For>`

`<For>` keys each row so updates, inserts, and removes patch precisely instead of rebuilding the list. The key is the `by` prop (Pyreon reserves `key` for VNode reconciliation):

```tsx
import { For } from '@pyreon/core'

<For each={todos} by={(t) => t.id}>
  {(todo) => <li>{todo.text}</li>}
</For>
```

Pass the **signal** to `each` (not `todos()`), and give `by` a stable id. Here's a live keyed list — add items and watch only the new row mount:

<Example file="./examples/tutorial/todo-1-list" />

## Conditionals — `<Show>`

```tsx
import { Show } from '@pyreon/core'

<Show when={loggedIn} fallback={<LoginButton />}>
  <Dashboard />
</Show>
```

`when` accepts a signal **or** a plain value. For a quick inline conditional, a reactive thunk works too: `{() => loggedIn() ? <Dashboard /> : <LoginButton />}`.

**The key idea:** `<For>` and `<Show>` are reactive because the framework owns the iteration/branching and updates surgically. A bare `todos().map(...)` in JSX runs once at mount and never reflects later changes — always reach for `<For>` / `<Show>`.

> A `<For>` callback's `item` is a runtime value, not reactive props. A bare `item.text` is baked statically (fine when it won't change); for a per-row value that updates, make that field a signal and call it: `item.text()`.

---

**[← Components](/docs/tutorial/04-components)** · **[Next: Build something real →](/docs/tutorial/06-build-something)**
