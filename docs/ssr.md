# Server-Side Rendering

`@pyreon/runtime-server` provides `renderToString` and `renderToStream` for server-side rendering. The client uses `hydrateRoot` from `@pyreon/runtime-dom` to attach event listeners without re-building the DOM.

## Installation

```bash
bun add @pyreon/runtime-server    # server only
bun add @pyreon/runtime-dom       # client only
```

## renderToString

Renders a VNode tree synchronously to an HTML string. Signal getters are snapshotted at render time.

```ts
import { renderToString } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"

const html = await renderToString(h(App, null))
// => '<div class="app"><h1>Hello</h1></div>'
```

### Signature

```ts
function renderToString(vnode: VNode): Promise<string>
```

Even though the API is async, the current implementation is synchronous internally. The `Promise` wrapper provides forward compatibility for async components.

## renderToStream

Renders to a `ReadableStream` of HTML chunks. Use this with streaming HTTP responses for faster time-to-first-byte.

```ts
import { renderToStream } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"

// Bun / Node.js (with Web Streams API)
const stream = renderToStream(h(App, null))
return new Response(stream, {
  headers: { "Content-Type": "text/html; charset=utf-8" },
})
```

### Signature

```ts
function renderToStream(vnode: VNode): ReadableStream<string>
```

## hydrateRoot

On the client, `hydrateRoot` attaches Pyreon's reactivity to existing server-rendered HTML without rebuilding the DOM tree.

```ts
import { hydrateRoot } from "@pyreon/runtime-dom"
import { h } from "@pyreon/core"

hydrateRoot(document.getElementById("app")!, h(App, null))
```

### Signature

```ts
function hydrateRoot(container: Element, vnode: VNode): void
```

## Full Example

### Server (Bun / Node.js)

```ts
// server.ts
import { renderToString } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"
import { App } from "./src/App"

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/") {
      const appHtml = await renderToString(h(App, null))

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Pyreon SSR App</title>
</head>
<body>
  <div id="app">${appHtml}</div>
  <script type="module" src="/client.js"></script>
</body>
</html>`

      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    return new Response("Not found", { status: 404 })
  },
})
```

### Client Entry

```ts
// client.ts
import { hydrateRoot } from "@pyreon/runtime-dom"
import { h } from "@pyreon/core"
import { App } from "./src/App"

hydrateRoot(document.getElementById("app")!, h(App, null))
```

### Shared App Component

```tsx
// src/App.tsx
import { signal } from "@pyreon/reactivity"

export function App() {
  const count = signal(0)
  return (
    <div>
      <h1>SSR Counter</h1>
      <button onClick={() => count.update(n => n - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}
```

The server renders the initial HTML with `count = 0`. The client hydrates and attaches click handlers — no re-render needed.

## Streaming with Suspense

When the component tree contains `Suspense` boundaries, `renderToStream` flushes completed sections as they resolve:

```ts
// server.ts
const stream = renderToStream(
  h(Suspense, { fallback: h("p", null, "Loading…") },
    h(App, null)
  )
)
```

Content outside `Suspense` is sent immediately. Lazy component sections are sent as their imports resolve.

## SSR with the Router

Pass the initial path to the router to match server-side:

```ts
// server.ts
import { createRouter } from "@pyreon/router"

const router = createRouter({
  mode: "history",
  routes: [...],
})

// Set initial path from request
router.replace(new URL(req.url).pathname)

const html = await renderToString(
  h(RouterProvider, { router },
    h(App, null)
  )
)
```

## Data Fetching Before Render

Fetch data before calling `renderToString` and pass it as props or store it in a store:

```ts
// server.ts
import { useProductStore } from "./src/stores/products"

// Pre-populate the store
const store = useProductStore()
const products = await api.getProducts()
store.setInitial(products)

const html = await renderToString(h(App, null))
```

On the client, serialize the data into the HTML and re-hydrate the store before calling `hydrateRoot`:

```html
<script id="__PYREON_DATA__" type="application/json">
  {"products": [...]}
</script>
```

```ts
// client.ts
const data = JSON.parse(document.getElementById("__PYREON_DATA__")!.textContent!)
useProductStore().setInitial(data.products)
hydrateRoot(document.getElementById("app")!, h(App, null))
```

## Hydration Limitations

**For lists remount on hydration.** The `For` component cannot reconcile server-rendered `<li>` elements with the client-side keyed list. On hydration, it clears and remounts its output. This does not cause a visible flash for static lists, but it does for lists with animations.

**Reactive conditionals may flash.** If a reactive conditional (`{() => show() ? A : B}`) renders differently on the server (where signals start at their initial value) versus the client (which may have different initial state from cookies or localStorage), you will see a hydration mismatch.

**No streaming Suspense with `renderToString`.** Use `renderToStream` to get Suspense-aware streaming.

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

## Gotchas

**Signal initial values must be serializable for hydration.** If a signal is initialized with a non-serializable value (a function, a DOM node, a class instance), you cannot pass it through the data island pattern.

**`renderToString` does not run `onMount`.** Lifecycle hooks run only on the client. Do not rely on `onMount` for data that must be in the initial HTML.

**Hydration expects the DOM to match exactly.** If the server and client render different HTML (different text, different attributes), Pyreon logs a warning and forces a re-render of the mismatched subtree. Always ensure signal initial values are identical between server and client.
