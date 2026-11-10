---
title: "The seven rules of fine-grained reactivity"
description: "In Pyreon a component runs once, and seven rules decide what updates afterwards. Each one comes with the broken version, the fix, and the tool that catches it before you ship."
date: 2027-02-01
slug: seven-rules-of-fine-grained-reactivity
tags: [javascript, typescript, reactivity, webdev]
cover: /blog/covers/seven-rules-of-fine-grained-reactivity.png
---

This component compiles, renders and looks perfect. Two of its four dynamic values will never update:

```tsx
function Badge(props: { count: number; label: string }) {
  const { label } = props
  const doubled = props.count * 2
  let tripled = props.count * 3
  return (
    <span title={label}>
      {props.count} / {doubled} / {tripled}
    </span>
  )
}
```

Spot them? `props.count` and `doubled` stay live. `label` and `tripled` are frozen at mount. You don't have to spot them, though. Here is what Pyreon's compiler reports for this file through the MCP `explain_reactivity` tool (abridged):

```text
   2 |   const { label } = props
               ^ ⚠ footgun [props-destructured-body] — Destructuring `props` in the
                 component body captures the values ONCE during setup …
   7 |       {props.count} / {doubled} / {tripled}
              ^ ◆ live — live — this text re-renders whenever its signals change
                              ^ ◆ live — live — this text re-renders whenever its signals change
                                          ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)
```

Pyreon components **run once**. There is no re-render pass to pick up a value you forgot to track, and no dependency array to forget. The compiler wires each signal read to the exact DOM node that uses it, and everything else is a plain value. Updates are cheap because of that, and it means *where* you read a value decides whether it updates.

Seven rules cover it. Learn them over one coffee, and "why didn't it update?" stops being a question. Each rule below comes with the tool that catches the mistake:

- **`@pyreon/lint`**: 133 rules, run as `pyreon-lint` or through its LSP server (`pyreon-lint --lsp`).
- **Compiler detectors**: the checks behind the MCP `validate` tool and the `pyreon check` CLI (`pyreon check --fix` applies the mechanically safe fixes).
- **Reactivity Lens**: the compiler's own live/static verdict, shown as inlay hints in your editor through the same LSP server.

## Rule 1: call a signal to read it, `.set()` it to write

```tsx
const count = signal(0)

// ✗ reads count and ignores the argument; nothing is written
<button onClick={() => count(count() + 1)}>+1</button>

// ✓
<button onClick={() => count.set(count() + 1)}>+1</button>
<button onClick={() => count.update((n) => n + 1)}>+1</button>
```

A signal is a function you call to read. Calling it with an argument is still a read. The dev build warns at runtime, but only after the write has silently done nothing, so catch it earlier.

**Caught by:** detector `signal-write-as-call` (auto-fixable with `pyreon check --fix`) and lint rule `pyreon/no-signal-call-write` (error).

## Rule 2: a read at setup is a snapshot

The body runs once, so anything you compute there is computed once:

```tsx
export function App() {
  const count = signal(0)
  const snapshot = count()          // ✗ the value at mount, forever
  return <p>{snapshot}</p>          // baked once
}
```

Read the signal where you use it, or derive it:

```tsx
return <p>{count()}</p>                       // ✓ live
const doubled = computed(() => count() * 2)   // ✓ live wherever it is read
```

Signal reads in JSX text, attributes and component props are tracked, and the compiler turns prop reads into getters for the child. Reads inside `effect()` and `computed()` are tracked. Reads in plain setup code are not.

**Caught by:** the Reactivity Lens, which marks `{snapshot}` as baked once where you expected live. No detector flags this shape on purpose: a setup snapshot is sometimes exactly what you want, and seeding an initial value is the common case.

## Rule 3: don't destructure props

```tsx
// ✗ title is captured once
function Card({ title }: { title: string }) {
  return <h2>{title}</h2>
}

// ✓ props.title is a getter, read inside JSX
function Card(props: { title: string }) {
  return <h2>{props.title}</h2>
}

// ✓ need to carve out a group? splitProps keeps the getters
function Card(props: { title: string; class?: string }) {
  const [own, rest] = splitProps(props, ['title'])
  return <h2 {...rest}>{own.title}</h2>
}
```

When a parent passes `title={name()}`, the compiler turns that prop into a getter on `props`. Destructuring calls the getter once and keeps the result. If you come from React, where destructuring is idiomatic, this is the habit to unlearn first.

**Caught by:** lint `pyreon/no-props-destructure` (error), detectors `props-destructured` (in the signature) and `props-destructured-body` (in the body), and the Lens.

## Rule 4: a `const` from props stays live, `let` and `var` don't

```tsx
function Price(props: { amount: number; currency: string }) {
  const label = `${props.amount} ${props.currency}`  // ✓ inlined at the use site
  let rounded = Math.round(props.amount)              // ✗ captured once
  return <span>{label} (~{rounded})</span>
}
```

The compiler recognises a `const` derived from `props.*`, including chains (`const a = props.x; const b = a + 1`), and inlines the expression back into each JSX use site. `{label}` behaves as if you had written the template literal right there. It can't do that for `let` or `var`, because they can be reassigned. Outside JSX, in a `console.log(label)` for example, the `const` is an ordinary captured value, as you'd expect.

**Caught by:** the Lens, which marks `{rounded}` as baked once. No lint rule targets this, because `let` is legitimate when the value really is fixed.

## Rule 5: spread keeps reactivity, copying loses it

```tsx
// ✓ both keep the getters intact
<Input {...rest} />
<input {...rest} />

// ✗ Object.assign and object spread call every getter and copy the values
const merged = Object.assign({}, props, { class: 'field' })
const copied = { ...props, class: 'field' }

// ✓ copy property descriptors instead
const merged = mergeProps({ class: 'field' }, props)   // later sources win
```

JSX spread is handled by the compiler and the runtime. A hand-written copy is ordinary JavaScript: it reads each getter once and stores the result. `mergeProps` and `splitProps` from `@pyreon/core` copy descriptors instead. Writing your own helper? Use `Object.getOwnPropertyDescriptors` plus `Object.defineProperty` with `configurable: true`.

**Caught by:** no static check today, and we'd rather tell you than let you assume one. The rule is in the anti-pattern catalog (`get_anti_patterns` over MCP), and it is the most common way wrapper libraries break reactivity. Give any helper that copies `props` a second look in review.

## Rule 6: early returns run once

```tsx
// ✗ pinned to whichever branch the first run took
export function Profile() {
  const loading = signal(true)
  if (loading()) return <p>Loading…</p>
  return <h1>Ready</h1>
}

// ✓
export function Profile() {
  const loading = signal(true)
  return (
    <Show when={() => !loading()} fallback={<p>Loading…</p>}>
      <h1>Ready</h1>
    </Show>
  )
}
```

In a re-rendering framework the `if` runs again on every change. Here it runs once. You can also return an accessor, `return () => (loading() ? <Spinner /> : <Content />)`, which re-runs whenever its signals change. `<Show>` and `<Match>` accept a value or an accessor; a condition that should change needs the accessor.

**Caught by:** detectors `static-early-return-conditional` and `static-return-null-conditional`. Here is the `validate` finding for the broken version:

```text
static-early-return-conditional (line 5)
Pyreon components run ONCE — this early return is evaluated exactly once at mount;
the signal read `loading()` in the condition never re-evaluates the branch …
Fix: return (() => loading() ? <Fallback /> : <Content />)
```

The detector is narrow by design. It fires when the condition calls a signal, a computed or a `useX()` result declared in the component. An early return on `props.loading` is the same bug and is **not** flagged today, because a broader match produced too many false positives on legitimate setup guards.

## Rule 7: lists use `<For by>`, conditions use `<Show>`

```tsx
// ✗ .map() runs once at setup, with no keyed reconciliation
<ul>{items().map((i) => <li>{i.name}</li>)}</ul>

// ✗ key is reserved by JSX and never reaches <For>
<For each={items} key={(i) => i.id}>{(i) => <li>{i.name}</li>}</For>

// ✓
<For each={items} by={(i) => i.id}>{(i) => <li>{i.name}</li>}</For>
```

A bare array of elements mounts fine, then ignores every later change to `items`. `<For>` keeps one DOM node per key and moves, inserts or removes only what changed. Its key prop is `by`, because JSX takes `key` for itself.

**Caught by:** detectors `for-with-key` (auto-fixable) and `for-missing-by`; lint `pyreon/use-by-not-key` and `pyreon/no-missing-for-by` (both error) and `pyreon/no-map-in-jsx` (warn).

## Bonus trap: a conditional can hide a read

```tsx
// ✗ while touched() is false, error() is never read, so never tracked
{() => (touched() ? error() ?? '' : '')}

// ✓ read both, then decide
{() => {
  const t = touched()
  const e = error()
  return t ? e ?? '' : ''
}}
```

A tracked scope subscribes only to the signals it read on its last run. Solid, Preact Signals and MobX all behave this way. The bug shows up when the guard and the guarded signal change in the same batch, which is exactly what form validation does on submit. No tool catches this one yet, so make it a habit: read every signal before the conditional.

## Or let the compiler carry the rules: Plain Mode

Rather not think about any of this? Pyreon has an experimental dialect for you. Put `'use plain'` at the top of a file (or import from `@pyreon/core/plain`), and you write `let count = state(0)` and `count++` while the compiler generates the signal plumbing. In a Plain Mode file, destructured props are rewritten to live `props.x` reads (Rule 3), and an early return on a reactive condition becomes reactive (Rule 6). `pyreon({ plain: true })` in your Vite config turns it on app-wide, and `pyreon plain` reports which files are ready to convert. The rules above still describe what it compiles to.

## Where the tools stop

- **Two rules have no static check.** Rule 5 (copying props) has no detector, and Rule 2 (setup snapshots) shows up only in the Lens. Both rely on review.
- **The early-return detector skips `props.*` conditions,** on purpose, to stay free of false positives.
- **Detectors work from syntax, without a type checker.** When one fires on code that is correct, silence it on that line with `// pyreon-lint-ignore <code>`.
- **The Lens needs an LSP-capable editor** with inlay hints turned on. VS Code uses the extension bundled in the repo (`packages/tools/lint/vscode`, symlinked into your extensions folder); it is not on a marketplace yet. JetBrains and other LSP editors register `pyreon-lint --lsp` directly. The [Reactivity Lens docs](/docs/reactivity-lens) have the setup.

## Keep the reference open

The [reactivity rules page](/docs/reactivity-rules) has the full table of live and static expressions, including context, effects and where hooks may be called. Pin it next to your editor for your first week.

## Build something with it

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on Discord{/* DISCORD-INVITE: link the permanent invite here once it exists */} or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
