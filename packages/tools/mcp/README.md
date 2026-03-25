# @pyreon/mcp

Model Context Protocol server for AI-assisted Pyreon development. Gives AI coding assistants direct access to Pyreon's API reference, code validation, React-to-Pyreon migration, and project scanning.

## Install

```bash
bun add -d @pyreon/mcp
```

## Quick Start

```bash
bunx @pyreon/mcp    # starts stdio MCP server
```

## IDE Integration

### Claude Code

```json
// .mcp.json (project root)
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

### Windsurf

```json
// .windsurf/mcp.json (same format as Cursor)
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

## Tools

### `get_api` — Look up any Pyreon API

```
get_api({ package: "reactivity", symbol: "signal" })
```

Returns signature, usage example, common mistakes. Covers all `@pyreon/*` packages.

**Example response:**

```
## @pyreon/reactivity — signal

**Signature:**
signal<T>(initialValue: T): Signal<T>

**Usage:**
const count = signal(0)
count()              // read: 0
count.set(1)         // write
count.update(n => n + 1)  // update

**Common mistakes:**
- Using .value instead of calling the signal: count() not count.value
- Forgetting to call signal() when reading in JSX: {count()} not {count}
```

### `validate` — Check code for anti-patterns

```
validate({ code: "import { useState } from 'react'" })
```

Returns diagnostics for React patterns, wrong imports, and common Pyreon mistakes.

### `migrate_react` — Convert React code to Pyreon

```
migrate_react({
  code: `
    import { useState, useEffect } from "react"

    function Timer() {
      const [seconds, setSeconds] = useState(0)

      useEffect(() => {
        const id = setInterval(() => setSeconds(s => s + 1), 1000)
        return () => clearInterval(id)
      }, [])

      return <div className="timer">{seconds}s</div>
    }
  `
})
```

**Response:**

```tsx
import { signal, effect } from "@pyreon/reactivity"

function Timer() {
  const seconds = signal(0)

  effect(() => {
    const id = setInterval(() => seconds.update(s => s + 1), 1000)
    return () => clearInterval(id)
  })

  return <div class="timer">{seconds()}s</div>
}
```

### `diagnose` — Parse error messages

```
diagnose({ error: "TypeError: count is not a function" })
```

**Response:**

```
**Cause:** Signal accessed without calling it — signals are functions.
**Fix:** Call the signal to read its value: count() instead of count.

// Wrong:
<div>{count}</div>

// Right:
<div>{count()}</div>
```

### `get_routes` — List project routes

```
get_routes({})
```

Scans for `createRouter([...])` and `const routes = [...]` patterns.

### `get_components` — List components with props and signals

```
get_components({})
```

Returns component names, file paths, props, and signal usage.

## Pyreon Patterns for AI

These are the key patterns the MCP server teaches AI assistants:

### State management

```tsx
// React                              // Pyreon
const [x, setX] = useState(0)        const x = signal(0)
const val = useMemo(() => a+b, [a,b]) const val = computed(() => a()+b())
useEffect(() => { ... }, [dep])       effect(() => { ... })
```

### JSX differences

```tsx
// React                              // Pyreon
<div className="box" />               <div class="box" />
<label htmlFor="name" />              <label for="name" />
<input onChange={handler} />          <input onInput={handler} />
{condition && <Child />}              <Show when={condition}><Child /></Show>
{items.map(i => <li key={i.id}>)}    <For each={items} by={i => i.id}>{i => <li>}</For>
```

### Component patterns

```tsx
// React: hooks, re-renders entire component
function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// Pyreon: signals, fine-grained DOM updates (no re-render)
function Counter() {
  const count = signal(0)
  return <button onClick={() => count.update(c => c + 1)}>{count()}</button>
}
```

### Refs

```tsx
// React
const ref = useRef<HTMLDivElement>(null)
<div ref={ref} />

// Pyreon: object ref
const ref = { current: null as HTMLDivElement | null }
<div ref={ref} />

// Pyreon: callback ref
<div ref={(el) => { myElement = el }} />
```

### Context

```tsx
// React
const ThemeCtx = React.createContext("light")
<ThemeCtx.Provider value="dark"><App /></ThemeCtx.Provider>
const theme = useContext(ThemeCtx)

// Pyreon
const ThemeCtx = createContext<string>("light")
<ThemeCtx.Provider value="dark"><App /></ThemeCtx.Provider>
const theme = useContext(ThemeCtx)  // same API
```

### Lifecycle

```tsx
// React
useEffect(() => {
  const handler = () => { ... }
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
}, [])

// Pyreon
onMount(() => {
  const handler = () => { ... }
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)  // cleanup
})
```

### Routing

```tsx
// React Router
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/user/:id" element={<User />} />
  </Routes>
</BrowserRouter>

// Pyreon Router
const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/user/:id", component: User },
  ],
})
<RouterProvider router={router}>
  <RouterView />
</RouterProvider>
```

### Lists

```tsx
// React: key on element
{items.map(item => (
  <li key={item.id}>{item.name}</li>
))}

// Pyreon: by prop on For (not key — JSX extracts key specially)
<For each={items} by={item => item.id}>
  {item => <li>{item.name}</li>}
</For>
```

### Lazy loading

```tsx
// React
const Dashboard = React.lazy(() => import("./Dashboard"))
<Suspense fallback={<Loading />}>
  <Dashboard />
</Suspense>

// Pyreon
const Dashboard = lazy(() => import("./Dashboard"))
<Suspense fallback={<Loading />}>
  <Dashboard />
</Suspense>
```

### Islands (partial hydration)

```tsx
// Server: define island
import { island } from "@pyreon/server"
const Counter = island(() => import("./Counter"), {
  name: "Counter",
  hydrate: "visible",  // load | idle | visible | media(...) | never
})

// Use in page (renders static HTML, hydrates on client)
<Counter initial={0} />

// Client: register islands
import { hydrateIslands } from "@pyreon/server/client"
hydrateIslands({
  Counter: () => import("./Counter"),
})
```
