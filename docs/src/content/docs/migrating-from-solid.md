---
title: Coming from Solid
description: Pyreon and Solid share the same fine-grained-reactivity model — this is mostly an API-surface map, plus the few real differences (signal shape, keyed <For>, the full-stack story).
---

Pyreon and Solid are the same family: compiled JSX, fine-grained signals, components that run **once**, `cloneNode` templates with per-node bindings. If you know Solid, the mental model transfers exactly. What changes is mostly the shape of a few APIs.

## Signals: callable-with-method, not a tuple

The one difference you'll touch constantly. Solid's `createSignal` returns a `[getter, setter]` tuple; Pyreon's `signal` returns a single callable that carries `.set` / `.update`.

```tsx
// Solid
const [count, setCount] = createSignal(0)
count()            // read
setCount(1)        // write
setCount(c => c+1) // update
```

```tsx
// Pyreon
const count = signal(0)
count()              // read (same)
count.set(1)         // write
count.update(c => c+1) // update
```

Reading is identical (`count()`). Writing moves from a separate `setCount` to `count.set` on the same value. That's the bulk of the diff.

## API map

| Solid | Pyreon | Notes |
| --- | --- | --- |
| `createSignal(v)` → `[get, set]` | `signal(v)` → callable + `.set`/`.update` | read `s()`, write `s.set()` |
| `createMemo(fn)` | `computed(fn)` | identical semantics |
| `createEffect(fn)` | `effect(fn)` | identical; auto-tracked |
| `onMount(fn)` | `onMount(fn)` | same |
| `onCleanup(fn)` | `onCleanup(fn)` | same (or return cleanup from `onMount`) |
| `createContext` / `useContext` | `createContext` / `useContext` | reactive contexts return an accessor — call to read |
| `createStore` | `createStore` | both ship it |
| `createSelector` | `createSelector` | same O(1) selection primitive |
| `batch(fn)` | `batch(fn)` | same |
| `untrack(fn)` | `untrack(fn)` | same |
| `<Show when={c()}>` | `<Show when={c}>` | Pyreon accepts an accessor **or** a value |
| `<Index>` / `<Switch>` / `<Match>` | same names | same control-flow set |

## The one JSX difference: keyed `<For>`

Solid's `<For>` keys by **reference identity** of each item. Pyreon's `<For>` keys by an explicit **`by`** function. (Pyreon reserves the `key` prop for VNode reconciliation, so list keys are `by`.)

```tsx
// Solid
<For each={rows()}>{row => <tr>{row.label}</tr>}</For>
```

```tsx
// Pyreon — note `by` and that `each` takes the signal, not a call
<For each={rows} by={row => row.id}>{row => <tr>{row.label}</tr>}</For>
```

Two things: pass the **signal** to `each` (not `rows()`), and give it a stable `by` key. (`<Index>` is available when you want index-based keying like Solid's.)

## Reactive item reads in `<For>`

A `<For>` callback's `row` is a runtime item, not reactive props. A bare property read (`row.label`) is baked statically — fine when the row doesn't change. For a per-row reactive value, the row field should itself be a signal and you call it:

```tsx
// row.label is a signal -> read it as row.label() to track per-row updates
<For each={rows} by={r => r.id}>
  {row => <tr><td>{row.id}</td><td>{() => row.label()}</td></tr>}
</For>
```

This matches Solid's per-row `createSignal` pattern exactly — only the read syntax differs.

## Full-stack: zero vs SolidStart

Solid's meta-framework is SolidStart. Pyreon's is [`@pyreon/zero`](/docs/zero) — file-system routing, SSR/SSG/ISR/SPA (configurable per route), server actions, image/font optimization, and deploy adapters, all in one install. The routing, data ([`@pyreon/query`](/docs/query)), forms ([`@pyreon/form`](/docs/form)), and devtools are signal-aware out of the box.

## A side-by-side

```tsx
// Solid
function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return <button onClick={() => setCount(c => c + 1)}>{count()} / {doubled()}</button>
}
```

```tsx
// Pyreon
function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return <button onClick={() => count.update(c => c + 1)}>{count()} / {doubled()}</button>
}
```

## Cheat sheet

- `const [c, setC] = createSignal()` → `const c = signal()`; write `c.set()` / `c.update()`
- `createMemo` → `computed`, `createEffect` → `effect` (names only)
- `onMount` / `onCleanup` / `batch` / `untrack` / `createStore` / `createSelector` — same
- `<For each={rows()}>` → `<For each={rows} by={r => r.id}>` (pass the signal, add `by`)
- `<Show when={c()}>` → `<Show when={c}>` (accessor or value both fine)
- SolidStart → [`@pyreon/zero`](/docs/zero)

The honest summary: if you're productive in Solid, you'll be productive in Pyreon within an afternoon — the reactivity model is the same, and the differences are a handful of API shapes you'll memorize in the first hour.
