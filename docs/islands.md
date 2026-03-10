# Island Architecture

Pyreon's island architecture lets you render mostly-static HTML on the server while selectively hydrating interactive components on the client. Only the JavaScript for interactive "islands" is shipped to the browser — the rest stays as static HTML.

## When to Use Islands

Islands are ideal for content-heavy pages with small interactive sections:

- Marketing sites with a few interactive widgets
- Blog posts with comment sections or search
- E-commerce product pages with an "Add to Cart" button
- Documentation sites with interactive code playgrounds

For fully interactive SPAs, use standard SSR + hydration instead.

## Installation

```bash
bun add @pyreon/server
```

## Server Setup

### Defining Islands

Use `island()` to wrap a component that should be hydrated on the client:

```tsx
import { island } from "@pyreon/server"

const Counter = island(() => import("./Counter"), {
  name: "Counter",
  hydrate: "visible",
})

const Search = island(() => import("./Search"), {
  name: "Search",
  hydrate: "idle",
})
```

### Island Options

| Option | Type | Description |
| --- | --- | --- |
| `name` | `string` | Unique identifier for the island (must match the client registry key) |
| `hydrate` | `HydrationStrategy` | When to hydrate this island |

### Hydration Strategies

| Strategy | When it hydrates | Use for |
| --- | --- | --- |
| `"load"` | Immediately on page load | Critical interactive elements (nav, auth) |
| `"idle"` | When the browser is idle (`requestIdleCallback`) | Non-critical interactivity (analytics, tooltips) |
| `"visible"` | When the island scrolls into the viewport (`IntersectionObserver`) | Below-the-fold content (comments, related items) |
| `"media(query)"` | When a CSS media query matches (e.g., `"media(min-width: 768px)"`) | Desktop-only widgets |
| `"never"` | Never hydrated on the client | Purely server-rendered content |

### Using Islands in Pages

Islands are used as regular components in your server-rendered pages:

```tsx
function ProductPage({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>

      {/* This section hydrates when visible */}
      <Counter initial={0} />

      {/* This hydrates immediately */}
      <Search placeholder="Search products..." />

      {/* Static — never sent to client */}
      <footer>© 2024 My Store</footer>
    </div>
  )
}
```

## Client Setup

### hydrateIslands

On the client, call `hydrateIslands` with a registry mapping island names to their loaders:

```ts
// entry-client.ts
import { hydrateIslands } from "@pyreon/server/client"

const cleanup = hydrateIslands({
  Counter: () => import("./Counter"),
  Search: () => import("./Search"),
})
```

`hydrateIslands` returns a cleanup function that disconnects all observers and cancels pending hydrations.

### How It Works

1. The server renders each island as a `<nova-island>` custom element with serialized props and hydration metadata.
2. On the client, `hydrateIslands` scans the DOM for `<nova-island>` elements.
3. Each island is hydrated according to its strategy — immediately, on idle, when visible, or when a media query matches.
4. The island's component is imported, mounted, and props are deserialized from the element's data attributes.

## Full Example

### Server

```ts
// server.ts
import { createHandler, island } from "@pyreon/server"

const Counter = island(() => import("./Counter"), {
  name: "Counter",
  hydrate: "visible",
})

function App() {
  return (
    <div>
      <h1>My Static Page</h1>
      <p>This HTML is static — no JS needed.</p>
      <Counter initial={0} label="Clicks" />
    </div>
  )
}

const handler = createHandler({ App, routes: [{ path: "/", component: App }] })
Bun.serve({ fetch: handler, port: 3000 })
```

### Client

```ts
// entry-client.ts
import { hydrateIslands } from "@pyreon/server/client"

hydrateIslands({
  Counter: () => import("./Counter"),
})
```

### Island Component

```tsx
// Counter.tsx
import { signal } from "@pyreon/reactivity"

export default function Counter({ initial = 0, label = "Count" }) {
  const count = signal(initial)
  return (
    <div>
      <span>{label}: {count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}
```

## Mixing Islands with Full Hydration

You can use `startClient` for full-app hydration on some pages and `hydrateIslands` for island-only pages:

```ts
// entry-client.ts
const isIslandPage = !document.getElementById("app")

if (isIslandPage) {
  hydrateIslands({ Counter: () => import("./Counter") })
} else {
  startClient({ App, routes, container: "#app" })
}
```

## Cleanup

`hydrateIslands` returns a cleanup function. Call it when navigating away (in an SPA) or on unmount:

```ts
const cleanup = hydrateIslands({ ... })

// Later:
cleanup()  // disconnects IntersectionObservers, cancels idle callbacks, removes event listeners
```

## Gotchas

**Island names must match between server and client.** The `name` option in `island()` must exactly match the key in the `hydrateIslands` registry.

**Props must be JSON-serializable.** Island props are serialized to JSON for transport. Functions, DOM nodes, and class instances cannot be island props.

**Islands are independent.** Each island hydrates its own subtree. They do not share reactive state unless you use a global store (`@pyreon/store`).

**No context inheritance.** Since islands hydrate independently, they do not inherit context from the server-rendered parent tree. Use stores or explicit props instead.

**Visible strategy needs viewport.** The `"visible"` strategy uses `IntersectionObserver`. If the island is above the fold and already visible on load, it hydrates immediately.
