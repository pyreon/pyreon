---
title: 'Plain Mode'
description: An experimental compile-time dialect — reactive Pyreon code written as plain JavaScript, with no call parentheses, no .set(), and destructuring that stays live.
---

Plain Mode is an **experimental** compile-time dialect. You write ordinary JavaScript — reads without `()`, writes with `=`, props destructured in the signature — and the compiler emits the exact classic-Pyreon code you would have written by hand. It is a pre-pass inside the compiler: templates, SSR, hydration and the native backend all see classic code, and the output is byte-identical across compiler backends.

```tsx
'use plain'
import { state, derived, effect } from '@pyreon/core/plain'

let count = state(0)
const double = derived(count * 2)

effect(() => {
  if (count > 5) console.log('big:', double)
})

export function Counter({ label, step = 1 }) {
  return <button onClick={() => { count += step }}>{label}: {count} / {double}</button>
}
```

Everything above is live: the button text updates on click, `double` re-derives, the effect re-runs — including after `count > 5` flips, even though the first run never reached the `double` read.

## Activation

A module opts in with the `'use plain'` directive **or** by importing from `@pyreon/core/plain`. Everything else is untouched, byte-for-byte. The markers — `state`, `derived`, `effect` — are ordinary named imports recognized by their import source, not their spelling (aliasing works). They exist only at compile time: the pre-pass rewrites them to `signal` / `computed` / `effect` from `@pyreon/reactivity` and removes the import.

Plain Mode works in `.tsx`/`.jsx` components and in `.ts`/`.mts` store modules (the Vite plugin detects the markers).

## The three laws

1. **A read is a read.** Mentioning a binding yields its value — in JSX, in a template literal, in a function argument, in a condition. `` `${count}` `` interpolates the number, never a function source.
2. **Liveness comes from position.** JSX positions, `derived`, and `effect` re-run; a plain statement (`const snapshot = count`) is a one-time value, exactly like classic Pyreon.
3. **Arguments are values; module exports are live.** `foo(count)` passes the number. `export let count = state(0)` exports the live signal — importers (classic or plain) stay reactive, and assigning to an imported binding is an error, the same law ESM already has. Write through an exported function instead.

## What compiles to what

| You write | It compiles to |
| --- | --- |
| `let count = state(0)` | `const count = signal(0)` |
| `count` (read) | `count()` |
| `count = count + 1` | `count.set(count() + 1)` |
| `count += n` · `count++` · `count \|\|= x` | `.set(...)` forms with exact JS value semantics (postfix returns the old value) |
| `const d = derived(count * 2)` | `const d = computed(() => (count() * 2))` |
| `effect(() => { ... })` | `effect` with **total tracking** (below) |
| `function C({ name, size = 'm' })` | `(props)` with live `props.name` / `(props.size ?? 'm')` reads |
| `if (loading) return <Spinner/>` in a component | the statement tail becomes a returned accessor — the branch re-evaluates |

## Total tracking

Classic fine-grained tracking subscribes to what a run actually **reads** — so a read hidden behind a false branch, an `await`, or a nested callback is silently not subscribed (the "conditional reads hide tracking" trap). Plain Mode's `effect` and `derived` subscribe to every state binding the callback **statically mentions**: conditionally-read state is hoisted into a prologue read, so the subscription exists from the first run. Write-only bindings are never hoisted — an effect that assigns state does not retrigger itself.

The trade: an effect may re-run when a branch it will not take changes its dependency. That is deliberate — predictability over minimal re-runs.

## What warns instead of silently misbehaving

- **Deep mutation**: `obj.k = v` on plain state mutates in place and notifies nobody. Replace the value: `obj = { ...obj, k: v }`. (A deep store-backed `state(object)` is a tracked follow-up.)
- **Destructuring assignment** onto state, and `for (x of …)` heads writing state.
- **Rest / nested props patterns** (`{ a, ...rest }`) — take `props` and read directly.
- **Assigning to `derived`, to props, or to imported state.**

## If the compiler did not run

The markers throw at runtime with the fix — a plain module that reaches `state()` uncompiled means the `pyreon()` Vite plugin is missing or the file bypassed it. Silent degradation would render a non-reactive page that looks right on first paint, which is worse than an error.

## TypeScript

`state<T>(v: T): T` deliberately returns the **value type** — `count * 2` typechecks, `count = 5` typechecks, and `let` is the honest keyword for a binding you assign. The compiled output uses `const` + `.set()`; the types describe the dialect's semantics.
