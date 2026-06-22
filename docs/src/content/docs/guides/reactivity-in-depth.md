---
title: "Reactivity in Depth"
description: "How Pyreon's signals, computeds, and effects work — the components-run-once model, where reactivity lives, batching, untracking, and selectors."
---

# Reactivity in Depth

Pyreon's reactivity is fine-grained: a signal change updates exactly the DOM that depends on it, never a component re-render. The mental model is one rule:

> **Components run once. What's reactive depends on WHERE you read a signal.**

Master that rule and every other behavior follows.

## The three primitives

```tsx
import { signal, computed, effect } from '@pyreon/reactivity'

const count = signal(0)                       // read: count(), write: count.set(1)
const double = computed(() => count() * 2)    // derived, cached, auto-tracked
effect(() => console.log('count is', count())) // re-runs when count changes
```

- `signal<T>(initial)` — a callable. `count()` reads (and subscribes the current scope), `count.set(v)` / `count.update(fn)` write.
- `computed(fn)` — a memoized derived signal; recomputes only when a dependency changes.
- `effect(fn)` — a side-effect that re-runs when its tracked dependencies change. Return a cleanup function or use `onCleanup`.

Signals, computeds, and effects, live:

<Example file="./examples/reactivity/signals-read-write-react" />

Derived values with `computed`:

<Example file="./examples/reactivity/computed-derived-values" />

Side effects on change:

<Example file="./examples/reactivity/effects-side-effects-on-signal-change" />

## Where reactivity lives

Because components run once, a signal is reactive only where it's read inside a tracking scope:

```tsx
function Counter() {
  const count = signal(0)
  // Reactive — JSX text expression is a tracking scope:
  return <button onClick={() => count.set(count() + 1)}>{() => count()}</button>
}
```

- **DOM text / attributes with signal reads** → reactive (the compiler wraps them).
- **Component props containing signal reads** → reactive (the compiler wraps with `_rp`).
- **`const x = props.y` in JSX** → reactive (the compiler inlines `props.y` back at the use site).
- **Destructuring props / `let` from props** → captured once, **static**.

## Batching and untracking

- **`batch(fn)`** — coalesce multiple writes into one update pass. Three-plus writes in a row should be batched.
- **`untrack(fn)`** — read signals without subscribing, when you want a value but not a dependency.
- **`createSelector(source)`** — O(1) keyed membership for large lists (e.g. selected-row highlighting) instead of O(n) per-row checks.

```tsx
import { batch, untrack } from '@pyreon/reactivity'

batch(() => {
  first.set('Ada')
  last.set('Lovelace')
}) // one update, not two
```

## Common pitfalls

- **`signal(5)` to write.** That reads and ignores the argument. Use `signal.set(5)` / `signal.update(n => n + 1)`. (Dev mode warns.)
- **Conditional reads hide tracking.** `{() => cond() ? a() : ''}` only subscribes to `a` while `cond` is true; a write to `a` in the same batch that flips `cond` is missed. Read both into consts first.
- **Destructuring props.** `const { value } = props` captures once. Read `props.value` in the reactive scope, or use `splitProps`.
- **`.peek()` inside an effect/computed.** It bypasses tracking — only use it deliberately for loop-prevention or imperative-ref reads.

## Related

- [Reactivity reference](/docs/reference/reactivity) · [Reactivity Rules](/docs/reactivity-rules)
- [Signal reads and writes](/docs/patterns/signal-writes)
- [Performance](/docs/guides/performance) · [State Management](/docs/guides/state-management)
