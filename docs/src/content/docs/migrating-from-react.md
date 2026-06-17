---
title: Coming from React
description: A concept-by-concept map from React to Pyreon — the one mental-model shift, the hook equivalents, the gotchas, and how to migrate incrementally with @pyreon/react-compat.
---

If you know React, you already know 90% of Pyreon's syntax — it's JSX, components are functions, props flow down. The other 10% is one idea that changes everything else.

## The one shift: components run once

In React, your component function runs on **every** state change, and you spend effort stopping work you didn't want (`useMemo`, `useCallback`, `React.memo`, dependency arrays).

In Pyreon, a component function runs **exactly once**. State lives in signals. When a signal changes, only the specific DOM expression that read it re-runs — never the component.

```tsx
// React: this whole function re-runs every time count changes.
function Counter() {
  const [count, setCount] = useState(0)
  console.log('render') // logs on every click
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

```tsx
// Pyreon: this function runs ONCE. Only the {count()} text node updates.
function Counter() {
  const count = signal(0)
  console.log('setup') // logs once, ever
  return <button onClick={() => count.set(count() + 1)}>{count()}</button>
}
```

Internalize that and everything below follows.

## Hook-by-hook map

| React | Pyreon | Notes |
| --- | --- | --- |
| `useState(0)` | `signal(0)` | Read with `count()`, write with `count.set(1)` or `count.update(n => n + 1)` |
| `useEffect(fn, deps)` | `effect(fn)` | **No dependency array** — `effect` tracks whatever signals it reads, automatically |
| `useEffect(fn, [])` (mount) | `onMount(fn)` | Runs once after mount; return a cleanup function |
| `useMemo(fn, deps)` | `computed(fn)` | Auto-tracked; no deps array |
| `useCallback` | *(nothing)* | Functions are stable by default — the component runs once, so the closure is created once |
| `useRef(null)` | `let el; <div ref={e => (el = e)} />` | Callback refs; receives `el` on mount, `null` on unmount |
| `useContext(Ctx)` | `useContext(Ctx)` | Same idea; reactive contexts return an accessor — call it to read |
| `useReducer` | `createStore` / `@pyreon/store` | Or a signal + an update function |

The headline: **no dependency arrays, anywhere.** `effect` and `computed` track the signals they actually read at runtime. You can't forget a dependency, and you can't over-specify one.

## JSX differences

| React | Pyreon |
| --- | --- |
| `className="x"` | `class="x"` (standard HTML attribute) |
| `onChange` (on inputs) | `onInput` (fires per keystroke, native DOM event) |
| `htmlFor` | `for` |
| `{items.map(i => <li key={i.id}>…)}` | `<For each={items} by={i => i.id}>{i => <li>…</li>}</For>` |
| `{cond && <X/>}` | `<Show when={cond}><X/></Show>` (or `{() => cond() && <X/>}`) |
| `style={{color:'red'}}` | `style={{ color: 'red' }}` (same) or `style="color:red"` |

`<For>` and `<Show>` aren't required, but they're the efficient path: `<For>` does keyed reconciliation, `<Show>` avoids re-evaluating a branch on every change.

## Reading state: the gotcha that bites everyone

In React, `count` is a value. In Pyreon, `count` is a **getter you call**: `count()`. This is the single most common mistake coming from React.

```tsx
const name = signal('Ada')

// ✅ reactive — re-runs when name changes
<h1>{name()}</h1>

// ❌ static — captures the value once, never updates
<h1>{name}</h1>          // renders the function, not the value
const n = name()         // captured once; the const won't track
```

And writing is `.set`, not a call:

```tsx
name.set('Grace')        // ✅ write
name('Grace')            // ❌ this READS and ignores the argument (dev mode warns)
```

## Don't destructure props

In React, `function C({ title }) {…}` is fine. In Pyreon it **breaks reactivity** — destructuring reads the prop once, at setup, and the local never updates.

```tsx
// ❌ title is captured once
function Card({ title }) { return <h2>{title}</h2> }

// ✅ read props.title at the use site, inside the reactive scope
function Card(props) { return <h2>{props.title}</h2> }
```

(`splitProps(props, ['title'])` exists when you need to carve out a group while keeping reactivity.)

## Effects: where, not whether

React conditions reactivity on a dependency array. Pyreon conditions it on **where you read a signal**. Reading a signal inside JSX, an `effect`, or a `computed` tracks it; reading it in plain setup code captures it once. This is the whole model — see [Reactivity Rules](/docs/reactivity-rules).

## Migrate incrementally with @pyreon/react-compat

You don't have to rewrite everything at once. [`@pyreon/react-compat`](/docs/react-compat) ships the full hooks surface (`useState`, `useEffect`, `useReducer`, `useRef`, `useId`, `useSyncExternalStore`, `useTransition`, `forwardRef`, `memo`, `lazy`, `Suspense`, `createContext`, `createPortal`, …) so a lot of existing React code runs on Pyreon's runtime with minimal changes.

```tsx
import { useState, useEffect } from '@pyreon/react-compat'
// existing React-style component — runs on Pyreon's runtime
```

**Honest caveat:** the compat layer runs Pyreon's runtime under a React-shaped API. It's a *migration aid* — it lets you bring code over and convert it gradually to native signals — not a way to run React's whole ecosystem unchanged. Complex libraries that lean on React internals (concurrent features, `findDOMNode`-style escapes, their own renderers) may not work. Convert hot paths to native signals to get the performance and the simpler mental model.

## A realistic conversion

```tsx
// React
function TodoList() {
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('all')
  const visible = useMemo(
    () => todos.filter(t => filter === 'all' || t.status === filter),
    [todos, filter],
  )
  useEffect(() => { document.title = `${todos.length} todos` }, [todos])
  return <ul>{visible.map(t => <li key={t.id}>{t.text}</li>)}</ul>
}
```

```tsx
// Pyreon — no deps arrays, no key prop name, component runs once
function TodoList() {
  const todos = signal([])
  const filter = signal('all')
  const visible = computed(() =>
    todos().filter(t => filter() === 'all' || t.status === filter()),
  )
  effect(() => { document.title = `${todos().length} todos` })
  return (
    <ul>
      <For each={visible} by={t => t.id}>{t => <li>{t.text}</li>}</For>
    </ul>
  )
}
```

## Cheat sheet

- `useState` → `signal`; read `s()`, write `s.set(v)`
- `useEffect` → `effect` (no deps) or `onMount` (once)
- `useMemo` → `computed`; `useCallback` → delete it
- `className` → `class`, `onChange` → `onInput`
- `.map()` → `<For by={...}>`, `cond && x` → `<Show when>`
- Don't destructure props; read `props.x` at the use site
- It's `s()` to read and `s.set()` to write — never `s` bare, never `s(v)`

Start with [Getting Started](/docs/getting-started), keep [Reactivity Rules](/docs/reactivity-rules) open, and migrate hot paths off `react-compat` to native signals as you go.
