---
title: "Components run once: what the Pyreon compiler does with your JSX"
description: "No re-renders, no dependency arrays. A signal wires straight to the text node that shows it. Here is the compiled output, and the rules for what stays reactive."
date: 2026-11-16
slug: components-run-once
tags: [javascript, webdev, typescript, frontend]
cover: /blog/covers/components-run-once.png
---

Here is a counter in Pyreon, and below it is what the compiler actually turns it into. The function `Counter` runs once, when it mounts. After that, clicking `+` does not call `Counter` again, does not build a virtual tree and does not diff anything. It writes one signal, and the one text node that displays that signal changes. That is the whole runtime model, and it is visible in the compiler output.

```tsx
import { signal } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
    </div>
  )
}
```

This is the output of `transformJSX` from `@pyreon/compiler` for exactly that file (unedited apart from indentation and the parentheses around the returned expression):

```js
import { _tpl, _bindText } from "@pyreon/runtime-dom";
import { signal } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  return _tpl("<div><button>-</button><span> </span><button>+</button></div>", (__root) => {
    const __e0 = __root.firstElementChild;
    const __e1 = __e0.nextElementSibling;
    const __t2 = __e1.firstChild;
    const __e3 = __e1.nextElementSibling;
    __e0.__ev_click = () => count.update((n) => n - 1);
    const __d0 = _bindText(count, __t2);
    __e3.__ev_click = () => count.update((n) => n + 1);
    return __d0
  })
}
```

Three things are worth reading closely.

1. **The static markup is a string.** `_tpl` parses it once into a `<template>` and clones it per instance with `cloneNode(true)`. The `<span> </span>` holds a single space so the text node already exists in the clone.
2. **The dynamic part is one line.** `_bindText(count, __t2)` subscribes that text node directly to the `count` signal. There is no wrapping closure and no effect object for this shape: the compiler saw a bare signal read and passed the signal itself.
3. **The return value is the cleanup.** `__d0` unsubscribes the binding when the component unmounts. That is the only thing the component keeps alive.

When `count.update(...)` runs, the signal notifies its subscribers. Here there is exactly one, and it sets `__t2.data`. Nothing else in the tree is visited.

## Compared with re-rendering

In React, the same component is a function that runs on every state change:

```tsx
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button onClick={() => setCount((n) => n - 1)}>-</button>
      <span>{count}</span>
      <button onClick={() => setCount((n) => n + 1)}>+</button>
    </div>
  )
}
```

Each click re-runs `Counter`, produces a new element tree, and the reconciler compares it with the previous one to find the single text change. That design has real advantages (the component body is an ordinary function of state, which is easy to reason about), and it is why React needs `useMemo`, `useCallback`, `memo` and dependency arrays: every value in the body is recreated on each render, so you have to tell React which ones are stable.

In Pyreon the body runs once, so there is nothing to memoize. A handler defined in the body is created once. A `computed()` defined in the body is created once and tracks its own dependencies. There is no dependency array anywhere in the API, because a signal records who read it.

## Compared with Solid

Solid uses the same model: components run once, and signals update the DOM directly. Pyreon is not claiming to have invented it. If you know Solid, most of this post will feel familiar, and the differences are in the details of what the compiler does for you:

- **Bindings subscribe directly where they can.** `_bindText(count, node)` is not an effect wrapping `() => count()`. For the common shapes (a bare signal read, a member call such as `row.label()`), the compiler hands the runtime the signal itself, and the runtime subscribes the node with no intermediate closure.
- **Signal reads in component props become getters.** `<Greeting name={user().toUpperCase()} />` compiles to `<Greeting name={_rp(() => user().toUpperCase())} />`, and a bare signal read such as `name={user()}` to the direct form `_rpd(user)`. The runtime turns either into a getter on `props`. Reading `props.name` inside JSX or an effect subscribes.
- **`const` values derived from props stay reactive.** This one is shown below, because it is the rule people get wrong most often.

On performance between the two: on our deep component-tree mount benchmark (2,047 components), Solid is 1.15–1.18× faster than Pyreon, and that is our clearest framework loss. We say so in every comparison. (Synthetic, author-run, M3 Max; reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).)

## Reactive or static: the compiler decides per expression

Because the component body runs once, the question is never "will this re-render?" but "is this particular expression inside something that re-runs?" The [reactivity rules page](/docs/reactivity-rules) states it in one sentence:

> Signal reads inside reactive scopes re-evaluate when the signal changes. Signal reads outside reactive scopes evaluate once and become static.

A reactive scope is an `effect()`, a `computed()`, or a JSX expression the compiler wraps. The compiler wraps a JSX expression when it can see a call or a `props` read in it. The clearest way to see the rule is to feed the compiler one reactive and one static read side by side:

```tsx
function Price(props) {
  const total = signal(0)
  const snapshot = total()
  return (
    <p class={props.tone}>
      <span>{snapshot}</span> / <span>{total()}</span>
    </p>
  )
}
```

```js
return _tpl("<p><span></span> / <span> </span></p>", (__root) => {
  const __e0 = __root.firstChild;
  const __e1 = __e0.nextSibling.nextSibling;
  const __t2 = __e1.firstChild;
  _setChild(__e0, snapshot);                                           // written once
  const __d0 = _bindText(total, __t2);                                 // subscribed
  const __d1 = renderEffect(() => { _setClass(__root, props.tone) });  // subscribed
  return () => { __d0(); __d1() }
})
```

`snapshot` is a number captured at setup. The compiler emits `_setChild`, a one-time write. `total()` is a signal read in place, so it gets `_bindText`. `props.tone` is a getter read in place, so the class binding runs in a tracked `renderEffect`. Same signal, two outcomes, decided by where the read happens.

### Destructured props are captured once

```tsx
function Bad({ name }) {
  return <p>Hello, {name}</p>
}
```

```js
return _tpl("<p>Hello, <!></p>", (__root) => {
  const __p0 = __root.firstChild.nextSibling;
  _setChildAt(__root, __p0, name);
  return null
})
```

`name` was read out of `props` when the function started, so it is a plain value and the compiler writes it once. When the parent changes `name`, this paragraph does not update. Read `props.name` instead, or use `splitProps(props, ['name'])` when you need to separate a group of props from the rest; the pieces it returns keep their getters.

### `const` derived from props is inlined

This is the case where Pyreon's compiler does more than the usual signals rule of thumb ("never read props outside JSX"):

```tsx
function Greeting(props) {
  const name = props.name ?? 'stranger'
  return <p class={props.tone}>Hello, {name}!</p>
}
```

```js
const __d0 = bindPolymorphicText(() => (_fuse("Hello, ", (props.name ?? 'stranger'), "!")), __t0, __root);
const __d1 = renderEffect(() => { _setClass(__root, props.tone) });
```

The compiler sees that `name` is a `const` whose initializer reads `props`, so at the JSX use site it substitutes the initializer back in. The binding (the whole `Hello, …!` text, fused into one node) re-reads `props.name` whenever it changes. This works transitively (`const a = props.x; const b = a + 1`) and through `splitProps` results. It works only for `const`: a `let` can be reassigned, so inlining it would be unsound, and the compiler leaves it as a captured value. Outside JSX, `console.log(name)` still logs the value at setup, which is the correct behaviour for a plain variable.

The parent side, for completeness:

```tsx
function App() {
  const user = signal('Ada')
  return <Greeting name={user()} tone="warm" />
}
```

```js
return <Greeting name={_rpd(user)} tone="warm" />
```

`user()` became a reactive prop (`_rpd`, the direct form of `_rp` for a bare signal read). The literal `"warm"` did not, because there was nothing to track.

## The rules, in one table

This is the quick-reference table from the docs, shortened:

| Expression | Reactive? | Why |
| --- | --- | --- |
| `<div>{count()}</div>` | yes | the compiler wraps text children |
| `<div class={active() ? 'a' : 'b'} />` | yes | attributes containing a call are wrapped |
| `<Comp title={name()} />` | yes | compiled to `_rp()`, a getter on `props` |
| `props.title` in JSX | yes | it is a getter |
| `const x = props.title`, used in JSX | yes | inlined at the use site |
| `let x = props.title` | no | `let` is never inlined |
| `const { title } = props` | no | destructuring copies the value |
| `const x = count()` in the body | no | read once, at setup |
| `<Show when={() => x()}>` | yes | explicit accessor |
| `<For each={items} by={(i) => i.id}>` | yes | keyed reactive list |
| `items().map(...)` in the body | no | evaluated once; use `<For>` |

Two consequences follow from "the body runs once" that surprise people coming from React.

**An early return pins the component.** `if (loading()) return <Skeleton />` is evaluated once. If `loading` was true at mount, the component is a skeleton forever. Use `<Show when={loading} fallback={...}>` or return an accessor.

**Hooks may be conditional.** React forbids `if (x) useState()` because it identifies hooks by call order across renders. Pyreon has no second render, so a hook is an ordinary function call that must happen during setup. This is legal:

```tsx
function Panel(props: { mode: 'a' | 'b'; count: number }) {
  if (props.mode === 'a') {
    const draft = signal('')
    onMount(() => console.log('mounted a', draft()))
  }
  const cells = []
  for (let i = 0; i < props.count; i++) cells.push(signal(i))
  return <div>{cells.length}</div>
}
```

What is not legal is calling a hook after setup has finished: inside a click handler, a `setTimeout`, or after an `await`. There is no owner to attach to at that point.

## Lists: one binding per row, not per list

`<For>` takes the list and a key function. The key prop is `by`, not `key`, because JSX reserves `key`:

```tsx
<For each={todos} by={(t) => t.id}>
  {(t) => <li class={t.done() ? 'done' : ''}>{t.title()}</li>}
</For>
```

The render callback runs once per new key. Each row's `class` and text are separate bindings, so toggling one todo's `done` signal touches one `class` attribute in one `<li>`. A change to `t.title()` does not re-evaluate `t.done()`. Reordering the array moves existing DOM nodes by key; it does not re-run the callbacks.

## Common mistakes, and how they show up

Three mistakes account for most "my UI doesn't update" reports:

```tsx
// 1. Calling the signal with an argument does not write it.
count(5)          // a read; the argument is ignored
count.set(5)      // the write

// 2. Capturing a read before the JSX.
const open = isOpen()
return <div>{open ? <Modal /> : null}</div>      // never changes
return <div>{isOpen() ? <Modal /> : null}</div>  // reactive

// 3. A conditional that hides a read.
{() => touched() ? error() ?? '' : ''}
// while touched() is false, error() is never read, so never tracked
```

The third one is shared by every fine-grained system (Solid, Preact Signals and MobX behave the same way): an accessor subscribes only to the signals it actually read on its last run. If `touched` and `error` flip in the same batch, the accessor can miss the error. Read both before branching:

```tsx
{() => {
  const t = touched()
  const e = error()
  return t ? e ?? '' : ''
}}
```

You do not have to find these by hand. `@pyreon/lint` flags destructured props and `count(5)`, and the Reactivity Lens (from `pyreon-lint --lsp`) shows `live` / `static` hints on JSX expressions in your editor, using the compiler's own analysis. That tooling gets its own post on 14 December.

## What this model costs, and what's not done

The run-once model is not free, and the benchmark record says where:

- **Signal creation is about 5× slower than Preact Signals** on both V8 and JavaScriptCore (63 vs 13 ns per create+read+write on V8). If your app creates very large numbers of short-lived signals, that shows.
- **Deep component trees mount 1.15–1.18× slower than Solid.** The profiled cost is the per-component reactive-props getter chain, not element creation. A null-prototype props object shipped in November narrowed it; it did not close it.
- **Bundle:** the same keyed-table app is 17.2 KB gzipped in Pyreon against Solid's 7.5 KB and Preact's 10.1 KB.

*Synthetic, author-run, M3 Max; reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

And on the design side:

- **Static-by-default reads take learning.** A React developer's instinct is that everything in the body is current. Here, a plain read in the body is a snapshot. The compiler and the lint rules catch the common forms, but a read buried in non-JSX code (a `.filter()` over a signal in the component body, for instance) is still on you to wrap in `computed()`.
- **Plain Mode is experimental.** If you want `let count = state(0); count++` with destructured props that stay live, the `'use plain'` dialect compiles that into the same signal code. It works today but is marked experimental, and this post describes the default dialect.
- **Pyreon is 0.x (currently 0.53.0).** Breaking changes ship as minor versions.

If you want to check any of the compiled output above, paste a component into `transformJSX` (exported from `@pyreon/compiler`) and read what comes back. The rules are not a convention we ask you to follow; they are what the compiler emits.

**Read next:** the full reactivity rules, with every edge case: [pyreon.dev/docs/reactivity-rules](/docs/reactivity-rules)
