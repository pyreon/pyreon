---
title: "Your component runs once. Here’s what replaced the re-render"
description: "Delete useMemo, useCallback and every dependency array. A Pyreon component runs one time, and a signal change updates the one text node that shows it. Here is the real compiler output that makes it work."
date: 2026-11-16
slug: components-run-once
tags: [javascript, webdev, typescript, frontend]
cover: /blog/covers/components-run-once.png
---

You know the afternoon. A list stutters, the profiler lights up, and you spend three hours learning that a callback got a new identity on every render. The fix is one `useCallback`. The lesson is that you now have to think about renders forever.

Pyreon removes the question. A component function runs **once**, when it mounts. When data changes, the one text node that shows it updates, and nothing else in the tree is visited. Nothing re-runs, so there is nothing to memoise: no `useMemo`, no `useCallback`, no dependency arrays.

Skipping all that work shows up on the clock. Pyreon builds 10,000 table rows **2.6× faster than React 19** (72.6 ms vs 192.0 ms). You don't take our word for any of it: the compiler output below shows exactly what runs.

*Synthetic, author-run, Apple M3 Max, real Chromium. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

> **The best re-render is the one that never happens.**

## Ten lines in, one binding out

Here is a counter:

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

And here is what `transformJSX` from `@pyreon/compiler` turns it into (unedited apart from indentation and the parentheses around the returned expression):

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

Read it slowly, because the whole runtime model is on screen:

1. **The static markup is a string.** `_tpl` parses it once into a `<template>`, caches it, and clones it for every instance. The `<span> </span>` carries a single space so the text node already exists in the clone.
2. **The dynamic part is one line.** `_bindText(count, __t2)` subscribes that text node straight to the `count` signal. No wrapping closure, no effect object: the compiler saw a bare signal read and handed over the signal itself.
3. **The return value is the cleanup.** `__d0` unsubscribes the binding on unmount. It is the only thing the component keeps alive.

Click `+` and `count` notifies its one subscriber, which writes `__t2.data`. That's the entire update.

## What you stop writing

In React the same component re-runs on every click. It builds a new element tree, and the reconciler diffs it against the old one to find a single changed character. That model has a real upside (the body is a plain function of state), and it is the reason `useMemo`, `useCallback`, `memo` and dependency arrays exist: every value in the body is recreated on each render, so you have to tell React which ones are stable.

When the body runs once, that whole layer disappears:

- A handler defined in the body is created once.
- A `computed()` defined in the body is created once and tracks its own dependencies.
- There is no dependency array anywhere in the API, because a signal records who read it.

## Familiar if you know Solid, with more done for you

Solid uses the same run-once model, and we're happy to say so. Where Pyreon goes further is in how much the compiler handles for you:

- **Bindings subscribe directly where they can.** For common shapes (a bare signal read, a member call such as `row.label()`), the runtime gets the signal itself and subscribes the node with no closure in between.
- **Signal reads in component props become getters.** `<Greeting name={user().toUpperCase()} />` compiles to `name={_rp(() => user().toUpperCase())}`, and a bare read such as `name={user()}` to the direct form `_rpd(user)`. Either becomes a getter on `props`, so reading `props.name` inside JSX or an effect subscribes.
- **A `const` derived from props stays reactive.** This is the rule people trip on most, so it gets its own section below.

On speed between the two, we publish the result even though it goes against us: on our deep component-tree mount benchmark (2,047 components), Solid mounts 1.15–1.18× faster. It is our clearest framework loss, and you will find it on the [benchmarks page](/docs/benchmarks) next to our wins. (Apple M3 Max, real Chromium, synthetic, author-run.)

## Live or static: the compiler decides per expression

Since the body runs once, the question is never "will this re-render?". It is "does this read sit inside something that re-runs?". The [reactivity rules page](/docs/reactivity-rules) puts it in one sentence:

> Signal reads inside reactive scopes re-evaluate when the signal changes. Signal reads outside reactive scopes evaluate once and become static.

A reactive scope is an `effect()`, a `computed()`, or a JSX expression the compiler wraps. Feed the compiler one live read and one snapshot side by side and you can watch it decide:

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

`snapshot` is a number captured at setup, so it gets `_setChild`, a one-time write. `total()` is a signal read in place, so it gets `_bindText`. `props.tone` is a getter read in place, so the class runs in a tracked `renderEffect`. Same signal, two outcomes, decided by where you read it.

### Destructured props are captured once

```tsx
function Bad({ name }) {
  return <p>Hello, {name}</p>
}
```

```js
return _tpl("<p></p>", (__root) => {
  _setChild(__root, _fuse("Hello, ", name));
  return null
})
```

`name` came out of `props` when the function started, so it is a plain value, and the compiler writes the text once. When the parent changes `name`, this paragraph stays put. Read `props.name` instead, or use `splitProps(props, ['name'])` to carve out a group of props; the pieces it returns keep their getters.

### A `const` derived from props is inlined

Here the compiler does more than the usual signals rule of thumb ("never read props outside JSX"):

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

The compiler sees that `name` is a `const` whose initializer reads `props`, so it substitutes the initializer back in at the JSX use site. The whole `Hello, …!` text is fused into one node and re-reads `props.name` whenever it changes. It works transitively (`const a = props.x; const b = a + 1`) and through `splitProps` results.

It works only for `const`. A `let` can be reassigned, so inlining it would be unsound, and the compiler leaves it as a captured value. Outside JSX, `console.log(name)` still logs the setup value, which is exactly what a plain variable should do.

The parent side:

```tsx
function App() {
  const user = signal('Ada')
  return <Greeting name={user()} tone="warm" />
}
```

```js
return <Greeting name={_rpd(user)} tone="warm" />
```

`user()` became a reactive prop. The literal `"warm"` stayed a literal, because there is nothing to track.

> **You write what you mean, and it stays fast. Nobody has to babysit the renders.**

## The rules on one card

| Expression | Live? | Why |
| --- | --- | --- |
| `<div>{count()}</div>` | yes | the compiler wraps text children |
| `<div class={active() ? 'a' : 'b'} />` | yes | attributes containing a call are wrapped |
| `<Comp title={name()} />` | yes | compiled to `_rp()` / `_rpd()`, a getter on `props` |
| `props.title` in JSX | yes | it is a getter |
| `const x = props.title`, used in JSX | yes | inlined at the use site |
| `let x = props.title` | no | `let` is never inlined |
| `const { title } = props` | no | destructuring copies the value |
| `const x = count()` in the body | no | read once, at setup |
| `<Show when={() => x()}>` | yes | explicit accessor |
| `<For each={items} by={(i) => i.id}>` | yes | keyed reactive list |
| `items().map(...)` in the body | no | evaluated once; use `<For>` |

Two consequences of "the body runs once" surprise people coming from React.

**An early return pins the component.** `if (loading()) return <Skeleton />` is evaluated once. If `loading` was true at mount, that component is a skeleton forever. Use `<Show when={loading} fallback={...}>`, or return an accessor.

**Hooks can be conditional.** React forbids `if (x) useState()` because it identifies hooks by call order across renders. Pyreon has no second render, so a hook is an ordinary function call that has to happen during setup. This is legal:

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

What is not legal is calling a hook after setup has finished: inside a click handler, a `setTimeout`, or after an `await`. By then there is no owner to attach it to.

## Lists: one binding per row

`<For>` takes the list and a key function. The key prop is `by`, because JSX reserves `key`:

```tsx
<For each={todos} by={(t) => t.id}>
  {(t) => <li class={t.done() ? 'done' : ''}>{t.title()}</li>}
</For>
```

The render callback runs once per new key. Each row's `class` and text are separate bindings, so toggling one todo's `done` touches one `class` attribute on one `<li>`. A change to `t.title()` never re-evaluates `t.done()`. Reordering the array moves the existing DOM nodes by key without re-running a single callback.

## Three mistakes, and how they show up

Most "my UI doesn't update" reports come down to three shapes:

```tsx
// 1. Calling the signal with an argument does not write it.
count(5)          // a read; the argument is ignored
count.set(5)      // the write

// 2. Capturing a read before the JSX.
const open = isOpen()
return <div>{open ? <Modal /> : null}</div>      // never changes
return <div>{isOpen() ? <Modal /> : null}</div>  // live

// 3. A conditional that hides a read.
{() => touched() ? error() ?? '' : ''}
// while touched() is false, error() is never read, so never tracked
```

The third one belongs to every fine-grained system (Solid, Preact Signals and MobX behave the same way): an accessor subscribes only to the signals it read on its last run. If `touched` and `error` flip in the same batch, the accessor can miss the error. Read both before you branch:

```tsx
{() => {
  const t = touched()
  const e = error()
  return t ? e ?? '' : ''
}}
```

You won't hunt for the first two by hand. `@pyreon/lint` flags destructured props and `count(5)`, and the Reactivity Lens (served by `pyreon-lint --lsp`) prints `live` or `static` next to JSX expressions in your editor, straight from the compiler's own analysis. That tooling gets its own post on 14 December.

## What this model costs

We publish where we lose, so you can trust where we win. Here is the price of run-once, straight from the benchmark record (Apple M3 Max, synthetic, author-run; reproduce it from the [benchmarks page](/docs/benchmarks)):

- **Creating a signal is about 5× slower than in Preact Signals** on both V8 and JavaScriptCore (63 vs 13 ns per create+read+write on V8). An app that creates huge numbers of short-lived signals will feel it.
- **Deep component trees mount 1.15–1.18× slower than in Solid.** The profiled cost is the per-component reactive-props getter chain, not element creation. A null-prototype props object shipped in November and narrowed the gap without closing it. A newer compiler change forwards pass-through props without adding a getter per level; it landed after the record was taken, so its effect is not in the published numbers yet.
- **Bundle:** the same keyed-table app is 17.2 KB gzipped in Pyreon, against 7.5 KB for Solid and 10.1 KB for Preact.

And on the design side:

- **Static-by-default reads take a little learning.** A React developer expects everything in the body to be current. Here, a plain read in the body is a snapshot. The compiler and the lint rules catch the common forms; a read buried in non-JSX code (a `.filter()` over a signal in the body, say) is still yours to wrap in `computed()`.
- **Prefer to skip the rules entirely?** Plain Mode (experimental) lets you write `let count = state(0); count++` with destructured props that stay live, and the `'use plain'` dialect compiles it to the same signal code. This post covers the default dialect.
- **Pyreon is pre-1.0 (0.53.0 today).** Breaking changes ship as minor versions.

Want to check any of this yourself? Paste a component into `transformJSX` (exported from `@pyreon/compiler`) and read what comes back. These rules are not conventions we ask you to follow. They are what the compiler emits.

## Build something with it

```bash
npm create @pyreon/zero@latest
```

- The full rules, every edge case: [reactivity rules](/docs/reactivity-rules)
- Docs: [pyreon.dev/docs](/docs)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
