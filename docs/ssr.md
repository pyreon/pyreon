# Server-Side Rendering

Pyreon supports SSR through two packages:

- `@pyreon/runtime-server` — low-level rendering primitives (`renderToString`, `renderToStream`)
- `@pyreon/server` — high-level framework (`createHandler`, `prerender`, `island`)

## Installation

```bash
# Low-level SSR primitives
bun add @pyreon/runtime-server

# Full SSR framework (includes runtime-server)
bun add @pyreon/server

# Client-side hydration
bun add @pyreon/runtime-dom
```

## Quick Start with createHandler

The fastest way to get SSR running. `createHandler` returns a standard `Request → Response` handler:

```ts
import { createHandler } from "@pyreon/server"
import { App } from "./App"
import { routes } from "./routes"

const handler = createHandler({
  App,
  routes,
  template: await Bun.file("index.html").text(),
})

Bun.serve({ fetch: handler, port: 3000 })
```

The handler automatically:

- Creates a router with the request URL
- Runs route loaders
- Renders the app to an HTML string
- Injects the result into the template
- Returns a `Response` with appropriate headers

### Handler Options

| Option | Type | Description |
| --- | --- | --- |
| `App` | `ComponentFn` | Root application component |
| `routes` | `RouteRecord[]` | Route definitions for the router |
| `template` | `string` | HTML template with `<!--app-->` placeholder |
| `middleware` | `Middleware[]` | Request middleware chain |

### Middleware

```ts
import type { Middleware } from "@pyreon/server"

const logger: Middleware = async (ctx, next) => {
  console.log(`${ctx.request.method} ${ctx.url.pathname}`)
  const response = await next()
  console.log(`→ ${response.status}`)
  return response
}

const handler = createHandler({
  App, routes,
  middleware: [logger],
})
```

## renderToString

Low-level API that renders a VNode tree to an HTML string.

```ts
import { renderToString } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"

const html = await renderToString(h(App, null))
// => '<div class="app"><h1>Hello</h1></div>'
```

Signal getters are snapshotted at render time. The returned `Promise` provides forward compatibility for async components.

## renderToStream

Renders to a `ReadableStream` of HTML chunks for faster time-to-first-byte:

```ts
import { renderToStream } from "@pyreon/runtime-server"

const stream = renderToStream(h(App, null))
return new Response(stream, {
  headers: { "Content-Type": "text/html; charset=utf-8" },
})
```

When the component tree contains `Suspense` boundaries, `renderToStream` flushes completed sections as they resolve. Content outside `Suspense` is sent immediately.

## hydrateRoot

On the client, `hydrateRoot` attaches Pyreon's reactivity to existing server-rendered HTML without rebuilding the DOM tree:

```ts
import { hydrateRoot } from "@pyreon/runtime-dom"

hydrateRoot(document.getElementById("app")!, <App />)
```

## Static Site Generation (SSG)

Pre-render pages to static HTML files:

```ts
import { createHandler, prerender } from "@pyreon/server"

const handler = createHandler({ App, routes })
const result = await prerender({
  handler,
  paths: ["/", "/about", "/blog", "/blog/hello-world"],
  outDir: "dist",
})
console.log(`Generated ${result.pages} pages in ${result.elapsed}ms`)
```

### Prerender Options

| Option | Type | Description |
| --- | --- | --- |
| `handler` | `RequestHandler` | The SSR handler from `createHandler` |
| `paths` | `string[]` | URL paths to pre-render |
| `outDir` | `string` | Output directory for HTML files |

## Island Architecture

See the dedicated [Islands guide](./islands.md) for full documentation.

Islands let you render mostly-static pages with small interactive components that hydrate independently:

```ts
// Server
import { island } from "@pyreon/server"

const Counter = island(() => import("./Counter"), {
  name: "Counter",
  hydrate: "visible",  // load | idle | visible | media(query) | never
})
```

```ts
// Client entry
import { hydrateIslands } from "@pyreon/server/client"

const cleanup = hydrateIslands({
  Counter: () => import("./Counter"),
  Search: () => import("./Search"),
})
```

## Full SSR Example

### Server

```ts
// server.ts
import { createHandler } from "@pyreon/server"
import { App } from "./src/App"
import { routes } from "./src/routes"

const template = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Pyreon SSR App</title>
</head>
<body>
  <div id="app"><!--app--></div>
  <script type="module" src="/client.js"></script>
</body>
</html>`

const handler = createHandler({ App, routes, template })
Bun.serve({ fetch: handler, port: 3000 })
```

### Client Entry

```ts
// client.ts
import { startClient } from "@pyreon/server/client"
import { App } from "./src/App"
import { routes } from "./src/routes"

startClient({ App, routes, container: "#app" })
```

### Manual SSR (without createHandler)

```ts
import { renderToString } from "@pyreon/runtime-server"
import { createRouter, RouterProvider } from "@pyreon/router"
import { h } from "@pyreon/core"

Bun.serve({
  port: 3000,
  async fetch(req) {
    const router = createRouter({
      routes: [...],
      url: req.url,
    })

    const appHtml = await renderToString(
      h(RouterProvider, { router }, h(App, null))
    )

    return new Response(`<!DOCTYPE html>
<html>
<body>
  <div id="app">${appHtml}</div>
  <script type="module" src="/client.js"></script>
</body>
</html>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  },
})
```

## SSR with Data Fetching

### Using Route Loaders

Route loaders run automatically during SSR:

```ts
{
  path: "/user/:id",
  component: UserPage,
  loader: async ({ params, signal }) => {
    const res = await fetch(`/api/users/${params.id}`, { signal })
    return res.json()
  },
}
```

Loader data is available in the component via `useLoaderData()`. For client hydration, serialize and hydrate loader data:

```ts
import { serializeLoaderData, hydrateLoaderData } from "@pyreon/router"
```

### Using Stores

Pre-populate stores before rendering:

```ts
const store = useProductStore()
store.setProducts(await api.getProducts())

const html = await renderToString(h(App, null))
```

Serialize store data into the HTML for client hydration:

```html
<script id="__PYREON_DATA__" type="application/json">
  {"products": [...]}
</script>
```

### Using Head Tags

```ts
import { renderWithHead } from "@pyreon/head"

const { html, head } = renderWithHead(h(App, null))
// Inject `head` into the <head> section of your HTML template
```

## Concurrent SSR Isolation

Each SSR request gets its own isolated context and store registry via `AsyncLocalStorage`:

```ts
import { runWithRequestContext } from "@pyreon/runtime-server"
import { setStoreRegistryProvider } from "@pyreon/store"

// Stores are automatically isolated per request
setStoreRegistryProvider(() => als.getStore() ?? new Map())
```

This ensures that concurrent requests do not share reactive state.

## Streaming with Suspense

```ts
const stream = renderToStream(
  h(Suspense, { fallback: h("p", null, "Loading...") },
    h(App, null)
  )
)
```

Content outside `Suspense` is sent immediately. Lazy component sections are sent as their imports resolve. The client then hydrates each section independently.

## Gotchas

**Server-only code must not reference DOM APIs.** `document`, `window`, and `navigator` do not exist on the server. Guard with `typeof document !== "undefined"` or use `onMount` which only runs on the client.

```tsx
function Analytics() {
  onMount(() => {
    // Safe — only runs on client
    window.gtag("event", "page_view")
  })
  return null
}
```

**`renderToString` does not run `onMount`.** Lifecycle hooks run only on the client.

**Hydration expects the DOM to match.** If the server and client render different HTML, Pyreon logs a warning and forces a re-render of the mismatched subtree.

**Signal initial values must be serializable.** Non-serializable values (functions, DOM nodes) cannot be passed through the data island pattern.

**For lists remount on hydration.** The `For` component clears and remounts its output during hydration. No visible flash for static lists, but animations may replay.

**No streaming Suspense with `renderToString`.** Use `renderToStream` for Suspense-aware streaming.
