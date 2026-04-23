---
title: "Keyed list rendering"
summary: "Use <For each={items} by={i => i.id}> — never .map() in JSX, never key on <For>."
seeAlso: [signal-writes]
---

# Keyed list rendering

## The pattern

Render dynamic lists with `<For>` from `@pyreon/core`, keyed by a stable identifier via the `by` prop:

```tsx
import { For } from '@pyreon/core'

<For each={todos()} by={(todo) => todo.id}>
  {(todo) => <li>{() => todo.text}</li>}
</For>
```

Key rules:

- The keying prop is **`by`**, not `key`. JSX extracts `key` at the VNode level for reconciliation of non-`<For>` elements; it never reaches the `<For>` runtime.
- `by` receives the item and returns a unique key (usually a string or number).
- The render prop `{(item) => …}` receives the item and returns a VNode. Signal reads inside track automatically.
- `each` can be a signal getter (`todos()`) or a signal directly (`todos` — compiler auto-calls).

## Why

`<For>` runs the reconciler **once per keyed diff** — items that keep their key stay mounted across reorders, preserving DOM state (input focus, scroll position, animation) and avoiding remount work.

`.map()` in JSX produces a new array on every render and Pyreon has no way to reconcile — the entire list remounts on every update. That's fine for static arrays (one render) but catastrophic for signal-driven lists.

## Anti-pattern

```tsx
// BROKEN — remounts the full list on every update
<ul>{todos().map((t) => <li>{t.text}</li>)}</ul>
```

```tsx
// BROKEN — key is extracted by JSX, never reaches <For>
<For each={todos()} key={(t) => t.id}>
  {(t) => <li>{t.text}</li>}
</For>
```

```tsx
// BROKEN — index-based key defeats the reconciler
<For each={todos()} by={(_, i) => i}>
  {(t) => <li>{t.text}</li>}
</For>
// Reordering items keeps the same index-keys, so every item's DOM is
// reused for the WRONG logical item — focus and state scrambles.
```

## Related

- Detector: `for-missing-by` — fires on `<For each>` without `by`
- Detector: `for-with-key` — fires on `<For key>` (wrong prop name)
- Anti-pattern: "`key` on `<For>`" and "Missing `by` on `<For>`" in `jsx` category
- Reference API: `For` in `@pyreon/core` — see `get_api({ package: "core", symbol: "For" })`
