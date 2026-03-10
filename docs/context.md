# Context

Pyreon's context system provides dependency injection for component trees. It lets ancestor components provide values that any descendant can read without passing props through every intermediate layer.

## API Reference

| Function | Signature | Description |
|---|---|---|
| `createContext` | `createContext<T>(defaultValue?: T): Context<T>` | Creates a context object with an optional default value |
| `useContext` | `useContext<T>(ctx: Context<T>): T` | Reads the nearest provided value, or the default |
| `withContext` | `withContext<T>(ctx: Context<T>, value: T, fn: () => R): R` | Provides a value programmatically (without JSX) |

## Creating a Context

```ts
import { createContext, useContext } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

interface Theme {
  primary: string
  background: string
}

const ThemeContext = createContext<Theme>({
  primary: "#0070f3",
  background: "#ffffff",
})
```

`createContext` accepts an optional default value. Components that call `useContext` without a matching provider will receive this default. If you omit the default, the type is `T | undefined` and you must handle the undefined case.

## Providing a Value

### With JSX (Context.Provider)

```tsx
function App() {
  const theme: Theme = {
    primary: "#6200ee",
    background: "#121212",
  }

  return (
    <ThemeContext.Provider value={theme}>
      <Layout />
    </ThemeContext.Provider>
  )
}
```

### With withContext (without JSX)

```ts
import { withContext, h } from "@pyreon/core"

withContext(ThemeContext, theme, () => {
  // Any useContext(ThemeContext) call inside this fn receives `theme`
  return h(Layout, null)
})
```

`withContext` is useful in render functions, SSR, or test utilities where JSX is not convenient.

## Reading a Value

```tsx
function Button({ label }: { label: string }) {
  const theme = useContext(ThemeContext)

  return (
    <button
      style={`background:${theme.primary};color:white`}
    >
      {label}
    </button>
  )
}
```

## Reactive Context Values

To make a context value reactive, store a signal (or object of signals) in the context.

```tsx
import { createContext, useContext } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"

interface AuthContext {
  userId: Signal<string | null>
  logout: () => void
}

const AuthCtx = createContext<AuthContext | null>(null)

function AuthProvider({ children }: { children: VNodeChild }) {
  const userId = signal<string | null>(null)

  const logout = () => userId.set(null)

  const login = (id: string) => userId.set(id)

  return (
    <AuthCtx.Provider value={{ userId, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

// In any descendant:
function Header() {
  const auth = useContext(AuthCtx)
  if (!auth) return null

  return (
    <nav>
      {() => auth.userId()
        ? <button onClick={auth.logout}>Log out</button>
        : <a href="/login">Log in</a>
      }
    </nav>
  )
}
```

Passing the signal itself (not its value) ensures that descendants react to changes. If you passed `userId()` (the value), it would be read once when the provider mounts.

## Multiple Providers

Context providers can be nested. The nearest ancestor provider wins.

```tsx
const LocaleCtx = createContext("en")

function App() {
  return (
    <LocaleCtx.Provider value="en">
      <Section />
      <LocaleCtx.Provider value="fr">
        <FrenchSection />  {/* reads "fr" */}
      </LocaleCtx.Provider>
    </LocaleCtx.Provider>
  )
}

function Section() {
  const locale = useContext(LocaleCtx)  // "en"
  return <p>Locale: {locale}</p>
}

function FrenchSection() {
  const locale = useContext(LocaleCtx)  // "fr"
  return <p>Locale: {locale}</p>
}
```

## Context with Default Value

When a default value is provided, `useContext` never returns `undefined`. This is useful for contexts with clear defaults where providing a provider is optional.

```tsx
interface BreakpointCtx {
  mobile: boolean
  tablet: boolean
}

const BreakpointContext = createContext<BreakpointCtx>({
  mobile: false,
  tablet: false,
})

// Works even without a provider
function Card() {
  const { mobile } = useContext(BreakpointContext)
  return <div class={mobile ? "card-full" : "card"}>{/* ... */}</div>
}
```

## Pattern: Service Locator

Use context to inject services (API clients, loggers, etc.) for testing and multi-environment support.

```tsx
interface ApiClient {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body: unknown): Promise<T>
}

const ApiContext = createContext<ApiClient | null>(null)

// Production
function App() {
  const api: ApiClient = {
    get: url => fetch(url).then(r => r.json()),
    post: (url, body) =>
      fetch(url, { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
  }
  return <ApiContext.Provider value={api}><Routes /></ApiContext.Provider>
}

// Test
function renderWithMockApi(ui: VNode, api: ApiClient) {
  return withContext(ApiContext, api, () => mount(document.body, ui))
}
```

## Gotchas

**`useContext` must be called during component setup**, not inside effects, event handlers, or `onMount`.

```tsx
// Wrong — called inside onMount
function Bad() {
  onMount(() => {
    const theme = useContext(ThemeContext)  // undefined behavior
  })
  return <div />
}

// Correct — called during setup
function Good() {
  const theme = useContext(ThemeContext)
  onMount(() => {
    console.log(theme.primary)  // fine — captured from setup
  })
  return <div />
}
```

**Context values are not reactive by default.** If you change the value object passed to a provider, descendants that already read it will not update. Use signals inside the context value for reactivity.

**A missing provider with no default returns `undefined`.** If you call `createContext<T>()` without a default and a component calls `useContext` without a matching provider, the value is `undefined`. Use TypeScript's type system (`createContext<T | null>(null)`) to make this explicit.
