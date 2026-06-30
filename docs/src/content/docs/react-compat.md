---
title: '@pyreon/react-compat'
description: React-compatible hook API that runs on Pyreon's fine-grained reactive engine.
---

`@pyreon/react-compat` lets you write familiar React-style code -- hooks, `createRoot`, `lazy`, `memo`, portals -- while running on Pyreon's signal-based reactive engine under the hood. It is designed as a migration path: swap your imports and keep your component code. It runs the **value + re-render model** -- `useState` returns the value directly (not a getter), the component body re-runs on state change, hooks are positional, and `useEffect` / `useMemo` / `useCallback` honor their deps arrays -- so most React code behaves identically, including hooks-rules ordering and stale-closure semantics.

<PackageBadge name="@pyreon/react-compat" href="/docs/react-compat" status="stable" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/react-compat
```

```bash [bun]
bun add @pyreon/react-compat
```

```bash [pnpm]
pnpm add @pyreon/react-compat
```

```bash [yarn]
yarn add @pyreon/react-compat
```

:::

## Quick Start

Replace your React imports:

```tsx
// Before
import { useState, useEffect, memo } from 'react'
import { createRoot } from 'react-dom/client'

// After
import { useState, useEffect, memo } from '@pyreon/react-compat'
import { createRoot } from '@pyreon/react-compat/dom'
```

Then use hooks exactly as you would in React:

```tsx
import { useState, useEffect, memo } from '@pyreon/react-compat'
import { createRoot } from '@pyreon/react-compat/dom'

const Counter = memo(() => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((prev) => prev + 1)}>Increment</button>
    </div>
  )
})

createRoot(document.getElementById('app')!).render(<Counter />)
```

## Key Differences from React

`@pyreon/react-compat` runs the **value + re-render model**: `useState` returns the value directly (not a getter), the component body re-runs on state change, and `useEffect` / `useMemo` / `useCallback` honor their deps arrays. Most React code -- including hooks-rules ordering and stale-closure semantics -- behaves identically. The genuine differences:

| Behavior                                              | React                                      | @pyreon/react-compat                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive engine                                       | VDOM diff + reconciliation                 | Pyreon signals driving a per-component re-render                                                                                                                                                                                       |
| **Nested child state across an _ancestor_ re-render** | Preserved (reconciliation by position/key) | **Reset** -- a parent re-render rebuilds the child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to initial and `useEffect([])` re-fires. Lift such state up, or avoid re-rendering the ancestor. (`memo` does not prevent this.) |
| Class components                                      | Full lifecycle support                     | **Unsupported** -- `Component` / `PureComponent` are stubs; `setState` / `forceUpdate` warn-and-no-op, lifecycle methods never fire, `render()` returns `null` |
| Concurrent mode                                       | `useTransition` / `useDeferredValue` defer updates | **No-ops** -- all updates are synchronous; `useTransition` returns `[false, fn => fn()]`, `useDeferredValue` / `startTransition` / `flushSync` are synchronous pass-throughs |
| `useLayoutEffect` / `useInsertionEffect`              | Distinct timing (sync before paint / before mutations) | Same as `useEffect` -- Pyreon has no layout/paint distinction                                                                                                                                                            |
| `version`                                             | Real React version                         | Reports `19.0.0-pyreon`                                                                                                                                                                                                              |

### Reading State

`useState` returns the value directly and the component re-runs on state change -- exactly like React.

```tsx
// React
const [count, setCount] = useState(0)
console.log(count) // 0

// @pyreon/react-compat -- identical
const [count, setCount] = useState(0)
console.log(count) // 0
```

### Closures follow React semantics

`useState` returns a plain value captured at render time, so a long-lived callback created in `useEffect([])` sees the value from the render it was created in -- exactly like React. Use the **updater form** to read the latest value, or include the value in the deps array to re-create the callback:

```tsx
function Timer() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      // `count` here is the value from this render; use the updater form
      // to read the latest:
      setCount((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return <p>{count}</p>
}
```

> If you want reads that are always current regardless of closure age, drop to Pyreon's native API -- a `signal()` from `@pyreon/reactivity` always returns the live value via its getter.

## API Reference

### State

#### `useState`

```ts
function useState<T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void]
```

Returns a `[value, setter]` tuple -- the value directly, exactly like React. The component re-runs when the setter is called. The setter accepts a value or an updater function, and has a stable identity across renders.

```tsx
const [count, setCount] = useState(0)
console.log(count) // 0

setCount(5) // set directly
setCount((prev) => prev + 1) // updater function

// Lazy initializer (runs once during setup)
const [data, setData] = useState(() => expensiveComputation())
```

#### `useReducer`

```ts
function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialArg: S | (() => S),
  init?: (arg: S) => S,
): [S, (action: A) => void]
```

Works like React's `useReducer`. Returns `[state, dispatch]` -- the state value directly. Dispatch applies the reducer and re-renders the component, and has a stable identity across renders. The 3-argument form (`useReducer(reducer, initialArg, init)`) is supported.

```tsx
type Action = { type: 'inc' } | { type: 'dec' } | { type: 'reset'; value: number }

const reducer = (state: number, action: Action): number => {
  switch (action.type) {
    case 'inc':
      return state + 1
    case 'dec':
      return state - 1
    case 'reset':
      return action.value
  }
}

const [count, dispatch] = useReducer(reducer, 0)

dispatch({ type: 'inc' }) // count === 1
dispatch({ type: 'inc' }) // count === 2
dispatch({ type: 'reset', value: 0 }) // count === 0
```

**Real-world reducer example -- form state machine:**

```tsx
interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error'
  data: Record<string, string>
  error: string | null
}

type FormAction =
  | { type: 'field'; name: string; value: string }
  | { type: 'submit' }
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'reset' }

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'field':
      return { ...state, data: { ...state.data, [action.name]: action.value } }
    case 'submit':
      return { ...state, status: 'submitting', error: null }
    case 'success':
      return { ...state, status: 'success' }
    case 'error':
      return { ...state, status: 'error', error: action.message }
    case 'reset':
      return { status: 'idle', data: {}, error: null }
  }
}

function ContactForm() {
  const [state, dispatch] = useReducer(formReducer, {
    status: 'idle',
    data: {},
    error: null,
  })

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    dispatch({ type: 'submit' })
    try {
      await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify(state.data),
      })
      dispatch({ type: 'success' })
    } catch (err) {
      dispatch({ type: 'error', message: String(err) })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.data.name ?? ''}
        onInput={(e) =>
          dispatch({
            type: 'field',
            name: 'name',
            value: (e.target as HTMLInputElement).value,
          })
        }
      />
      <button type="submit" disabled={state.status === 'submitting'}>
        {state.status === 'submitting' ? 'Sending...' : 'Send'}
      </button>
      {state.error && <p class="error">{state.error}</p>}
    </form>
  )
}
```

### Effects

#### `useEffect`

```ts
function useEffect(fn: () => CleanupFn | void, deps?: unknown[]): void
```

Runs a side effect after render. The `deps` array is **honored** (the effect re-runs when a dep changes via `Object.is` comparison), exactly like React. Return a cleanup function to dispose resources when the effect re-runs or the component unmounts.

```tsx
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/user/${id}`, { signal: controller.signal })
    .then((res) => res.json())
    .then(setUser)
  return () => controller.abort()
}, [id])
```

**Mount-only effects:** Pass an empty deps array `[]` to run exactly once on mount; the cleanup runs on unmount.

```tsx
useEffect(() => {
  console.log('Component mounted')
  const ws = new WebSocket('wss://api.example.com/stream')
  return () => ws.close()
}, [])
```

**Real-world effect patterns:**

```tsx
// DOM measurement
function AutoSizeTextarea() {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  return (
    <textarea
      ref={ref}
      value={text}
      onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
    />
  )
}

// Intersection observer
function LazyImage(props: { src: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref}>{visible ? <img src={props.src} /> : <div class="placeholder" />}</div>
}

// Document event listener
function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}

// Media query
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
```

#### `useLayoutEffect`

Alias for `useEffect`. Pyreon does not distinguish between layout and passive effects. In React, `useLayoutEffect` fires synchronously before browser paint; in Pyreon, all effects run synchronously.

### Memoization

#### `useMemo`

```ts
function useMemo<T>(fn: () => T, deps: unknown[]): T
```

Returns the memoized value directly (recomputed when `deps` change via `Object.is` comparison) -- exactly like React.

```tsx
const [items, setItems] = useState([1, 2, 3])
const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items])

console.log(total) // 6
```

**Real-world memoization:**

```tsx
function ProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name')

  // Each memo only recalculates when its specific dependencies change
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products
  }, [products, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (a[sortBy] < b[sortBy] ? -1 : a[sortBy] > b[sortBy] ? 1 : 0))
  }, [filtered, sortBy])

  const totalPrice = useMemo(() => sorted.reduce((sum, p) => sum + p.price, 0), [sorted])

  return (
    <div>
      <input
        placeholder="Search..."
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
      />
      <p>Total: ${totalPrice.toFixed(2)}</p>
      <ul>
        {sorted.map((p) => (
          <li>
            {p.name} - ${p.price}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

#### `useCallback`

```ts
function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T
```

Memoizes `fn` across re-renders, returning the same reference until a dep changes -- exactly like React (`useCallback(fn, deps)` is `useMemo(() => fn, deps)`).

```tsx
const handleClick = useCallback((id: number) => {
  setSelected(id)
}, [])
```

#### `memo`

```ts
function memo<P>(
  component: (props: P) => VNodeChild,
  areEqual?: (prev: P, next: P) => boolean,
): (props: P) => VNodeChild
```

Wraps a component to skip re-render when its props are shallowly equal -- exactly like React. Each `<MemoComp />` usage gets its own per-instance props/result cache. Pass a custom `areEqual` to override the default shallow comparison.

```tsx
const MyComponent = memo((props: { name: string }) => <div>{props.name}</div>)
```

### Refs

#### `useRef`

```ts
function useRef<T>(initial?: T): { current: T | null }
```

Returns a mutable `&#123; current &#125;` object, identical in shape to React's ref.

```tsx
const inputRef = useRef<HTMLInputElement>()

// Attach to an element
<input ref={inputRef} />

// Read later
inputRef.current?.focus()
```

**Storing mutable values (non-DOM):**

```tsx
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<number>()

  const start = () => {
    intervalRef.current = window.setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
  }

  const stop = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current!)
      intervalRef.current = null
    }
  }

  return (
    <div>
      <p>{elapsed}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  )
}
```

#### `useImperativeHandle`

```ts
function useImperativeHandle<T>(
  ref: { current: T | null } | null | undefined,
  init: () => T,
  _deps?: unknown[],
): void
```

Populates `ref.current` with the value returned by `init` on mount. Resets to `null` on unmount. Safe to pass `null` or `undefined` as the ref.

```tsx
interface FancyInputAPI {
  focus: () => void
  reset: () => void
  getValue: () => string
}

function FancyInput(props: { ref?: { current: FancyInputAPI | null } }) {
  const inputRef = useRef<HTMLInputElement>()
  const [value, setValue] = useState('')

  useImperativeHandle(props.ref, () => ({
    focus: () => inputRef.current?.focus(),
    reset: () => {
      setValue('')
      inputRef.current?.focus()
    },
    getValue: () => value,
  }))

  return (
    <input
      ref={inputRef}
      value={value}
      onInput={(e) => setValue((e.target as HTMLInputElement).value)}
    />
  )
}

// Parent component
function Form() {
  const fancyRef = useRef<FancyInputAPI>()

  return (
    <div>
      <FancyInput ref={fancyRef} />
      <button onClick={() => fancyRef.current?.focus()}>Focus</button>
      <button onClick={() => fancyRef.current?.reset()}>Reset</button>
    </div>
  )
}
```

### Context

#### `createContext` / `useContext`

```ts
function createContext<T>(defaultValue: T): CompatContext<T>
function useContext<T>(ctx: CompatContext<T>): T
```

`createContext` returns a context with a React-style `Provider` that supports nesting (an inner Provider overrides an outer one for its subtree) and re-renders consumers when its `value` changes. `useContext` reads the nearest Provider's value and subscribes the calling component to future changes. Usage is identical to React:

```tsx
const ThemeCtx = createContext('light')

function App() {
  return (
    <ThemeCtx.Provider value="dark">
      <ThemedButton />
    </ThemeCtx.Provider>
  )
}

function ThemedButton() {
  const theme = useContext(ThemeCtx) // 'dark'
  return <button class={theme}>Click me</button>
}
```

**Real-world context example -- toast notifications:**

```tsx
interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
}

interface ToastAPI {
  toasts: Toast[]
  add: (message: string, type?: Toast['type']) => void
  remove: (id: string) => void
}

const ToastContext = createContext<ToastAPI>({
  toasts: [],
  add: () => {},
  remove: () => {},
})

function ToastProvider(props: { children: VNodeChild }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const api: ToastAPI = {
    toasts,
    add(message, type = 'info') {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => api.remove(id), 5000)
    },
    remove(id) {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    },
  }

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div class="toast-container">
        {toasts.map((toast) => (
          <div class={`toast toast-${toast.type}`}>
            {toast.message}
            <button onClick={() => api.remove(toast.id)}>&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Consuming component
function SaveButton() {
  const toast = useContext(ToastContext)

  const handleSave = async () => {
    try {
      await saveData()
      toast.add('Saved successfully!', 'success')
    } catch {
      toast.add('Failed to save', 'error')
    }
  }

  return <button onClick={handleSave}>Save</button>
}
```

### Unique IDs

#### `useId`

```ts
function useId(): string
```

Returns a stable, deterministic unique string (e.g. `:r0:`, `:r1:`) scoped to the current component instance. Safe for SSR hydration -- IDs are based on the component's effect scope, not a global counter.

```tsx
function FormField(props: { label: string; children: VNodeChild }) {
  const id = useId()
  return (
    <div class="form-field">
      <label for={id}>{props.label}</label>
      <div id={id}>{props.children}</div>
    </div>
  )
}
```

**Accessible form with useId:**

```tsx
function AccessibleCombobox() {
  const id = useId()
  const listboxId = `${id}-listbox`
  const inputId = `${id}-input`
  const [open, setOpen] = useState(false)

  return (
    <div role="combobox" aria-expanded={open} aria-owns={listboxId}>
      <input
        id={inputId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul id={listboxId} role="listbox" aria-labelledby={inputId}>
          <li role="option">Option 1</li>
          <li role="option">Option 2</li>
        </ul>
      )}
    </div>
  )
}
```

### Concurrent Mode Shims

#### `useTransition`

```ts
function useTransition(): [boolean, (fn: () => void) => void]
```

Returns `[false, fn => fn()]`. Pyreon has no concurrent mode, so transitions execute immediately. Kept so migrated code does not break.

```tsx
// Works but has no deferred behavior
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setSearchResults(computeResults(query))
})
// isPending is always false
```

#### `useDeferredValue`

```ts
function useDeferredValue<T>(value: T): T
```

Returns the value as-is. No deferral in Pyreon.

#### `useOptimistic`

```ts
function useOptimistic<S, A = S>(
  passthrough: S,
  reducer?: (state: S, action: A) => S,
): [S, (action: A) => void]
```

React 19's `useOptimistic`. Returns `[optimisticState, addOptimistic]`. `optimisticState` is `passthrough` reduced through every pending optimistic action; calling `addOptimistic(action)` layers an action onto the state and re-renders. The `addOptimistic` function has a stable identity across renders, matching React's guarantee. When no `reducer` is supplied, each action replaces the state outright (`(_state, action) => action`).

In React, optimistic updates are discarded once the surrounding async action settles and the host re-renders with the real value -- a behavior that relies on concurrent transitions. Pyreon has no concurrent transitions, so the faithful equivalent is: **the optimistic overlay is cleared whenever `passthrough` changes by reference** (`Object.is` comparison) -- that is, when the real update lands. Until then, the layered actions stay applied. For the canonical "show optimistic state -> await the action -> render the real value" flow, the observable behavior matches React. Called outside a component render, it degrades gracefully -- returning the base value and a no-op adder.

```tsx
function TodoList(props: { todos: Todo[]; onAdd: (text: string) => Promise<void> }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    props.todos,
    (state: Todo[], newTodo: Todo) => [...state, { ...newTodo, pending: true }],
  )

  const handleAdd = async (text: string) => {
    // Renders the pending row immediately
    addOptimisticTodo({ id: crypto.randomUUID(), text, pending: false })
    await props.onAdd(text)
    // When the parent passes a fresh `todos` array, the overlay resets
    // to the real list (passthrough changed by reference).
  }

  return (
    <ul>
      {optimisticTodos.map((todo) => (
        <li class={todo.pending ? 'pending' : ''}>{todo.text}</li>
      ))}
    </ul>
  )
}
```

### Portals

#### `createPortal`

```ts
function createPortal(children: VNodeChild, target: Element): VNodeChild
```

Renders `children` into a different DOM `target`, just like React's `createPortal`.

```tsx
function Modal(props: { open: boolean; children: VNodeChild }) {
  return props.open
    ? createPortal(
        <div class="modal-overlay">
          <div class="modal">{props.children}</div>
        </div>,
        document.getElementById('modal-root')!,
      )
    : null
}
```

**Dropdown positioned outside the flow:**

```tsx
function Dropdown(props: { trigger: VNodeChild; children: VNodeChild }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>()

  return (
    <div ref={triggerRef} onClick={() => setOpen((prev) => !prev)}>
      {props.trigger}
      {open &&
        createPortal(
          <div
            class="dropdown-menu"
            style={(() => {
              const rect = triggerRef.current?.getBoundingClientRect()
              return rect ? `position:fixed;top:${rect.bottom}px;left:${rect.left}px` : ''
            })()}
          >
            {props.children}
          </div>,
          document.body,
        )}
    </div>
  )
}
```

### Suspense and Lazy Loading

#### `lazy`

```ts
function lazy<P>(load: () => Promise<{ default: ComponentFn<P> }>): LazyComponent<P>
```

Wraps a dynamic import. The returned component renders `null` until the module resolves. Pair with `<Suspense>` to show a fallback.

```tsx
const Dashboard = lazy(() => import('./Dashboard'))
const Settings = lazy(() => import('./Settings'))
const Profile = lazy(() => import('./Profile'))

function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div>
      <nav>
        <button onClick={() => setPage('dashboard')}>Dashboard</button>
        <button onClick={() => setPage('settings')}>Settings</button>
        <button onClick={() => setPage('profile')}>Profile</button>
      </nav>
      <Suspense fallback={<div class="loading-skeleton" />}>
        {page === 'dashboard' ? (
          <Dashboard />
        ) : page === 'settings' ? (
          <Settings />
        ) : page === 'profile' ? (
          <Profile />
        ) : (
          <div>Not found</div>
        )}
      </Suspense>
    </div>
  )
}
```

#### `Suspense` / `ErrorBoundary`

Re-exported from `@pyreon/core`. `<Suspense>` shows a fallback while lazy children load. `<ErrorBoundary>` catches errors in its subtree.

```tsx
function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Error: {String(err)}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <Suspense fallback={<LoadingSkeleton />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  )
}
```

### Batching

#### `batch`

```ts
function batch<T>(fn: () => T): T
```

Groups multiple signal updates into a single flush. React 18 batches updates automatically inside event handlers; Pyreon does the same, but `batch` gives you explicit control for updates outside of event handlers.

```tsx
batch(() => {
  setName('Alice')
  setAge(30)
  setRole('admin')
})
// Only one re-computation, not three
```

**Batch with async boundaries:**

```tsx
async function fetchAndUpdate() {
  const [user, posts] = await Promise.all([fetchUser(), fetchPosts()])

  // Multiple updates from async result -- batch them
  batch(() => {
    setUser(user)
    setPosts(posts)
    setLoading(false)
  })
}
```

### Additional Exports

#### `createSelector`

```ts
function createSelector<T>(source: () => T): (key: T) => boolean
```

An O(1) equality selector from `@pyreon/reactivity`. Useful for large lists where only the selected item should react to selection changes. No direct React equivalent. Its `source` is a Pyreon accessor, so pass `() => selectedId` when bridging from a `useState` value.

```tsx
function SelectableList(props: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const isSelected = createSelector(() => selectedId)

  return (
    <ul>
      {props.items.map((item) => (
        <li
          class={isSelected(item.id) ? 'selected' : ''}
          onClick={() => setSelectedId(item.id)}
        >
          {item.name}
        </li>
      ))}
    </ul>
  )
}
```

#### Lifecycle Hooks

`onMount`, `onUnmount`, and `onUpdate` are re-exported from `@pyreon/core` for cases where you want Pyreon-native lifecycle hooks alongside the React-compatible API.

```tsx
import { onMount, onUnmount, onUpdate } from '@pyreon/react-compat'

function MyComponent() {
  onMount(() => {
    console.log('Mounted')
    return () => console.log('Cleanup from onMount')
  })

  onUnmount(() => {
    console.log('Unmounted')
  })

  onUpdate(() => {
    console.log('A reactive update occurred')
  })

  return <div>Hello</div>
}
```

#### `useErrorBoundary`

Re-export of `onErrorCaptured` from `@pyreon/core`. Register a handler for errors thrown in child components.

```tsx
import { useErrorBoundary } from '@pyreon/react-compat'

function SafeWrapper(props: { children: VNodeChild }) {
  const [error, setError] = useState<string | null>(null)

  useErrorBoundary((err) => {
    setError(String(err))
    return true // handled
  })

  return error ? <div class="error">{error}</div> : props.children
}
```

## DOM Entry Point

### `@pyreon/react-compat/dom`

Provides `createRoot` and `render` for mounting your app, matching the `react-dom/client` API.

#### `createRoot`

```ts
function createRoot(container: Element): { render(element: VNodeChild): void; unmount(): void }
```

```tsx
import { createRoot } from '@pyreon/react-compat/dom'

const root = createRoot(document.getElementById('app')!)
root.render(<App />)

// Later -- replace content
root.render(<NewApp />)

// Later -- clean up
root.unmount()
```

Calling `render` again replaces the previous content (previous mount is cleaned up first). Calling `unmount` multiple times is safe.

#### `render`

```ts
function render(element: VNodeChild, container: Element): void
```

Legacy API matching React 17's `ReactDOM.render`. Mounts `element` into `container`.

```tsx
import { render } from '@pyreon/react-compat/dom'

render(<App />, document.getElementById('app')!)
```

## Common Migration Patterns

### State, effect, and memo reads port as-is

`useState` / `useReducer` / `useMemo` return plain values and deps arrays are honored, so most hook code needs no changes:

```tsx
// React and @pyreon/react-compat — identical
const [count, setCount] = useState(0)
const doubled = useMemo(() => count * 2, [count])

useEffect(() => {
  document.title = `Count: ${count}`
}, [count])

return <div>{count} / {doubled}</div>
```

### Lift state that must survive an ancestor re-render

A parent re-render rebuilds the whole child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to their initial values and its `useEffect([])` re-fires. If a child holds state that must persist across an unrelated parent re-render, lift it up:

```tsx
// Risky: `draft` resets whenever <Parent> re-renders for any reason
function Parent() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <Editor /> {/* its internal draft is rebuilt on every count change */}
    </div>
  )
}

// Safe: the draft lives in <Parent>, so it survives the count re-render
function Parent() {
  const [count, setCount] = useState(0)
  const [draft, setDraft] = useState('')
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <Editor value={draft} onChange={setDraft} />
    </div>
  )
}
```

`memo` does not prevent this — the subtree is still rebuilt — so it is not a substitute for lifting the state.

## Migration Gotchas

### Third-Party React Libraries

Libraries that depend on React internals (reconciler, fiber, etc.) will not work with `@pyreon/react-compat`. Libraries that only use the public hook API (`useState`, `useEffect`, etc.) may work with alias configuration:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      react: '@pyreon/react-compat',
      'react-dom': '@pyreon/react-compat/dom',
      'react-dom/client': '@pyreon/react-compat/dom',
    },
  },
})
```

### forwardRef

`forwardRef` is implemented as a pass-through — the render function receives `(props, ref)` and the ref is merged into props, so existing `forwardRef` code keeps working. In new Pyreon code you can also pass refs as regular props directly:

```tsx
// forwardRef still works
const FancyInput = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <input ref={ref} {...props} />
))

// Or just pass ref as a prop
const FancyInput = (props: Props & { ref?: Ref<HTMLInputElement> }) => (
  <input ref={props.ref} {...props} />
)
```

### React.Children

The `Children` API is supported (`map`, `forEach`, `count`, `toArray`, `only`), but operates on Pyreon `VNodeChild` shapes. For simple cases, standard array methods on `props.children` work too.

### Class components

`Component` / `PureComponent` exist for import compatibility, but they are stubs: `setState` / `forceUpdate` warn-and-no-op, lifecycle methods never fire, and `render()` returns `null`. Refactor class components to function components with hooks, and use `onMount` / `onUnmount` from `@pyreon/core` for lifecycle.

### Strict Mode

`<StrictMode>` is a pass-through that renders its children directly — no double-invocation checks. It is kept so migrated code does not break.

## Migration Checklist

1. Replace `react` / `react-dom` imports with `@pyreon/react-compat` / `@pyreon/react-compat/dom`.
2. Hook state reads are unchanged -- `useState` / `useReducer` / `useMemo` return values directly (`count`, not `count()`), and deps arrays are honored, so most hook code ports as-is.
3. Lift any state that must survive an **ancestor** re-render -- a parent re-render rebuilds the child subtree, resetting nested `useState` and re-firing `useEffect([])`.
4. Refactor class components to function components with hooks -- `Component` / `PureComponent` are stubs (`setState` / `forceUpdate` warn-and-no-op, lifecycle never fires).
5. Replace concurrent-mode-dependent behavior -- `useTransition` / `useDeferredValue` / `startTransition` / `flushSync` are synchronous no-ops, so any code relying on deferral needs another approach.
6. Check third-party library compatibility. Libraries using React internals will need alternatives.
7. `forwardRef`, `memo`, and the `Children` API are all implemented, so those wrappers can stay.
8. `<StrictMode>` is a harmless pass-through; you can keep it.
