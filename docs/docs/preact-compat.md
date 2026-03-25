---
title: "@pyreon/preact-compat"
description: Preact-compatible API layer with hooks and signals, running on Pyreon's reactive engine.
---

`@pyreon/preact-compat` provides a Preact-compatible API surface -- `h`, `render`, `Component`, hooks, and Preact Signals -- all backed by Pyreon's fine-grained reactive engine. It mirrors Preact's module structure with three entry points: the core API, a `hooks` submodule, and a `signals` submodule.

<PackageBadge name="@pyreon/preact-compat" href="/docs/preact-compat" status="stable" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/preact-compat
```
```bash [bun]
bun add @pyreon/preact-compat
```
```bash [pnpm]
pnpm add @pyreon/preact-compat
```
```bash [yarn]
yarn add @pyreon/preact-compat
```
:::

## Quick Start

Replace your Preact imports:

```tsx
// Before
import { h, render, Fragment } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { signal, computed } from '@preact/signals'

// After
import { h, render, Fragment } from '@pyreon/preact-compat'
import { useState, useEffect } from '@pyreon/preact-compat/hooks'
import { signal, computed } from '@pyreon/preact-compat/signals'
```

```tsx
import { h, render } from '@pyreon/preact-compat'
import { useState, useEffect } from '@pyreon/preact-compat/hooks'

const Counter = () => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count()}`
  })

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((prev) => prev + 1)}>+1</button>
    </div>
  )
}

render(<Counter />, document.getElementById('app')!)
```

## Key Differences from Preact

| Behavior | Preact | @pyreon/preact-compat |
|---|---|---|
| Component execution | Re-runs render on every state change | Runs **once** (setup phase) |
| `useState` getter | Returns the value directly | Returns a **getter function** -- call `count()` to read |
| `useEffect` deps | Controls when the effect re-runs | Deps array is **ignored** -- Pyreon tracks dependencies automatically |
| `useCallback` | Memoizes across renders | **No-op** -- returns `fn` as-is |
| `useMemo` | Returns the memoized value | Returns a **getter function** -- call `value()` to read |
| `useLayoutEffect` | Fires synchronously before paint | Same as `useEffect` |
| Signals `.value` | Native Preact Signals API | Wrapped Pyreon signals with the same `.value` interface |
| Class components | Full lifecycle support | `setState` and `forceUpdate` work; lifecycle methods are not called |
| Hooks rules | Must be called at top level | **No restrictions** -- call anywhere in component setup |

### Reading State

The most important change: `useState` returns a getter function, not a raw value.

```tsx
// Preact
const [count, setCount] = useState(0)
console.log(count) // 0

// Pyreon
const [count, setCount] = useState(0)
console.log(count()) // 0 -- note the function call
```

### No Stale Closures

In Preact, closures capture the value at render time. In Pyreon, signal reads always return the current value:

```tsx
function Timer() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      // In Preact, this would capture the initial value without deps
      // In Pyreon, count() always returns the current value
      console.log('Count:', count())
      setCount(prev => prev + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return <p>{count()}</p>
}
```

### Signals Compatibility

If you use Preact Signals (`@preact/signals`), the `@pyreon/preact-compat/signals` module provides the same `.value` interface:

```tsx
// Before (Preact Signals)
import { signal, computed, effect } from '@preact/signals'

const count = signal(0)
count.value++
console.log(count.value)

// After (Pyreon)
import { signal, computed, effect } from '@pyreon/preact-compat/signals'

const count = signal(0)
count.value++          // same API
console.log(count.value) // same API
```

## Module Structure

`@pyreon/preact-compat` mirrors Preact's multi-module structure:

| Import | Provides |
|---|---|
| `@pyreon/preact-compat` | Core API: `h`, `render`, `hydrate`, `Fragment`, `Component`, `createContext`, `createRef`, `cloneElement`, `toChildArray`, `isValidElement`, `options` |
| `@pyreon/preact-compat/hooks` | Hooks: `useState`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useReducer`, `useId`, `useContext`, `useErrorBoundary` |
| `@pyreon/preact-compat/signals` | Signals: `signal`, `computed`, `effect`, `batch` |

## Core API (`@pyreon/preact-compat`)

### `h` / `createElement`

```ts
function h(type: string | ComponentFn, props: Props | null, ...children: VNodeChild[]): VNode
```

Preact's hyperscript function. Maps directly to Pyreon's `h()`. `createElement` is an alias.

```tsx
import { h, createElement } from '@pyreon/preact-compat'

const vnode = <div class="box">Hello</div>
const same = <div class="box">Hello</div>
```

**All element types:**

```tsx
// HTML element
<div class="container">Content</div>

// Component
<MyComponent name="Alice" />

// Fragment
<Fragment><span>A</span><span>B</span></Fragment>

// SVG element
<svg viewBox="0 0 100 100">
  <circle cx={50} cy={50} r={40} fill="red" />
</svg>
```

### `Fragment`

The fragment symbol for grouping children without a wrapper DOM element.

```tsx
import { h, Fragment } from '@pyreon/preact-compat'

const items = (
  <Fragment>
    <li>Item 1</li>
    <li>Item 2</li>
    <li>Item 3</li>
  </Fragment>
)
```

### `render`

```ts
function render(vnode: VNodeChild, container: Element): void
```

Mounts a VNode tree into a DOM container. Maps to Pyreon's `mount()`.

```tsx
import { h, render } from '@pyreon/preact-compat'

render(<div>Hello</div>, document.getElementById('app')!)

// Or with JSX
render(<App />, document.getElementById('app')!)
```

### `hydrate`

```ts
function hydrate(vnode: VNodeChild, container: Element): void
```

Hydrates server-rendered HTML. Maps to Pyreon's `hydrateRoot()`. Use this when your HTML is pre-rendered on the server and you want to attach event handlers and reactive behavior on the client.

```tsx
import { h, hydrate } from '@pyreon/preact-compat'

// Server-rendered HTML is already in #app
hydrate(<App />, document.getElementById('app')!)
```

### `Component`

```ts
class Component<P extends Props, S extends Record<string, unknown>> {
  props: P
  state: S
  setState(partial: Partial<S> | ((prev: S) => Partial<S>)): void
  forceUpdate(): void
  render(): VNodeChild
}
```

A class-based component with `setState` and `forceUpdate`. State changes are backed by a Pyreon signal, so `setState` triggers reactive updates through Pyreon's batching system.

```tsx
import { Component, render } from '@pyreon/preact-compat'

class Counter extends Component<{}, { count: number }> {
  constructor(props: {}) {
    super(props)
    this.state = { count: 0 }
  }

  render() {
    return (
      <div>
        <p>Count: {this.state.count}</p>
        <button onClick={() => this.setState(prev => ({ count: prev.count + 1 }))}>
          Increment
        </button>
      </div>
    )
  }
}
```

**setState with partial state:**

```tsx
class Form extends Component<{}, { name: string; email: string; submitted: boolean }> {
  constructor(props: {}) {
    super(props)
    this.state = { name: '', email: '', submitted: false }
  }

  render() {
    return (
      <form onSubmit={(e: SubmitEvent) => {
        e.preventDefault()
        this.setState({ submitted: true })
      }}>
        <input
          value={this.state.name}
          onInput={(e: InputEvent) =>
            this.setState({ name: (e.target as HTMLInputElement).value })
          }
        />
        <input
          value={this.state.email}
          onInput={(e: InputEvent) =>
            this.setState({ email: (e.target as HTMLInputElement).value })
          }
        />
        <button type="submit">Submit</button>
      </form>
    )
  }
}
```

**Difference from Preact:** Lifecycle methods (`componentDidMount`, `componentWillUnmount`, `shouldComponentUpdate`, `componentDidUpdate`, `componentWillReceiveProps`, `getSnapshotBeforeUpdate`) are **not** called. Use hooks for lifecycle logic. If you need class component lifecycle behavior, refactor to functional components with hooks.

### `cloneElement`

```ts
function cloneElement(vnode: VNode, props?: Props, ...children: VNodeChild[]): VNode
```

Clones a VNode with merged props. If new children are provided, they replace the original children. The key can be overridden via props.

```tsx
const original = <div class="a" id="x">child</div>
const cloned = cloneElement(original, { class: 'b' })
// cloned.props.class === 'b', cloned.props.id === 'x'

// Override children
const withNewChildren = cloneElement(original, null, 'new child')

// Override key
const withNewKey = cloneElement(original, { key: 'new-key' })
```

**Real-world use case -- adding props to children:**

```tsx
function Toolbar(props: { children: VNode[] }) {
  return (
    <div class="toolbar">
      {props.children.map(child =>
        cloneElement(child, { class: 'toolbar-button' })
      )}
    </div>
  )
}
```

### `toChildArray`

```ts
function toChildArray(children: VNodeChild | VNodeChild[]): VNodeChild[]
```

Flattens nested children into a flat array, filtering out `null`, `undefined`, and booleans.

```tsx
toChildArray(['a', ['b', ['c']], null, false, 'd'])
// => ['a', 'b', 'c', 'd']

// Useful for manipulating children
function FilteredList(props: { children: VNodeChild }) {
  const items = toChildArray(props.children)
  return <ul>{items.slice(0, 5)}</ul> // show max 5
}
```

### `isValidElement`

```ts
function isValidElement(x: unknown): x is VNode
```

Returns `true` if the value is a VNode (has `type`, `props`, and `children` properties).

```tsx
const vnode = <div>Hello</div>
isValidElement(vnode) // true
isValidElement('string') // false
isValidElement(null) // false
isValidElement({ type: 'div', props: {}, children: [] }) // true
```

### `createContext` / `useContext`

Re-exports from `@pyreon/core`. Create and consume context values.

```tsx
import { createContext, useContext } from '@pyreon/preact-compat'

const Theme = createContext('light')

function ThemedButton() {
  const theme = useContext(Theme) // 'light'
  return <button class={theme}>Click me</button>
}
```

**Context with Provider pattern:**

```tsx
import { createContext, useContext } from '@pyreon/preact-compat'
import { withContext } from '@pyreon/core'

const LocaleContext = createContext('en')

function LocaleProvider(props: { locale: string; children: VNodeChild }) {
  return withContext(LocaleContext, props.locale, () => props.children)
}

function Greeting() {
  const locale = useContext(LocaleContext)
  const messages: Record<string, string> = {
    en: 'Hello!',
    es: 'Hola!',
    fr: 'Bonjour!',
  }
  return <p>{messages[locale] ?? messages.en}</p>
}

// Usage
render(
  <LocaleProvider locale="es">
    <Greeting /> {/* renders "Hola!" */}
  </LocaleProvider>,
  document.getElementById('app')!
)
```

### `createRef`

```ts
function createRef<T>(): { current: T | null }
```

Creates a mutable ref object with an initial `current` value of `null`.

```tsx
import { createRef } from '@pyreon/preact-compat'

const inputRef = createRef<HTMLInputElement>()

// Later, after mount
inputRef.current?.focus()
```

### `options`

```ts
const options: Record<string, unknown>
```

An empty object exposed for compatibility with Preact plugins that inspect `options._hook`, `options.vnode`, `options._diff`, etc. No hooks are active -- this is a stub.

```tsx
// This will not throw, but the hook will not be called
options.vnode = (vnode) => { /* not called */ }
```

## Hooks (`@pyreon/preact-compat/hooks`)

### `useState`

```ts
function useState<T>(initial: T | (() => T)): [() => T, (v: T | ((prev: T) => T)) => void]
```

Returns `[getter, setter]`. The getter is a Pyreon signal -- call it as a function to read.

```tsx
const [name, setName] = useState('Alice')
console.log(name()) // 'Alice'

setName('Bob')
setName(prev => prev + '!')

// Lazy initializer
const [cache, setCache] = useState(() => buildInitialCache())
```

**Real-world useState patterns:**

```tsx
// Toggle
function useToggle(initial = false) {
  const [value, setValue] = useState(initial)
  const toggle = () => setValue(prev => !prev)
  return [value, toggle] as const
}

// Counter with bounds
function useBoundedCounter(min: number, max: number, initial: number) {
  const [count, setCount] = useState(Math.max(min, Math.min(max, initial)))

  return {
    count,
    increment: () => setCount(prev => Math.min(max, prev + 1)),
    decrement: () => setCount(prev => Math.max(min, prev - 1)),
    reset: () => setCount(initial),
  }
}

// Previous value tracking
function usePrevious<T>(getter: () => T) {
  const ref = useRef<T>()
  useEffect(() => {
    ref.current = getter()
  })
  return ref
}
```

### `useEffect`

```ts
function useEffect(fn: () => CleanupFn | void, deps?: unknown[]): void
```

Runs a reactive side effect. The deps array is **ignored** -- Pyreon auto-tracks signal reads. Return a cleanup function for disposal.

**Mount-only:** Pass `[]` to run once on mount (wrapped in `runUntracked`).

```tsx
// Runs every time name() changes
useEffect(() => {
  document.title = name()
})

// Runs once on mount
useEffect(() => {
  const ws = new WebSocket('/stream')
  ws.onmessage = (e) => setMessages(prev => [...prev, JSON.parse(e.data)])
  return () => ws.close()
}, [])
```

**Data fetching pattern:**

```tsx
function UserProfile(props: { userId: () => number }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = props.userId()
    setLoading(true)
    setError(null)

    const controller = new AbortController()
    fetch(`/api/users/${id}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        setUser(data)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(String(err))
          setLoading(false)
        }
      })

    return () => controller.abort()
  })

  return () => {
    if (loading()) return <div class="skeleton" />
    if (error()) return <div class="error">{error()}</div>
    return (
      <div>
        <h2>{user()!.name}</h2>
        <p>{user()!.email}</p>
      </div>
    )
  }
}
```

### `useLayoutEffect`

Alias for `useEffect`. No layout/passive distinction in Pyreon.

### `useMemo`

```ts
function useMemo<T>(fn: () => T, _deps?: unknown[]): () => T
```

Returns a computed getter. Deps are ignored.

```tsx
const [items, setItems] = useState([1, 2, 3])
const sum = useMemo(() => items().reduce((a, b) => a + b, 0))
console.log(sum()) // 6

// Filtered + sorted list
const [filter, setFilter] = useState('')
const filteredItems = useMemo(() =>
  items().filter(item => item.name.includes(filter()))
)
const sortedItems = useMemo(() =>
  [...filteredItems()].sort((a, b) => a.name.localeCompare(b.name))
)
```

### `useCallback`

```ts
function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, _deps?: unknown[]): T
```

Returns `fn` as-is. Components run once, so callbacks never go stale.

### `useRef`

```ts
function useRef<T>(initial?: T): { current: T | null }
```

Returns a `&#123; current &#125;` object. If `initial` is provided, `current` is set to it; otherwise it defaults to `null`.

```tsx
// DOM ref
const inputRef = useRef<HTMLInputElement>()
// later: inputRef.current?.focus()

// Mutable value store
const renderCount = useRef(0)
renderCount.current!++
```

### `useReducer`

```ts
function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [() => S, (action: A) => void]
```

Returns `[getter, dispatch]`. Dispatch applies the reducer and updates the underlying signal.

```tsx
type Action = { type: 'add'; text: string } | { type: 'remove'; id: number } | { type: 'toggle'; id: number }

interface Todo { id: number; text: string; done: boolean }

function todoReducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add':
      return [...state, { id: Date.now(), text: action.text, done: false }]
    case 'remove':
      return state.filter(t => t.id !== action.id)
    case 'toggle':
      return state.map(t => t.id === action.id ? { ...t, done: !t.done } : t)
  }
}

function TodoApp() {
  const [todos, dispatch] = useReducer(todoReducer, [])

  return (
    <div>
      <button onClick={() => dispatch({ type: 'add', text: 'New todo' })}>
        Add
      </button>
      <ul>
        {() => todos().map(todo =>
          <li
            onClick={() => dispatch({ type: 'toggle', id: todo.id })}
            style={todo.done ? 'text-decoration: line-through' : ''}
          >
            {todo.text}
          </li>
        )}
      </ul>
    </div>
  )
}
```

### `useId`

```ts
function useId(): string
```

Returns a stable unique string (e.g. `:r0:`) scoped to the current component. Deterministic and hydration-safe.

```tsx
function LabeledInput(props: { label: string }) {
  const id = useId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}
```

### `useContext`

Re-export from `@pyreon/core`.

### `useErrorBoundary`

```ts
function useErrorBoundary(handler: (error: Error) => boolean | void): void
```

Wraps Pyreon's `onErrorCaptured`. Register a handler for errors thrown in child components.

```tsx
function SafeZone(props: { children: VNodeChild }) {
  const [error, setError] = useState<string | null>(null)

  useErrorBoundary((err) => {
    setError(String(err))
    return true // handled
  })

  return () => error()
    ? (
        <div class="error">
          <p>Error: {error()}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )
    : props.children
}
```

## Signals (`@pyreon/preact-compat/signals`)

This module provides a Preact Signals-compatible API with `.value` accessors, backed by Pyreon's reactive primitives. Use this when migrating from `@preact/signals`.

### `signal`

```ts
function signal<T>(initial: T): WritableSignal<T>

interface WritableSignal<T> {
  value: T       // get (tracked) / set
  peek(): T      // get (untracked)
}
```

Create a writable signal with `.value` accessor syntax.

```tsx
import { signal } from '@pyreon/preact-compat/signals'

const count = signal(0)
count.value++          // write
console.log(count.value)  // read (tracked)
console.log(count.peek()) // read (untracked)
```

**Using signals in components:**

```tsx
import { signal, computed, effect } from '@pyreon/preact-compat/signals'
import { h, render } from '@pyreon/preact-compat'

// Global signals (can be shared across components)
const todos = signal<Array<{ id: number; text: string; done: boolean }>>([])
const filter = signal<'all' | 'active' | 'done'>('all')

const filteredTodos = computed(() => {
  const list = todos.value
  switch (filter.value) {
    case 'active': return list.filter(t => !t.done)
    case 'done': return list.filter(t => t.done)
    default: return list
  }
})

const remaining = computed(() =>
  todos.value.filter(t => !t.done).length
)

function TodoApp() {
  effect(() => {
    document.title = `${remaining.value} remaining`
  })

  return (
    <div>
      <p>{remaining.value} remaining</p>
      <ul>
        {filteredTodos.value.map(todo =>
          <li key={todo.id}>{todo.text}</li>
        )}
      </ul>
    </div>
  )
}
```

### `computed`

```ts
function computed<T>(fn: () => T): ReadonlySignal<T>

interface ReadonlySignal<T> {
  readonly value: T
  peek(): T
}
```

Create a derived signal. Reads via `.value` are tracked.

```tsx
import { signal, computed } from '@pyreon/preact-compat/signals'

const count = signal(3)
const doubled = computed(() => count.value * 2)
console.log(doubled.value) // 6

count.value = 10
console.log(doubled.value) // 20
```

**Chained computeds:**

```tsx
const price = signal(100)
const quantity = signal(2)
const taxRate = signal(0.08)

const subtotal = computed(() => price.value * quantity.value)
const tax = computed(() => subtotal.value * taxRate.value)
const total = computed(() => subtotal.value + tax.value)

console.log(total.value) // 216
```

### `effect`

```ts
function effect(fn: () => void | (() => void)): () => void
```

Runs `fn` reactively -- re-executes whenever tracked signal reads change. Returns a **dispose function**. Optionally return a cleanup function from `fn`.

```tsx
const dispose = effect(() => {
  console.log('Count is', count.value)
})

// With cleanup
const dispose = effect(() => {
  const handler = () => console.log('resize')
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
})

// Stop tracking
dispose()
```

### `batch`

```ts
function batch<T>(fn: () => T): T
```

Groups multiple `.value` writes into a single reactive flush.

```tsx
batch(() => {
  count.value = 10
  name.value = 'Alice'
})
// Effects that depend on both run only once
```

### Migrating from Preact Signals to Pyreon Signals

The `.value` accessor API is identical between `@preact/signals` and `@pyreon/preact-compat/signals`. The migration is a simple import swap:

```tsx
// Before
import { signal, computed, effect, batch } from '@preact/signals'

// After
import { signal, computed, effect, batch } from '@pyreon/preact-compat/signals'
```

If you want to migrate further to native Pyreon signals (getter function pattern instead of `.value`), the changes are:

```tsx
// Preact Signals style
const count = signal(0)
count.value++
console.log(count.value)

// Native Pyreon style
import { signal } from '@pyreon/reactivity'
const count = signal(0)
count.update(n => n + 1)
console.log(count())
```

## Real-World Migration Examples

### Converting a Preact App Entry Point

```tsx
// Before (Preact)
import { h, render } from 'preact'
import { Router, Route } from 'preact-router'

const App = () => (
  <Router>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
  </Router>
)

render(<App />, document.body)

// After (Pyreon)
import { h, render } from '@pyreon/preact-compat'
// Note: preact-router will need to be replaced with @pyreon/router

const App = () => (
  <div>
    <Home />
  </div>
)

render(<App />, document.getElementById('app')!)
```

### Converting a Component with Lifecycle Methods

```tsx
// Before (Preact class component)
import { Component, h } from 'preact'

class Timer extends Component {
  state = { seconds: 0 }
  interval = null

  componentDidMount() {
    this.interval = setInterval(() => {
      this.setState(prev => ({ seconds: prev.seconds + 1 }))
    }, 1000)
  }

  componentWillUnmount() {
    clearInterval(this.interval)
  }

  render() {
    return <p>Seconds: {this.state.seconds}</p>
  }
}

// After (Pyreon functional component with hooks)
import { h } from '@pyreon/preact-compat'
import { useState, useEffect } from '@pyreon/preact-compat/hooks'

function Timer() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(prev => prev + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return <p>Seconds: {seconds()}</p>
}
```

### Converting Signals-Based State Management

```tsx
// Before (@preact/signals)
import { signal, computed } from '@preact/signals'

const cart = signal<CartItem[]>([])
const totalPrice = computed(() =>
  cart.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
)
const itemCount = computed(() =>
  cart.value.reduce((sum, item) => sum + item.quantity, 0)
)

function addToCart(item: CartItem) {
  const existing = cart.value.find(i => i.id === item.id)
  if (existing) {
    cart.value = cart.value.map(i =>
      i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
    )
  } else {
    cart.value = [...cart.value, { ...item, quantity: 1 }]
  }
}

// After (@pyreon/preact-compat/signals) -- exact same code!
import { signal, computed } from '@pyreon/preact-compat/signals'
// ... all code remains identical
```

## Handling Third-Party Preact Libraries

Libraries that depend on Preact internals may not work. Libraries that use the public API (hooks, `h`, `Component`) are more likely to work with alias configuration:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      'preact': '@pyreon/preact-compat',
      'preact/hooks': '@pyreon/preact-compat/hooks',
      '@preact/signals': '@pyreon/preact-compat/signals',
    },
  },
})
```

**Known limitations with aliasing:**

- Libraries that use `preact/compat` (the React-compatibility layer for Preact) may need additional configuration
- Libraries that access `options._diff`, `options._commit`, or other internal hooks will not receive notifications
- Libraries that use `__H` (internal hooks state) or other underscore-prefixed internals will not work

## Migration Checklist

1. Replace `preact` imports with `@pyreon/preact-compat`, `preact/hooks` with `@pyreon/preact-compat/hooks`, and `@preact/signals` with `@pyreon/preact-compat/signals`.
2. Change state reads from `count` to `count()` for hook-based code. Signals-based code using `.value` works without changes.
3. Remove dependency arrays from `useEffect` and `useMemo` (or leave them -- they are ignored).
4. Replace class component lifecycle methods (`componentDidMount`, `componentWillUnmount`, etc.) with hooks (`useEffect` for mount/unmount logic).
5. Verify any `options` plugin code -- the `options` object is an empty stub.
6. Check `toChildArray` usage -- should work identically.
7. Test `cloneElement` usage -- props merging behavior is the same.
8. Replace `preact-router` or other Preact-specific router with `@pyreon/router`.
9. Test `isValidElement` -- checks for `type`, `props`, and `children` properties.
10. Review any code that depends on re-render behavior -- Pyreon components run once; derive state reactively instead.
