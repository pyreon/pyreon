---
title: '@pyreon/core'
description: Component model, VNode types, JSX runtime, lifecycle hooks, and built-in control flow components.
---

`@pyreon/core` provides the component model for Pyreon. It includes the hyperscript function (`h`), JSX runtime, lifecycle hooks, context system, ref system, and built-in control flow components like `Show`, `For`, `Switch`, `Portal`, `Suspense`, and `ErrorBoundary`.

<PackageBadge name="@pyreon/core" href="/docs/core" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/core
```

```bash [bun]
bun add @pyreon/core
```

```bash [pnpm]
pnpm add @pyreon/core
```

```bash [yarn]
yarn add @pyreon/core
```

:::

## Components

A Pyreon component is a plain function that runs **once**. It receives props, may call lifecycle hooks during setup, and returns a VNode (or null). Reactivity is handled by signals and effects, not by re-running the component function. This is a fundamental difference from React and Preact, where component functions re-execute on every state change.

```tsx
import { defineComponent } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

const Counter = defineComponent((props: { initial: number }) => {
  const count = signal(props.initial)

  return (
    <div>
      <span>{count()}</span>
      <button onClick={() => count.update((n) => n + 1)}>+1</button>
    </div>
  )
})
```

### defineComponent

An identity wrapper that marks a function as a Pyreon component. It preserves the function's type and is useful for IDE tooling, future compiler optimizations, and making component intent explicit in your codebase.

```ts
import { defineComponent } from "@pyreon/core"

const MyComponent = defineComponent((props: { name: string }) => {
  return <h1>Hello, {props.name}</h1>
})
```

`defineComponent` does not transform or wrap the function -- it returns the exact same reference. Its value is declarative: it signals to tooling and the compiler that a function is a component, not a utility.

### Setup Function Pattern

The most common way to write components is the setup function pattern. The function body is the setup phase: you create signals, register lifecycle hooks, set up effects, and return the render tree. The function runs once; reactivity handles all future updates.

```tsx
import { defineComponent, onMount, onUnmount, createRef } from '@pyreon/core'
import { signal, effect } from '@pyreon/reactivity'

const SearchBox = defineComponent((props: { placeholder: string }) => {
  // --- Setup phase: runs once ---

  // Create reactive state
  const query = signal('')
  const results = signal<string[]>([])
  const inputRef = createRef<HTMLInputElement>()

  // Register lifecycle hooks
  onMount(() => {
    inputRef.current?.focus()
  })

  // Set up effects
  effect(() => {
    const q = query()
    if (q.length < 2) {
      results.set([])
      return
    }
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => results.set(data))
  })

  // --- Return the render tree (once) ---
  return (
    <div class="search-box">
      <input
        ref={inputRef}
        placeholder={props.placeholder}
        value={() => query()}
        onInput={(e) => query.set(e.currentTarget.value)}
      />
      <ul>{() => results().map((r) => <li>{r}</li>)}</ul>
    </div>
  )
})
```

### Render Function Pattern

For simpler components that do not need lifecycle hooks or complex setup, you can return JSX directly:

```tsx
const Greeting = (props: { name: string }) => {
  return <h1>Hello, {props.name}!</h1>
}
```

For components with dynamic rendering logic, return a reactive accessor function:

```tsx
const ConditionalGreeting = (props: { name: () => string; show: () => boolean }) => {
  return () => (props.show() ? <h1>Hello, {props.name()}!</h1> : null)
}
```

### TypeScript Component Typing

Pyreon components are typed using the `ComponentFn` type, which is a generic function that accepts props and returns a VNode or null:

```ts
import type { ComponentFn, Props, VNode, VNodeChild } from "@pyreon/core"

// The ComponentFn type
type ComponentFn<P extends Props = Props> = (props: P) => VNodeChild

// Type your props explicitly
interface UserCardProps {
  name: string
  email: string
  avatar?: string
  onClick?: (e: MouseEvent) => void
}

const UserCard: ComponentFn<UserCardProps> = (props) => {
  return (
    <div class="user-card" onClick={props.onClick}>
      {props.avatar && <img src={props.avatar} alt={props.name} />}
      <h3>{props.name}</h3>
      <p>{props.email}</p>
    </div>
  )
}
```

Children are passed via `props.children`:

```tsx
interface CardProps {
  title: string
  children?: VNodeChild
}

const Card = defineComponent((props: CardProps) => {
  return (
    <div class="card">
      <h2>{props.title}</h2>
      <div class="card-body">{props.children}</div>
    </div>
  )
})

// Usage
<Card title="Welcome">
  <p>Card content goes here</p>
</Card>
```

### Component Composition Patterns

#### Slot Pattern

Pass named children via props for flexible composition:

```tsx
interface LayoutProps {
  header: VNodeChild
  sidebar: VNodeChild
  children?: VNodeChild
  footer?: VNodeChild
}

const Layout = defineComponent((props: LayoutProps) => {
  return (
    <div class="layout">
      <header>{props.header}</header>
      <aside>{props.sidebar}</aside>
      <main>{props.children}</main>
      {props.footer && <footer>{props.footer}</footer>}
    </div>
  )
})

// Usage
<Layout
  header={<Nav />}
  sidebar={<Sidebar />}
  footer={<FooterLinks />}
>
  <PageContent />
</Layout>
```

#### Render Prop Pattern

Pass a function as a child for flexible rendering:

```tsx
interface MouseTrackerProps {
  children: (pos: { x: () => number; y: () => number }) => VNodeChild
}

const MouseTracker = defineComponent((props: MouseTrackerProps) => {
  const x = signal(0)
  const y = signal(0)

  onMount(() => {
    const handler = (e: MouseEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
    }
    window.addEventListener("mousemove", handler)
    return () => window.removeEventListener("mousemove", handler)
  })

  return <div>{props.children({ x, y })}</div>
})

// Usage
<MouseTracker>
  {(pos) => <p>Mouse at ({pos.x()}, {pos.y()})</p>}
</MouseTracker>
```

#### Higher-Order Component Pattern

Wrap components to add behavior:

```tsx
function withLogging<P extends Props>(Inner: ComponentFn<P>): ComponentFn<P> {
  return defineComponent((props: P) => {
    onMount(() => {
      console.log(`${Inner.name} mounted`)
      return () => console.log(`${Inner.name} unmounted`)
    })
    return <Inner {...props} />
  })
}

const LoggedCounter = withLogging(Counter)
```

## Hyperscript (h)

The `h` function is the compiled output of JSX. It creates VNode objects that describe the UI tree.

```ts
import { h, Fragment } from '@pyreon/core'
```

### Creating Elements

```tsx
// Simple element with text
<div>Hello World</div>

// Element with props
<div class="container" id="main">Content</div>

// Element with reactive props
<div class={() => isActive() ? "active" : "inactive"} />

// Element with event handlers
<button onClick={() => count.update(n => n + 1)}>Click me</button>

// Element with style (string or object)
<div style="color: red; font-size: 16px" />
<div style={{ color: "red", fontSize: "16px" }} />
<div style={() => ({ color: isError() ? "red" : "green" })} />
```

### Nesting Children

```tsx
// Multiple children
<div>
  <h1>Title</h1>
  <p>Paragraph one</p>
  <p>Paragraph two</p>
</div>

// Mixed children: strings, numbers, VNodes
<div>
  Text node
  {42}
  <span>Nested</span>
</div>

// Reactive children via accessor functions
<div>
  {() => count() > 0 ? <span>Positive</span> : <span>Zero or negative</span>}
</div>
```

### Components

```tsx
// Render a component
<Counter initial={0} />

// Component with children
<Card title="Hello">
  <p>Card body</p>
</Card>
```

### Fragments

Fragments let you group children without adding a wrapper DOM element:

```tsx
// Fragment (no wrapper element)
<>
  <span>A</span>
  <span>B</span>
</>
```

### VNode Structure

Every call to `h` returns a VNode:

```ts
interface VNode {
  /** Tag name ("div"), component function, or symbol (Fragment, ForSymbol) */
  type: string | ComponentFn | symbol
  /** Props passed to the element or component */
  props: Props
  /** Children passed as rest arguments to h() */
  children: VNodeChild[]
  /** Key for list reconciliation (extracted from props.key) */
  key: string | number | null
}
```

Children can be:

- **Strings and numbers** -- rendered as text nodes
- **Booleans, null, undefined** -- rendered as nothing (useful for conditional `&#123;flag && <Element />&#125;`)
- **VNodes** -- nested elements or components
- **Arrays** -- automatically flattened
- **Accessor functions** `() => VNodeChild` -- evaluated reactively by the renderer

### EMPTY_PROPS Sentinel

`EMPTY_PROPS` is a shared empty object used when `h()` is called with `null` props. The renderer identity-checks against it to skip unnecessary prop application:

```tsx
import { EMPTY_PROPS } from "@pyreon/core"

// These produce the same result
<div>Hello</div>
<div>Hello</div>
```

## JSX Runtime

Pyreon ships a JSX automatic runtime. When your bundler encounters JSX, it transforms it into calls to the runtime functions.

### Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

When using the Pyreon Vite plugin, this is configured automatically.

### How It Works

The JSX runtime exports `jsx`, `jsxs`, and `Fragment`. The bundler rewrites JSX like this:

```tsx
// Source JSX
;<div class="box">
  <span>{name()}</span>
</div>

// Compiled output
import { jsx, jsxs } from '@pyreon/core/jsx-runtime'
jsxs('div', {
  class: 'box',
  children: jsx('span', { children: name() }),
})
```

For components, children are placed in `props.children` rather than in `vnode.children`, so the component function receives them:

```tsx
// Source JSX
;<Card title="Hello">
  <p>Content</p>
</Card>

// Compiled output (component)
jsx(Card, {
  title: 'Hello',
  children: jsx('p', { children: 'Content' }),
})
```

### JSX Type Definitions

Pyreon provides comprehensive JSX type definitions for all standard HTML and SVG elements. Each element type has its own attribute interface with proper typing:

- **HTML elements**: `div`, `span`, `button`, `input`, `form`, `a`, `img`, etc.
- **SVG elements**: `svg`, `path`, `circle`, `rect`, `g`, `text`, etc. -- includes 40+ SVG-specific attributes for gradients, patterns, markers, clipping, masking, filters, presentation, text, and path elements (no catch-all index signature)
- **HTML global attributes**: `class`, `style`, `ref`, `key`, `innerHTML`, `dangerouslySetInnerHTML`, `contentEditable`, `spellCheck`, `autoCapitalize`, `translate`, `enterKeyHint`, `inputMode`, `slot`, `part`, `popover`, `popoverTarget`, `popoverTargetAction`, `inert`, `is`
- **Element-specific attributes**: input (`capture`, `formNoValidate`), anchor (`hreflang`, `ping`, `referrerPolicy`), img (`fetchPriority`), video (`disablePictureInPicture`, `disableRemotePlayback`), form (`acceptCharset`, `rel`)
- **Event handlers**: `onClick`, `onInput`, `onKeyDown`, `onSubmit`, etc.
- **ARIA attributes**: `aria-label`, `aria-hidden`, `aria-expanded`, etc.
- **Reactive props**: many attributes accept `() => T` accessors for fine-grained reactivity

```tsx
// Reactive class
<div class={() => isActive() ? "active" : ""}>

// Reactive style (object or string)
<div style={() => ({ color: theme().primary })}>

// Reactive input value
<input value={() => query()} onInput={(e) => setQuery(e.target.value)} />

// Reactive disabled state
<button disabled={() => isLoading()}>Submit</button>
```

## Lifecycle Hooks

Lifecycle hooks are called during the component's setup phase (the single function execution). They register callbacks for specific lifecycle events. The hooks are powered by a module-level hook storage that the renderer sets before calling each component function.

### onMount

Register a callback to run after the component is mounted to the DOM. Optionally return a cleanup function that runs on unmount.

```tsx
import { onMount } from '@pyreon/core'

function MyComponent() {
  onMount(() => {
    console.log('Mounted!')
    const timer = setInterval(() => console.log('tick'), 1000)
    return () => clearInterval(timer) // cleanup on unmount
  })

  return <div>Hello</div>
}
```

Common use cases for `onMount`:

```tsx
// Focus an input on mount
function AutoFocusInput() {
  const inputRef = createRef<HTMLInputElement>()

  onMount(() => {
    inputRef.current?.focus()
  })

  return <input ref={inputRef} />
}

// Initialize a third-party library
function ChartComponent(props: { data: () => number[] }) {
  const containerRef = createRef<HTMLDivElement>()

  onMount(() => {
    const chart = new Chart(containerRef.current!, {
      type: 'line',
      data: props.data(),
    })

    // Effect to update the chart when data changes
    effect(() => {
      chart.update(props.data())
    })

    return () => chart.destroy()
  })

  return <div ref={containerRef} class="chart-container" />
}

// Set up a ResizeObserver
function ResponsiveBox() {
  const boxRef = createRef<HTMLDivElement>()
  const width = signal(0)

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width.set(entry.contentRect.width)
      }
    })
    observer.observe(boxRef.current!)
    return () => observer.disconnect()
  })

  return (
    <div ref={boxRef}>
      <p>Width: {width()}px</p>
    </div>
  )
}
```

### onUnmount

Register a callback to run when the component is removed from the DOM. Use this to clean up resources that were not set up via `onMount`'s return value.

```tsx
import { onUnmount } from '@pyreon/core'

function MyComponent() {
  const controller = new AbortController()

  // Fetch data with abort support
  fetch('/api/data', { signal: controller.signal })
    .then((r) => r.json())
    .then(setData)

  onUnmount(() => {
    controller.abort()
  })

  return <div>Active</div>
}
```

```tsx
// Clean up event listeners on external elements
function GlobalKeyHandler() {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }

  document.addEventListener('keydown', handler)
  onUnmount(() => document.removeEventListener('keydown', handler))

  return <div>Press Escape to close</div>
}
```

### onUpdate

Register a callback to run after each reactive update within the component. The callback fires via microtask after all synchronous effects settle, so the DOM is up-to-date when it runs.

```tsx
import { onUpdate } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

function DebugComponent() {
  const count = signal(0)
  let updateCount = 0

  onUpdate(() => {
    updateCount++
    console.log(`Update #${updateCount} - DOM is settled`)
  })

  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => count.update((n) => n + 1)}>Increment</button>
    </div>
  )
}
```

```tsx
// Scroll to bottom after updates (e.g., chat messages)
function ChatMessages(props: { messages: () => Message[] }) {
  const containerRef = createRef<HTMLDivElement>()

  onUpdate(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  return (
    <div ref={containerRef} class="chat-messages">
      {() => props.messages().map((m) => <div class="message">{m.text}</div>)}
    </div>
  )
}
```

### onCleanup

Register a cleanup function that runs when the current reactive scope is disposed. Inside an `effect`, `onCleanup` runs before each re-execution and on final disposal. Inside a component, it runs when the component unmounts. This is the idiomatic way to clean up resources in effects.

```tsx
import { onCleanup } from '@pyreon/core'
import { signal, effect } from '@pyreon/reactivity'

function WebSocketComponent(props: { url: () => string }) {
  const messages = signal<string[]>([])

  effect(() => {
    const ws = new WebSocket(props.url())
    ws.onmessage = (e) => messages.update((m) => [...m, e.data])

    // Runs before next effect re-execution and on unmount
    onCleanup(() => ws.close())
  })

  return <ul>{() => messages().map((m) => <li>{m}</li>)}</ul>
}
```

```tsx
// Cleanup a timer inside an effect
function Poller(props: { interval: () => number }) {
  const data = signal<string>('')

  effect(() => {
    const id = setInterval(() => {
      fetch('/api/data')
        .then((r) => r.text())
        .then((t) => data.set(t))
    }, props.interval())

    onCleanup(() => clearInterval(id))
  })

  return <p>{data()}</p>
}
```

### onErrorCaptured

Register an error handler for the component subtree. When an error is thrown during rendering or in a child component, the nearest `onErrorCaptured` handler is called. Return `true` to mark the error as handled and stop propagation.

```tsx
import { onErrorCaptured } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

function SafeWrapper(props: { children: VNodeChild }) {
  const error = signal<string | null>(null)

  onErrorCaptured((err) => {
    error.set(String(err))
    return true // handled -- stop propagation
  })

  return (
    <Show when={() => !error()} fallback={<p class="error">Error: {error()}</p>}>
      {props.children}
    </Show>
  )
}
```

If you do not return `true`, the error propagates to the next parent `onErrorCaptured` handler or `ErrorBoundary`.

```tsx
// Logging handler that does not stop propagation
function LoggingWrapper(props: { children: VNodeChild }) {
  onErrorCaptured((err) => {
    console.error('Child error:', err)
    // Not returning true -- error propagates to parent boundaries
  })

  return <div>{props.children}</div>
}
```

## Context

Pyreon's context system provides dependency injection without prop-drilling, similar to React's Context API or Vue's provide/inject. Values flow down the component tree via a stack-based provider system.

### createContext

Create a context with a default value. The default value is returned by `useContext` when no provider is found in the tree above.

```ts
import { createContext } from '@pyreon/core'

interface Theme {
  primary: string
  secondary: string
  background: string
}

const ThemeContext = createContext<Theme>({
  primary: '#007bff',
  secondary: '#6c757d',
  background: '#ffffff',
})
```

Each context gets a unique symbol ID, so even two contexts with the same default value are distinct:

```ts
const ContextA = createContext('default')
const ContextB = createContext('default')
// ContextA !== ContextB -- they have different symbol IDs
```

### useContext

Read the nearest provided value for a context. Falls back to the default value if no provider is found.

```tsx
import { useContext } from '@pyreon/core'

function ThemedButton() {
  const theme = useContext(ThemeContext)
  return (
    <button
      style={{
        background: theme.primary,
        color: theme.background,
      }}
    >
      Click me
    </button>
  )
}
```

### provide

Provide a context value to all descendants. Automatically handles cleanup on unmount. This is the recommended way to provide context inside components.

```tsx
import { createContext, provide, useContext } from '@pyreon/core'

const ThemeContext = createContext('light')

function ThemeProvider(props: { mode: string; children: VNodeChild }) {
  provide(ThemeContext, props.mode)
  return <>{props.children}</>
}

function ThemedContent() {
  const mode = useContext(ThemeContext) // "dark"
  return <div class={mode}>Themed content</div>
}

// Usage
;<ThemeProvider mode="dark">
  <ThemedContent />
</ThemeProvider>
```

::: info
`provide()` must be called during component setup (synchronously inside a component function). For SSR or test contexts outside component lifecycle, use the lower-level `pushContext`/`popContext` APIs.
:::

### withContext

Provide a value for a context during a function execution. Used internally by the renderer when it encounters a provider component.

```ts
import { withContext } from '@pyreon/core'

withContext(ThemeContext, { primary: 'red', secondary: 'blue', background: '#fff' }, () => {
  // All useContext(ThemeContext) calls here return the dark theme
  const theme = useContext(ThemeContext)
  console.log(theme.primary) // "red"
})
```

### Real-World Context Patterns

#### Authentication Context

```tsx
interface AuthState {
  user: { id: string; name: string; email: string } | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
})

function AuthProvider(props: { children: VNodeChild }) {
  const user = signal<AuthState['user']>(null)

  const authState: AuthState = {
    get user() {
      return user()
    },
    get isAuthenticated() {
      return user() !== null
    },
    async login(email, password) {
      const res = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      user.set(await res.json())
    },
    logout() {
      user.set(null)
    },
  }

  return withContext(AuthContext, authState, () => props.children)
}

// Consuming component
function UserMenu() {
  const auth = useContext(AuthContext)
  return (
    <Show when={() => auth.isAuthenticated} fallback={<LoginButton />}>
      <span>Welcome, {auth.user?.name}</span>
      <button onClick={auth.logout}>Log out</button>
    </Show>
  )
}
```

#### Internationalization Context

```tsx
const I18nContext = createContext<{
  locale: string
  t: (key: string) => string
}>({
  locale: 'en',
  t: (key) => key,
})

function useTranslation() {
  return useContext(I18nContext)
}

function Greeting() {
  const { t } = useTranslation()
  return <h1>{t('greeting.hello')}</h1>
}
```

### SSR Context Isolation

For server-side rendering with concurrent requests, `@pyreon/runtime-server` replaces the default context stack with an `AsyncLocalStorage`-backed provider via `setContextStackProvider()`. This ensures each SSR request has its own isolated context stack. You do not need to call this yourself -- it is handled automatically by the SSR runtime.

## Refs

Refs provide mutable containers for DOM element references. The runtime sets `ref.current` after the element is inserted into the DOM and clears it to `null` when the element is removed.

### createRef

```ts
import { createRef } from '@pyreon/core'

interface Ref<T = unknown> {
  current: T | null
}

type RefCallback<T = unknown> = (el: T | null) => void

type RefProp<T = unknown> = Ref<T> | RefCallback<T>

function createRef<T = unknown>(): Ref<T>
```

### Basic Usage

```tsx
import { createRef, onMount } from '@pyreon/core'

function AutoFocusInput() {
  const inputRef = createRef<HTMLInputElement>()

  onMount(() => {
    inputRef.current?.focus()
  })

  return <input ref={inputRef} placeholder="Auto-focused" />
}
```

### Multiple Refs

```tsx
function FormWithRefs() {
  const nameRef = createRef<HTMLInputElement>()
  const emailRef = createRef<HTMLInputElement>()
  const submitRef = createRef<HTMLButtonElement>()

  const focusNext = (current: 'name' | 'email') => {
    if (current === 'name') emailRef.current?.focus()
    else submitRef.current?.focus()
  }

  return (
    <form>
      <input
        ref={nameRef}
        placeholder="Name"
        onKeyDown={(e) => e.key === 'Enter' && focusNext('name')}
      />
      <input
        ref={emailRef}
        placeholder="Email"
        onKeyDown={(e) => e.key === 'Enter' && focusNext('email')}
      />
      <button ref={submitRef} type="submit">
        Submit
      </button>
    </form>
  )
}
```

### Ref Forwarding Pattern

Since refs are plain objects, forwarding them to child components is straightforward:

```tsx
interface FancyInputProps {
  inputRef?: Ref<HTMLInputElement>
  placeholder?: string
}

const FancyInput = defineComponent((props: FancyInputProps) => {
  return (
    <div class="fancy-input">
      <input ref={props.inputRef} placeholder={props.placeholder} />
    </div>
  )
})

// Parent component
function Parent() {
  const ref = createRef<HTMLInputElement>()

  onMount(() => {
    ref.current?.focus()
  })

  return <FancyInput inputRef={ref} placeholder="Type here..." />
}
```

### Canvas Ref Example

```tsx
function DrawingCanvas() {
  const canvasRef = createRef<HTMLCanvasElement>()

  onMount(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#007bff'
    ctx.fillRect(10, 10, 100, 100)
  })

  return <canvas ref={canvasRef} width={400} height={300} />
}
```

## Control Flow Components

### Show

Conditionally render children based on a reactive condition. The `when` prop must be a reactive accessor (a function). Children render when the return value is truthy; the `fallback` renders when falsy.

<PropTable
  title="Show Props"
  :props='[
    { name: "when", type: "() => boolean", required: true, description: "Reactive accessor that determines whether children or fallback render." },
    { name: "fallback", type: "VNodeChild", description: "Content to render when when() returns a falsy value." },
    { name: "children", type: "VNodeChild", required: true, description: "Content to render when when() returns a truthy value." },
  ]'
/>

```tsx
import { Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

function App() {
  const loggedIn = signal(false)

  return (
    <Show when={() => loggedIn()} fallback={<LoginPage />}>
      <Dashboard />
    </Show>
  )
}
```

#### Show with Fallback

```tsx
function UserProfile(props: { userId: () => string | null }) {
  return (
    <Show when={() => props.userId()} fallback={<p>No user selected. Pick one from the list.</p>}>
      <ProfileCard userId={props.userId} />
    </Show>
  )
}
```

#### Nested Show

```tsx
function PermissionGate(props: { children: VNodeChild }) {
  const user = signal<User | null>(null)
  const isAdmin = signal(false)

  return (
    <Show when={() => user()} fallback={<LoginPrompt />}>
      <Show when={() => isAdmin()} fallback={<AccessDenied />}>
        {props.children}
      </Show>
    </Show>
  )
}
```

### Switch / Match

Multi-branch conditional rendering. Evaluates each `Match` child in order and renders the first whose `when()` is truthy. Falls back to the `fallback` prop if no match is found.

```tsx
import { Switch, Match } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

function App() {
  const page = signal('home')

  return (
    <Switch fallback={<NotFound />}>
      <Match when={() => page() === 'home'}>
        <HomePage />
      </Match>
      <Match when={() => page() === 'about'}>
        <AboutPage />
      </Match>
      <Match when={() => page() === 'contact'}>
        <ContactPage />
      </Match>
    </Switch>
  )
}
```

#### Switch for Status States

```tsx
function AsyncContent(props: { loading: () => boolean; error: () => string | null }) {
  return (
    <Switch fallback={<div>Ready</div>}>
      <Match when={props.loading}>
        <Spinner />
      </Match>
      <Match when={() => props.error() !== null}>
        <div class="error">{props.error()}</div>
      </Match>
    </Switch>
  )
}
```

#### Switch for Type Discrimination

```tsx
type Notification =
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string; code: number }

function NotificationBanner(props: { notification: () => Notification }) {
  return (
    <Switch>
      <Match when={() => props.notification().type === 'success'}>
        <div class="banner success">{props.notification().message}</div>
      </Match>
      <Match when={() => props.notification().type === 'warning'}>
        <div class="banner warning">{props.notification().message}</div>
      </Match>
      <Match when={() => props.notification().type === 'error'}>
        <div class="banner error">
          Error {(props.notification() as { code: number }).code}: {props.notification().message}
        </div>
      </Match>
    </Switch>
  )
}
```

### For

Efficient reactive list rendering with keyed reconciliation. Unlike a plain `.map()`, `For` never re-creates VNodes for existing keys -- only new keys invoke the render function. Structural mutations (swap, sort, filter) are O(n) key scan + O(k) DOM moves where k is the number of actually displaced entries.

<PropTable
  title="For Props"
  :props='[
    { name: "each", type: "() => T[]", required: true, description: "Reactive accessor returning the source array to iterate over." },
    { name: "by", type: "(item: T, index: number) => string | number", required: true, description: "Key function for unique, stable identifiers. Used for reconciliation." },
    { name: "children", type: "(item: T) => VNode", required: true, description: "Render function called once per unique key." },
  ]'
/>

```tsx
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

function TodoList() {
  const todos = signal([
    { id: 1, text: 'Learn Pyreon' },
    { id: 2, text: 'Build something' },
  ])

  return (
    <ul>
      {For({
        each: () => todos(),
        by: (item) => item.id,
        children: (item) => <li>{item.text}</li>,
      })}
    </ul>
  )
}
```

#### Keying Strategy

The `by` function must return a unique, stable identifier for each item. Common keying strategies:

```tsx
// Database ID (best)
For({ each: () => users(), by: (u) => u.id, children: renderUser })

// Composite key
For({
  each: () => items(),
  by: (item) => `${item.category}-${item.id}`,
  children: renderItem,
})

// Index-based key (use only when items have no stable identity)
For({
  each: () => items(),
  by: (_, index) => index,
  children: renderItem,
})
```

#### For with Complex Rendering

```tsx
function UserList() {
  const users = signal<User[]>([])
  const selectedId = signal<number | null>(null)

  return (
    <div class="user-list">
      {For({
        each: () => users(),
        by: (u) => u.id,
        children: (user) => (
          <div
            class={() => (selectedId() === user.id ? 'user selected' : 'user')}
            onClick={() => selectedId.set(user.id)}
          >
            <img src={user.avatar} alt={user.name} />
            <span>{user.name}</span>
            <span class="email">{user.email}</span>
          </div>
        ),
      })}
    </div>
  )
}
```

### Portal

Renders children into a different DOM node than the current parent tree. Useful for modals, tooltips, dropdowns, and any overlay that needs to escape CSS overflow or stacking context restrictions.

```tsx
import { Portal } from '@pyreon/core'

function Modal(props: { onClose: () => void; children: VNodeChild }) {
  return (
    <Portal target={document.body}>
      <div class="modal-overlay" onClick={props.onClose}>
        <div class="modal-content" onClick={(e) => e.stopPropagation()}>
          {props.children}
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </Portal>
  )
}
```

#### Tooltip with Portal

```tsx
function Tooltip(props: { text: string; children: VNodeChild }) {
  const show = signal(false)
  const position = signal({ top: 0, left: 0 })
  const triggerRef = createRef<HTMLSpanElement>()

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      position.set({ top: rect.bottom + 8, left: rect.left })
    }
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => {
          updatePosition()
          show.set(true)
        }}
        onMouseLeave={() => show.set(false)}
      >
        {props.children}
      </span>
      <Show when={() => show()}>
        <Portal target={document.body}>
          <div
            class="tooltip"
            style={() => ({
              position: 'fixed',
              top: `${position().top}px`,
              left: `${position().left}px`,
            })}
          >
            {props.text}
          </div>
        </Portal>
      </Show>
    </>
  )
}
```

### Suspense

Shows a fallback while a lazy child component is still loading. Works with the `lazy()` helper from `@pyreon/core` (or `@pyreon/react-compat`).

```tsx
import { Suspense, lazy } from '@pyreon/core'

const HeavyComponent = lazy(() => import('./HeavyComponent'))

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyComponent />
    </Suspense>
  )
}
```

#### Suspense with Multiple Lazy Components

```tsx
const Dashboard = lazy(() => import('./Dashboard'))
const Analytics = lazy(() => import('./Analytics'))
const Settings = lazy(() => import('./Settings'))

function App() {
  const page = signal('dashboard')

  return (
    <Suspense fallback={<div class="loading-skeleton" />}>
      <Switch>
        <Match when={() => page() === 'dashboard'}>
          <Dashboard />
        </Match>
        <Match when={() => page() === 'analytics'}>
          <Analytics />
        </Match>
        <Match when={() => page() === 'settings'}>
          <Settings />
        </Match>
      </Switch>
    </Suspense>
  )
}
```

The `Suspense` component checks if a child VNode's type has a `__loading()` signal that returns `true`. While loading, the fallback is displayed; once the module resolves, the actual component renders.

### ErrorBoundary

Catches errors thrown by child components and renders a fallback UI instead of crashing the entire tree. Also reports caught errors to any registered telemetry handlers.

```tsx
import { ErrorBoundary } from '@pyreon/core'

function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="error-panel">
          <h2>Something went wrong</h2>
          <p>{String(err)}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      <RiskyComponent />
    </ErrorBoundary>
  )
}
```

The `fallback` function receives:

- `err` -- the caught error value
- `reset()` -- a function that clears the error state and re-renders children

#### Nested Error Boundaries

```tsx
function App() {
  return (
    <ErrorBoundary fallback={(err) => <AppCrashScreen error={err} />}>
      <Header />
      <main>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div>
              <p>Widget failed: {String(err)}</p>
              <button onClick={reset}>Retry</button>
            </div>
          )}
        >
          <UnstableWidget />
        </ErrorBoundary>
        <StableContent />
      </main>
    </ErrorBoundary>
  )
}
```

Inner boundaries catch errors first. If an inner boundary is already in an error state (it has already caught one error), the error propagates to the next outer boundary.

#### Error Boundary Internals

`ErrorBoundary` uses a module-level stack of handler functions. During setup, it pushes a handler onto the stack. When a child component throws during mount, `dispatchToErrorBoundary()` invokes the innermost handler. The handler stores the error in a signal; when the signal becomes non-null, the fallback renders instead of the children.

## Dynamic

Renders a component or HTML element dynamically based on a reactive value. Useful for rendering polymorphic components or switching between element types at runtime.

```tsx
import { Dynamic } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

// Dynamic component
const currentView = signal<'home' | 'settings'>('home')
const views = { home: HomePage, settings: SettingsPage }

function App() {
  return <Dynamic component={views[currentView()]} />
}
```

```tsx
// Dynamic HTML element
const tag = signal<'h1' | 'h2' | 'p'>('h1')

function Heading(props: { text: string }) {
  return (
    <Dynamic component={tag()} class="heading">
      {props.text}
    </Dynamic>
  )
}
```

### DynamicProps

```ts
interface DynamicProps extends Props {
  /** Component function or HTML tag name to render */
  component: ComponentFn | string
}
```

All other props are forwarded to the resolved component or element. If `component` is falsy, `Dynamic` returns `null`.

## lazy

Lazily load a component module. Returns a wrapper component that shows `null` while loading and the resolved component once ready. Pairs with `Suspense` to show a fallback during loading.

```tsx
import { lazy, Suspense } from '@pyreon/core'

const HeavyChart = lazy(() => import('./HeavyChart'))

function Dashboard() {
  return (
    <Suspense fallback={<div>Loading chart...</div>}>
      <HeavyChart data={chartData()} />
    </Suspense>
  )
}
```

### How lazy Works

1. `lazy()` starts the dynamic `import()` immediately.
2. While loading, the wrapper component returns `null` and exposes a `__loading()` signal that returns `true`.
3. `Suspense` detects `__loading()` and renders the fallback instead.
4. Once the module resolves, the signal flips and `Suspense` renders the actual component.
5. If the import fails, the error is thrown during rendering and can be caught by `ErrorBoundary`.

```ts
function lazy<P extends Props>(load: () => Promise<{ default: ComponentFn<P> }>): LazyComponent<P>
```

## mapArray

Keyed reactive list mapping that creates each mapped item exactly once per key and reuses it across updates. When the source array is reordered or partially changed, only new keys invoke `map()`; existing entries return the cached result. Removed keys are evicted from the cache.

```ts
import { mapArray } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

const items = signal([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
])

const mapped = mapArray(
  items,
  (item) => item.id,
  (item) => ({ ...item, uppercaseName: item.name.toUpperCase() }),
)

// mapped() returns the mapped array, reusing cached entries for unchanged keys
console.log(mapped())
// [{ id: 1, name: "Alice", uppercaseName: "ALICE" }, ...]
```

### mapArray for DOM Node Caching

```ts
const nodes = mapArray(
  items,
  (item) => item.id,
  (item) => {
    const el = document.createElement('div')
    el.textContent = item.name
    el.className = 'list-item'
    return el
  },
)

// nodes() returns the same DOM elements for unchanged keys
// Only creates new elements for new keys
```

### API Signature

```ts
function mapArray<T, U>(
  source: () => T[],
  getKey: (item: T) => string | number,
  map: (item: T) => U,
): () => U[]
```

## Prop Utilities

### splitProps

Split a props object into two parts: one with the specified keys, and one with the rest. Both parts preserve reactivity -- accessing a property on either part reads the original prop.

```tsx
import { splitProps } from '@pyreon/core'

function Button(props: { label: string; icon?: string } & PyreonHTMLAttributes<HTMLButtonElement>) {
  const [own, html] = splitProps(props, ['label', 'icon'])

  return (
    <button {...html}>
      <Show when={() => !!own.icon}>
        <Icon name={own.icon!} />
      </Show>
      {own.label}
    </button>
  )
}
```

```ts
function splitProps<T extends object, K extends keyof T>(
  props: T,
  keys: K[],
): [Pick<T, K>, Omit<T, K>]
```

### mergeProps

Merge multiple props objects into one, with later sources overriding earlier ones. The merged object is lazy -- property reads go through the original sources, preserving reactivity.

```tsx
import { mergeProps } from '@pyreon/core'

function Button(props: { size?: 'sm' | 'md' | 'lg'; variant?: string }) {
  const merged = mergeProps({ size: 'md', variant: 'primary' }, props)

  return <button class={() => `btn-${merged.size} btn-${merged.variant}`}>{merged.children}</button>
}
```

```ts
function mergeProps<T extends object[]>(...sources: T): MergedProps<T>
```

### createUniqueId

Generate a unique string ID that is stable across server and client renders. Use this for linking labels to inputs, ARIA attributes, and other cases where you need a deterministic unique ID.

```tsx
import { createUniqueId } from '@pyreon/core'

function LabeledInput(props: { label: string }) {
  const id = createUniqueId()

  return (
    <div>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </div>
  )
}
```

```ts
function createUniqueId(): string
```

## Telemetry

Register global error handlers for monitoring and reporting. This integrates with services like Sentry, Datadog, or custom error tracking.

### registerErrorHandler

```ts
import { registerErrorHandler } from '@pyreon/core'
import * as Sentry from '@sentry/browser'

const unregister = registerErrorHandler((ctx) => {
  Sentry.captureException(ctx.error, {
    extra: {
      component: ctx.component,
      phase: ctx.phase,
      timestamp: ctx.timestamp,
    },
  })
})

// Later: remove the handler
unregister()
```

### ErrorContext Interface

```ts
interface ErrorContext {
  /** Component function name, or "Anonymous" */
  component: string
  /** Lifecycle phase where the error occurred */
  phase: 'setup' | 'render' | 'mount' | 'unmount' | 'effect'
  /** The thrown value */
  error: unknown
  /** Unix timestamp (ms) */
  timestamp: number
  /** Component props at the time of the error */
  props?: Record<string, unknown>
}
```

### Multiple Error Handlers

You can register multiple handlers. Each receives every error independently:

```ts
// Console logging
registerErrorHandler((ctx) => {
  console.error(`[${ctx.phase}] ${ctx.component}:`, ctx.error)
})

// Analytics
registerErrorHandler((ctx) => {
  analytics.track('component_error', {
    component: ctx.component,
    phase: ctx.phase,
  })
})

// Custom error service
registerErrorHandler((ctx) => {
  errorService.report(ctx.error, { component: ctx.component })
})
```

Handler errors are silently swallowed -- a failing handler never propagates back into the framework.

## Real-World Component Examples

### Form Component

```tsx
import { defineComponent, createRef, onMount } from '@pyreon/core'
import { signal, effect } from '@pyreon/reactivity'

interface FormField {
  value: string
  error: string | null
  touched: boolean
}

const ContactForm = defineComponent(() => {
  const name = signal<FormField>({ value: '', error: null, touched: false })
  const email = signal<FormField>({ value: '', error: null, touched: false })
  const message = signal<FormField>({ value: '', error: null, touched: false })
  const submitting = signal(false)
  const submitted = signal(false)

  const validate = (field: string, value: string): string | null => {
    if (field === 'name' && value.length < 2) return 'Name must be at least 2 characters'
    if (field === 'email' && !value.includes('@')) return 'Invalid email address'
    if (field === 'message' && value.length < 10) return 'Message must be at least 10 characters'
    return null
  }

  const updateField = (sig: typeof name, field: string, value: string) => {
    sig.set({
      value,
      error: validate(field, value),
      touched: true,
    })
  }

  const isValid = () =>
    !name().error &&
    !email().error &&
    !message().error &&
    name().touched &&
    email().touched &&
    message().touched

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!isValid()) return

    submitting.set(true)
    try {
      await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: name().value,
          email: email().value,
          message: message().value,
        }),
      })
      submitted.set(true)
    } finally {
      submitting.set(false)
    }
  }

  return (
    <Show when={() => !submitted()} fallback={<p>Thank you for your message!</p>}>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name</label>
          <input
            value={() => name().value}
            onInput={(e) => updateField(name, 'name', e.currentTarget.value)}
          />
          <Show when={() => name().touched && name().error}>
            <span class="error">{name().error}</span>
          </Show>
        </div>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={() => email().value}
            onInput={(e) => updateField(email, 'email', e.currentTarget.value)}
          />
          <Show when={() => email().touched && email().error}>
            <span class="error">{email().error}</span>
          </Show>
        </div>
        <div>
          <label>Message</label>
          <textarea
            value={() => message().value}
            onInput={(e) => updateField(message, 'message', e.currentTarget.value)}
          />
          <Show when={() => message().touched && message().error}>
            <span class="error">{message().error}</span>
          </Show>
        </div>
        <button type="submit" disabled={() => !isValid() || submitting()}>
          {() => (submitting() ? 'Sending...' : 'Send')}
        </button>
      </form>
    </Show>
  )
})
```

### Modal Component

```tsx
const Modal = defineComponent(
  (props: { open: () => boolean; onClose: () => void; title: string; children?: VNodeChild }) => {
    // Close on Escape
    onMount(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') props.onClose()
      }
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    })

    return (
      <Show when={props.open}>
        <Portal target={document.body}>
          <div class="modal-backdrop" onClick={props.onClose}>
            <div class="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div class="modal-header">
                <h2>{props.title}</h2>
                <button onClick={props.onClose} aria-label="Close">
                  &times;
                </button>
              </div>
              <div class="modal-body">{props.children}</div>
            </div>
          </div>
        </Portal>
      </Show>
    )
  },
)
```

### Tabs Component

```tsx
const Tabs = defineComponent(
  (props: {
    tabs: Array<{ id: string; label: string; content: VNodeChild }>
    defaultTab?: string
  }) => {
    const activeTab = signal(props.defaultTab ?? props.tabs[0]?.id ?? '')

    return (
      <div class="tabs">
        <div class="tab-list" role="tablist">
          {props.tabs.map((tab) => (
            <button
              role="tab"
              class={() => (activeTab() === tab.id ? 'tab active' : 'tab')}
              aria-selected={() => activeTab() === tab.id}
              onClick={() => activeTab.set(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div class="tab-panel" role="tabpanel">
          <Switch>
            {props.tabs.map((tab) => (
              <Match when={() => activeTab() === tab.id}>{tab.content}</Match>
            ))}
          </Switch>
        </div>
      </div>
    )
  },
)
```

### Accordion Component

```tsx
const Accordion = defineComponent(
  (props: {
    items: Array<{ id: string; title: string; content: VNodeChild }>
    multiple?: boolean
  }) => {
    const openItems = signal<Set<string>>(new Set())

    const toggle = (id: string) => {
      openItems.update((current) => {
        const next = new Set(current)
        if (next.has(id)) {
          next.delete(id)
        } else {
          if (!props.multiple) next.clear()
          next.add(id)
        }
        return next
      })
    }

    return (
      <div class="accordion">
        {props.items.map((item) => (
          <div class="accordion-item">
            <button
              class="accordion-header"
              onClick={() => toggle(item.id)}
              aria-expanded={() => openItems().has(item.id)}
            >
              {item.title}
              <span class={() => (openItems().has(item.id) ? 'icon open' : 'icon')}>&#9660;</span>
            </button>
            <Show when={() => openItems().has(item.id)}>
              <div class="accordion-body">{item.content}</div>
            </Show>
          </div>
        ))}
      </div>
    )
  },
)
```

## Internal APIs

These APIs are used by the renderer and are not intended for application code.

### runWithHooks

Runs a component function in a tracked context so lifecycle hooks registered inside it are captured. Called by the renderer, not user code.

```ts
function runWithHooks<P extends Props>(
  fn: ComponentFn<P>,
  props: P,
): { vnode: VNodeChild; hooks: LifecycleHooks }
```

### propagateError

Walk up error handlers collected during component rendering. Returns `true` if any handler marked the error as handled.

### dispatchToErrorBoundary

Dispatch an error to the nearest active `ErrorBoundary`. Returns `true` if the boundary handled it.

## Exports Summary

<APICard name="defineComponent" type="component" signature="defineComponent<P>(setup: (props: P) => VNode | (() => VNode)): Component<P>" description="Marks a function as a Pyreon component for tooling and compiler optimizations." />

<APICard name="h" type="function" signature="h(type: string | ComponentFn | symbol, props: Props | null, ...children: VNodeChild[]): VNode" description="Hyperscript function and JSX compile target. Creates VNode objects that describe the UI tree." />

<APICard name="Show" type="component" signature="Show(props: { when: () => boolean; fallback?: VNodeChild; children: VNodeChild }): VNode" description="Conditionally renders children when the reactive `when` accessor returns a truthy value. Renders `fallback` otherwise." />

<APICard name="For" type="component" signature="For<T>(props: { each: () => T[]; by: (item: T, index: number) => string | number; children: (item: T) => VNode }): VNode" description="Keyed reactive list rendering with O(n) reconciliation. Only new keys invoke the render function; existing keys reuse cached VNodes." />

<APICard name="Switch/Match" type="component" signature="Switch(props: { fallback?: VNodeChild; children: Match[] }): VNode" description="Multi-branch conditional rendering. Evaluates each Match child in order and renders the first whose `when()` is truthy." />

<APICard name="Portal" type="component" signature="Portal(props: { target: Element; children: VNodeChild }): VNode" description="Renders children into a different DOM node, escaping the current parent tree. Useful for modals, tooltips, and overlays." />

<APICard name="Suspense" type="component" signature="Suspense(props: { fallback: VNodeChild; children: VNodeChild }): VNode" description="Shows a fallback while lazy child components are loading. Detects the `__loading()` signal on lazy component types." />

<APICard name="ErrorBoundary" type="component" signature="ErrorBoundary(props: { fallback: (err: unknown, reset: () => void) => VNodeChild; children: VNodeChild }): VNode" description="Catches errors thrown by child components and renders a fallback UI with an optional reset function." />

<APICard name="createRef" type="function" signature="createRef<T = unknown>(): Ref<T>" description="Creates a mutable ref container ({ current: T | null }) for holding DOM element references. The runtime sets and clears `current` automatically." />

<APICard name="provide/inject" type="function" signature="createContext<T>(defaultValue: T): Context<T> / useContext<T>(ctx: Context<T>): T / withContext<T>(ctx: Context<T>, value: T, fn: () => void): void" description="Context system for dependency injection without prop-drilling. Create a context, provide values down the tree, and read the nearest value with useContext." />

<APICard name="onMount" type="hook" signature="onMount(callback: () => void | (() => void)): void" description="Registers a callback to run after the component mounts to the DOM. Optionally return a cleanup function that runs on unmount." />

<APICard name="onUnmount" type="hook" signature="onUnmount(callback: () => void): void" description="Registers a callback to run when the component is removed from the DOM. Use for cleanup not covered by onMount's return value." />

<APICard name="onCleanup" type="hook" signature="onCleanup(fn: () => void): void" description="Registers a cleanup function for the current reactive scope. Inside effects, runs before each re-execution and on disposal. Inside components, runs on unmount." />

<APICard name="onUpdate" type="hook" signature="onUpdate(callback: () => void): void" description="Registers a callback to run after each reactive update within the component. Fires via microtask after effects settle, so the DOM is up-to-date." />

<APICard name="splitProps" type="function" signature="splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]" description="Splits a props object into two parts preserving reactivity. First part has the specified keys, second has the rest." />

<APICard name="mergeProps" type="function" signature="mergeProps<T extends object[]>(...sources: T): MergedProps<T>" description="Merges multiple props objects with later sources overriding earlier ones. Preserves reactivity through lazy property access." />

<APICard name="createUniqueId" type="function" signature="createUniqueId(): string" description="Generates a unique string ID that is stable across server and client renders. Use for ARIA attributes and label-input linking." />

<APICard name="cx" type="function" signature="cx(...args: ClassValue[]): string" description="Utility for composing class names from strings, arrays, objects, or nested combinations. Used internally by the class prop." />

## Type Exports

| Type                           | Description                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ComponentFn<P>`               | `(props: P) => VNodeChild` -- component function type                                                                                   |
| `VNode`                        | Virtual DOM node with type, props, children, and key                                                                                    |
| `VNodeChild`                   | Union type for all renderable values (VNode, string, number, null, boolean, function, array)                                            |
| `Props`                        | Base props interface for elements and components                                                                                        |
| `Ref<T>`                       | Mutable ref container `&#123; current: T \| null &#125;`                                                                                |
| `RefCallback<T>`               | Function ref callback `(el: T \| null) => void` -- called with the element on mount and `null` on unmount                               |
| `RefProp<T>`                   | Union of `Ref<T> \| RefCallback<T>` -- the type accepted by the JSX `ref` prop                                                          |
| `ExtractProps<T>`              | Extracts the props type from a `ComponentFn<P>`, or passes through if already a props object                                            |
| `HigherOrderComponent<HOP, P>` | Typed higher-order component pattern `(component: ComponentFn<P>) => ComponentFn<P & HOP>`                                              |
| `PyreonHTMLAttributes<E>`      | HTML attribute types parameterized by element type (e.g., `PyreonHTMLAttributes<HTMLInputElement>`)                                     |
| `CSSProperties`                | Typed CSS property object for the `style` prop                                                                                          |
| `StyleValue`                   | Union type for style prop values: `string \| CSSProperties \| (() => string \| CSSProperties)`                                          |
| `ClassValue`                   | Union type for the `class` prop: `string \| boolean \| null \| undefined \| ClassValue[] \| Record<string, boolean \| (() => boolean)>` |
| `TargetedEvent<E>`             | Event type where `currentTarget` is typed as `E` (e.g., `TargetedEvent<HTMLInputElement>`)                                              |
