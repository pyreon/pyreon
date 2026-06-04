---
title: Reactivity
description: Signals, computed, effect, batch — Pyreon's reactive foundation.
---

# Reactivity

A signal is a reactive container for a value. Reading a signal inside an effect (or any tracking scope) automatically subscribes that effect to the signal. When the signal's value changes, every subscribed effect re-runs — no virtual DOM, no diffing.

```ts
import { signal } from '@pyreon/reactivity'

const count = signal(0)

// Read the value by calling the signal as a function
console.log(count()) // 0

// Set a new value
count.set(5)

// Update based on the current value
count.update((n) => n + 1) // now 6
```

::: callout info
Signals use `Object.is` for equality — setting a signal to the same value is a no-op. This is the dedup mechanism that prevents fan-out cascades for unchanged data.
:::

## Try it yourself

This playground is a real Pyreon component rendered by this docs site, which was itself rendered by Pyreon. The editor uses CodeMirror, the preview runs in a sandboxed iframe with `@pyreon/reactivity` loaded from esm.sh.

<Playground title="Signals — read, write, react" :height="180">
const count = signal(0)

const app = document.getElementById('app')
const ui = h('div', { class: 'col' },
  h('div', { class: 'row' },
    h('button', { onClick: () => count.update(n => n + 1) }, '＋ Increment'),
    h('button', { onClick: () => count.set(0) }, 'Reset'),
  ),
  h('div', { class: 'card' },
    h('span', { class: 'muted' }, 'count: '),
    h('span', { class: 'badge' }, () => count()),
  ),
)
mount(ui, app)
</Playground>

## Computed values

A computed derives from one or more signals. It's lazy — it only re-evaluates when something reads it AND a dependency has actually changed.

```ts
import { signal, computed } from '@pyreon/reactivity'

const firstName = signal('Alice')
const lastName = signal('Smith')
const fullName = computed(() => `${firstName()} ${lastName()}`)

console.log(fullName()) // "Alice Smith"
firstName.set('Bob')
console.log(fullName()) // "Bob Smith"
```

::: callout warning
A computed re-evaluates on read when dirty — but its OUTPUT is cached. Reading twice in a row without a dependency change does NOT re-run the body.
:::

## Effects

An effect runs once at setup, then re-runs whenever any signal it read during its previous run changes. Use it for side effects: DOM mutation, logging, fetch.

```ts
import { signal, effect } from '@pyreon/reactivity'

const count = signal(0)

effect(() => {
  console.log('count is', count())
})
// Logs: "count is 0"

count.set(1) // Logs: "count is 1"
count.set(2) // Logs: "count is 2"
```

::: callout danger
Async effect bodies have a sharp edge: anything after the first `await` runs detached from the tracking scope. Read every tracked signal BEFORE the first await, or split into separate effects.
:::

## Installation

::: code-group

```bash [npm]
npm install @pyreon/reactivity
```

```bash [bun]
bun add @pyreon/reactivity
```

```bash [pnpm]
pnpm add @pyreon/reactivity
```

:::
