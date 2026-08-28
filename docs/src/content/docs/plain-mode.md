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
| `let user = state({ name: 'Ada' })` | `const user = signal(createStore({ name: 'Ada' }))` — **deep state** (below) |
| `let cfg = state.raw({ big: true })` | `const cfg = signal({ big: true })` — shallow opt-out |
| `count` (read) | `count()` |
| `count = count + 1` | `count.set(count() + 1)` |
| `count += n` · `count++` · `count \|\|= x` | `.set(...)` forms with exact JS value semantics (postfix returns the old value) |
| `const d = derived(count * 2)` | `const d = computed(() => (count() * 2))` |
| `effect(() => { ... })` | `effect` with **total tracking** (below) |
| `function C({ name, size = 'm' })` | `(props)` with live `props.name` / `(props.size ?? 'm')` reads |
| `if (loading) return <Spinner/>` in a component | the statement tail becomes a returned accessor — the branch re-evaluates |

## Deep state

A **literal object or array** initializer makes the state deep — backed by
`createStore`'s per-key proxy behind an outer signal:

```tsx
'use plain'
import { state } from '@pyreon/core/plain'

let todos = state([{ text: 'ship', done: false }])
let user = state({ name: 'Ada' })

todos.push({ text: 'test', done: false }) // notifies — the DOM updates
todos[0].done = true                      // per-key: only .done subscribers re-run
user.name = 'Grace'                       // notifies .name subscribers
user = { name: 'Bo' }                     // whole replace — every subscriber re-reads
```

Member reads track **per key**: an effect reading `user.name` does not re-run
when `user.age` changes. Total tracking extends to static member paths — a
branch-gated `user.name` read is subscribed from the first run.

Two escapes, both static and visible at the declaration:

- `state.raw({...})` — a shallow signal even for a literal: replace-the-value
  semantics (`cfg = { ...cfg, k: v }`), member mutation warns.
- A **non-literal** initializer (`state(makeConfig())`) is always a shallow
  signal — the deep/shallow split is decided at compile time, never at runtime.

## Total tracking

Classic fine-grained tracking subscribes to what a run actually **reads** — so a read hidden behind a false branch, an `await`, or a nested callback is silently not subscribed (the "conditional reads hide tracking" trap). Plain Mode's `effect` and `derived` subscribe to every state binding the callback **statically mentions**: conditionally-read state is hoisted into a prologue read, so the subscription exists from the first run. Write-only bindings are never hoisted — an effect that assigns state does not retrigger itself.

The trade: an effect may re-run when a branch it will not take changes its dependency. That is deliberate — predictability over minimal re-runs.

## What warns instead of silently misbehaving

- **Deep mutation on SHALLOW state** (`state.raw` / non-literal initializers): `obj.k = v` mutates in place and notifies nobody. Replace the value — or use a literal initializer to get deep state, where mutation just works.
- **Compound assignment / `++` on a deep-state binding** (`user += 1`) — mutate a property or assign a full value.
- **Destructuring assignment** onto state, and `for (x of …)` heads writing state.
- **Rest / nested props patterns** (`{ a, ...rest }`) — take `props` and read directly.
- **Assigning to `derived`, to props, or to imported state.**

## If the compiler did not run

The markers throw at runtime with the fix — a plain module that reaches `state()` uncompiled means the `pyreon()` Vite plugin is missing or the file bypassed it. Silent degradation would render a non-reactive page that looks right on first paint, which is worse than an error.

## Migrating classic code

`pyreon plain` is the readiness report + codemod:

```bash
pyreon plain            # per-file readiness: converts fully / partial / declined, with reasons
pyreon plain --write    # apply the classic → plain codemod in place
```

Safety is per-binding: a binding converts only when **every** reference has a
plain form (`x()` reads, `.set`/simple `.update` writes, `.peek` →
`untrack(() => x)`); anything else — a signal passed as a value,
`.subscribe`, a `.set` whose result is used — stays byte-untouched with a
named reason, and the declined-shape histogram shows a project's real
migration cost. Object-literal signals become `state.raw(...)`, never deep
state — the codemod never changes semantics. The codemod is one half of a
round-trip fuzz oracle (classic → codemod → compile → behavioral DOM diff
against the direct classic compile) that gates both directions in CI.

## Native targets

Plain Mode crosses to iOS/Android for free: the native compiler runs the same
`transformPlain` pre-pass before its own parse, so a plain shared-source file
produces **byte-identical** Swift and Compose output to its classic twin.

## Editor verdicts

The Reactivity Lens understands plain files: structural live/static verdicts
come from the real compile (the pre-pass is line-preserving), and every
declined rewrite the pre-pass warns about surfaces as a `plain-mode` footgun
finding at its source location.

## TypeScript

`state<T>(v: T): T` deliberately returns the **value type** — `count * 2` typechecks, `count = 5` typechecks, and `let` is the honest keyword for a binding you assign. The compiled output uses `const` + `.set()`; the types describe the dialect's semantics.
