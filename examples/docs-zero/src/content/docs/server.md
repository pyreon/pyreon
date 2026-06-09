---
title: '@pyreon/server'
description: SSR handler, static site generation, island architecture, and middleware for Pyreon applications.
---

`@pyreon/server` is the full-stack application layer for Pyreon. It provides a Web-standard SSR request handler, a static site generator, an island architecture for partial hydration, and a middleware pipeline — all built on top of `@pyreon/runtime-server`, `@pyreon/router`, and `@pyreon/head`.

## Overview

The package has two entry points:

| Entry  | Import                  | Environment                         |
| ------ | ----------------------- | ----------------------------------- |
| Server | `@pyreon/server`        | Node, Bun, Deno, Cloudflare Workers |
| Client | `@pyreon/server/client` | Browser                             |

**Server exports:** `createHandler`, `prerender`, `island`, `processTemplate`, `compileTemplate`, `processCompiledTemplate`, `buildScripts`, `buildScriptsFast`, `DEFAULT_TEMPLATE`

**Client exports:** `startClient`, `hydrateIslands`

<PackageBadge name="@pyreon/server" href="/docs/server" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/server
```

```bash [bun]
bun add @pyreon/server
```

```bash [pnpm]
pnpm add @pyreon/server
```

```bash [yarn]
yarn add @pyreon/server
```

:::

`@pyreon/server` depends on `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/runtime-dom`, `@pyreon/runtime-server`, `@pyreon/router`, and `@pyreon/head` — all pulled automatically from the workspace.

---

## SSR Handler — `createHandler`

`createHandler` produces a Web-standard `(Request) => Promise<Response>` function. It works with any server that speaks the Web Fetch API: **Bun.serve**, **Deno.serve**, **Cloudflare Workers**, and Express/Fastify via adapters.

### HandlerOptions

```ts
interface HandlerOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions */
  routes: RouteRecord[]
  /**
   * HTML template with comment placeholders:
   *   <!--pyreon-head-->     — head tags (title, meta, link, etc.)
   *   <!--pyreon-app-->      — rendered app HTML
   *   <!--pyreon-scripts-->  — client entry script + inline loader data
   *
   * Defaults to DEFAULT_TEMPLATE (a minimal HTML5 shell).
   */
  template?: string
  /** Path to the client entry module (default: "/src/entry-client.ts") */
  clientEntry?: string
  /** Middleware chain — runs before rendering */
  middleware?: Middleware[]
  /**
   * Rendering mode:
   *   "string" — full renderToString, complete HTML in one response (default)
   *   "stream" — progressive streaming via renderToStream (Suspense out-of-order)
   */
  mode?: 'string' | 'stream'
}
```

### Request lifecycle

Every incoming request goes through these steps:

1. **Middleware pipeline** — each middleware runs in order. Any middleware can short-circuit by returning a `Response` (for redirects, auth checks, etc.).
2. **Router creation** — a per-request `createRouter` instance is created with the matched URL.
3. **Loader prefetch** — route loaders run in parallel so data is ready before rendering.
4. **Render** — the app component tree is rendered to HTML (string or stream mode).
5. **Head collection** — `@pyreon/head` collects title, meta, and link tags emitted during render.
6. **Template injection** — head tags, app HTML, and scripts are injected into the HTML template.
7. **Response** — a `Response` with `text/html` content type is returned.

### Basic example — Bun

```ts title="server.ts"
import { createHandler } from '@pyreon/server'
import { App } from './src/App'
import { routes } from './src/routes'

const handler = createHandler({
  App,
  routes,
  template: await Bun.file('index.html').text(),
})

Bun.serve({ fetch: handler, port: 3000 })
console.log('Listening on http://localhost:3000')
```

### Custom template

The default template is a minimal HTML5 document. For production, provide your own:

```html title="index.html"
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/assets/style.css" />
    <!--pyreon-head-->
  </head>
  <body>
    <div id="app"><!--pyreon-app--></div>
    <!--pyreon-scripts-->
  </body>
</html>
```

The three comment placeholders are required:

| Placeholder             | Replaced with                                                    |
| ----------------------- | ---------------------------------------------------------------- |
| `<!--pyreon-head-->`    | Collected `<title>`, `<meta>`, `<link>` tags from `@pyreon/head` |
| `<!--pyreon-app-->`     | Rendered application HTML                                        |
| `<!--pyreon-scripts-->` | Client entry `<script>` tag + inline loader data                 |

### Custom client entry

By default the handler injects `<script type="module" src="/src/entry-client.ts">`. Override it:

```ts
const handler = createHandler({
  App,
  routes,
  clientEntry: '/dist/client.js',
})
```

### Streaming mode

Enable progressive streaming for large pages with Suspense boundaries:

```ts
const handler = createHandler({
  App,
  routes,
  mode: 'stream',
})
```

In streaming mode:

- The HTML shell (everything before `<!--pyreon-app-->`) is flushed immediately.
- App content streams progressively as components resolve.
- Suspense boundaries resolve out-of-order via inline `<template>` elements and swap scripts.
- The closing shell (after `<!--pyreon-app-->`) is sent after all content is flushed.

This gives the browser a head start on parsing CSS and fetching resources while the app renders.

### Error handling

If rendering throws, the handler catches the error, logs it to `console.error`, and returns a `500 Internal Server Error` plain-text response. In streaming mode, since the status code is already sent (200), an inline error script is emitted instead.

```ts
// The handler never throws — it always returns a Response
const res = await handler(new Request('http://localhost/broken'))
// res.status === 500
// await res.text() === "Internal Server Error"
```

---

## Middleware

Middleware functions run before rendering and can inspect/modify the request context or short-circuit with a `Response`.

### Types

```ts
interface MiddlewareContext {
  /** The incoming request */
  req: Request
  /** Parsed URL */
  url: URL
  /** Pathname + search (passed to router) */
  path: string
  /** Response headers — middleware can set custom headers */
  headers: Headers
  /** Arbitrary per-request data shared between middleware and components */
  locals: Record<string, unknown>
}

type Middleware = (ctx: MiddlewareContext) => Response | void | Promise<Response | void>
```

### Short-circuiting

Return a `Response` to stop the middleware chain and skip rendering entirely:

```ts
const authMiddleware: Middleware = async (ctx) => {
  const token = ctx.req.headers.get('Authorization')
  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }
  ctx.locals.user = await verifyToken(token)
}
```

### Setting headers

Middleware can set response headers via `ctx.headers`. These are included in the final response:

```ts
const cacheMiddleware: Middleware = (ctx) => {
  if (ctx.path.startsWith('/static/')) {
    ctx.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    ctx.headers.set('Cache-Control', 'no-cache')
  }
}
```

### Redirects

```ts
const trailingSlashMiddleware: Middleware = (ctx) => {
  if (ctx.path !== '/' && ctx.path.endsWith('/')) {
    const target = ctx.path.slice(0, -1) + ctx.url.search
    return Response.redirect(new URL(target, ctx.url.origin).href, 301)
  }
}
```

### Sharing data via locals

`ctx.locals` is an untyped bag for passing data from middleware to components. The data is available for the lifetime of the request:

```ts
const timingMiddleware: Middleware = (ctx) => {
  ctx.locals.requestStart = performance.now()
}

const geoMiddleware: Middleware = (ctx) => {
  ctx.locals.country = ctx.req.headers.get('CF-IPCountry') ?? 'unknown'
}
```

### Composing middleware

Middleware runs in array order. The first to return a `Response` wins:

```ts
const handler = createHandler({
  App,
  routes,
  middleware: [
    corsMiddleware, // 1. CORS headers
    rateLimitMiddleware, // 2. Rate limiting
    authMiddleware, // 3. Authentication
    cacheMiddleware, // 4. Cache headers
  ],
})
```

### Static file middleware example

```ts
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const staticMiddleware: Middleware = async (ctx) => {
  const filePath = join('public', ctx.path)
  if (existsSync(filePath)) {
    const ext = ctx.path.slice(ctx.path.lastIndexOf('.'))
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
    const body = await readFile(filePath)
    return new Response(body, {
      headers: { 'Content-Type': contentType },
    })
  }
}
```

---

## Static Site Generation — `prerender`

`prerender` takes an SSR handler and a list of paths, renders each one, and writes the HTML to disk.

### PrerenderOptions

```ts
interface PrerenderOptions {
  /** SSR handler created by createHandler() */
  handler: (req: Request) => Promise<Response>
  /** Routes to pre-render — array of URL paths or async function that returns them */
  paths: string[] | (() => string[] | Promise<string[]>)
  /** Output directory for the generated HTML files */
  outDir: string
  /** Origin for constructing full URLs (default: "http://localhost") */
  origin?: string
  /**
   * Called after each page is rendered.
   * Return false to skip writing this page.
   */
  onPage?: (path: string, html: string) => void | boolean | Promise<void | boolean>
}
```

### PrerenderResult

```ts
interface PrerenderResult {
  /** Number of pages generated */
  pages: number
  /** Paths that failed to render */
  errors: Array<{ path: string; error: unknown }>
  /** Total elapsed time in milliseconds */
  elapsed: number
}
```

### File output mapping

| Path          | Output file                                     |
| ------------- | ----------------------------------------------- |
| `/`           | `outDir/index.html`                             |
| `/about`      | `outDir/about/index.html`                       |
| `/blog/hello` | `outDir/blog/hello/index.html`                  |
| `/feed.xml`   | `outDir/feed.xml` (if path ends with extension) |

### Basic SSG build script

```ts title="ssg.ts"
import { createHandler, prerender } from '@pyreon/server'
import { App } from './src/App'
import { routes } from './src/routes'

const handler = createHandler({ App, routes })

const result = await prerender({
  handler,
  paths: ['/', '/about', '/blog', '/contact'],
  outDir: 'dist',
})

console.log(`Generated ${result.pages} pages in ${result.elapsed}ms`)
if (result.errors.length > 0) {
  console.error('Errors:', result.errors)
  process.exit(1)
}
```

### Dynamic paths from a CMS

The `paths` option accepts an async function for dynamic route discovery:

```ts title="ssg.ts"
import { createHandler, prerender } from '@pyreon/server'
import { App } from './src/App'
import { routes } from './src/routes'

const handler = createHandler({ App, routes })

const result = await prerender({
  handler,
  paths: async () => {
    const posts = await fetch('https://cms.example.com/api/posts').then((r) => r.json())

    return ['/', '/about', ...posts.map((p: { slug: string }) => `/blog/${p.slug}`)]
  },
  outDir: 'dist',
})
```

### Progress tracking with onPage

Use the `onPage` callback for progress logging, HTML post-processing, or conditional skipping:

```ts
const result = await prerender({
  handler,
  paths: allPaths,
  outDir: 'dist',
  onPage: (path, html) => {
    console.log(`  ✓ ${path} (${html.length} bytes)`)
    // Return false to skip writing
    if (html.includes('<!-- draft -->')) return false
  },
})
```

### Concurrency

`prerender` processes paths in batches of 10 concurrently. This balances throughput with memory usage — each path creates a full SSR render context.

---

## Island Architecture — `island`

Pyreon's island architecture (partial hydration) has its own dedicated page covering the six hydration strategies, the prefetch hint, the auto-registry, and the static + runtime audits.

→ **[Read the Island Architecture guide](/docs/island-architecture)**

The short version: `island(loader, { name, hydrate })` wraps an async component import and returns a `ComponentFn` that renders inside a `<pyreon-island>` custom element with serialized props + the hydration strategy as data attributes. Six strategies (`load` / `idle` / `visible` / `interaction` / `media(...)` / `never`), plus a `prefetch` hint that pre-warms the chunk before deferred-hydration triggers fire. Auto-discovered registry under `@pyreon/vite-plugin` (`hydrateIslandsAuto()`) eliminates the manual sync between `island()` declarations and the client registry. Project-wide audit at `pyreon doctor --check-islands` + MCP `audit_islands` tool catches duplicate names, dead islands, registry drift, nested islands, and never-with-registry foot-guns at build time.


---

## Client-Side Hydration

The `@pyreon/server/client` entry provides two functions for client-side hydration.

### `startClient` — Full app hydration

For traditional SSR where the entire app is interactive:

```ts title="src/entry-client.ts"
import { startClient } from '@pyreon/server/client'
import { App } from './App'
import { routes } from './routes'

const cleanup = startClient({ App, routes })
```

#### StartClientOptions

```ts
interface StartClientOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions (same as server) */
  routes: RouteRecord[]
  /** CSS selector or element for the app container (default: "#app") */
  container?: string | Element
}
```

`startClient` handles:

1. **Router creation** — creates a history-mode router for client-side navigation.
2. **Loader data hydration** — reads `window.__PYREON_LOADER_DATA__` injected by SSR to avoid re-fetching data on initial render.
3. **Hydration or mount** — if the container has SSR content, it hydrates; otherwise it performs a fresh mount.
4. **Cleanup** — returns a function that unmounts the app.

#### Custom container

```ts
startClient({
  App,
  routes,
  container: '#root', // CSS selector
})

// Or pass an element directly
startClient({
  App,
  routes,
  container: document.getElementById('root')!,
})
```

#### Loader data hydration

When the server renders a page with route loaders, the loader results are serialized into `window.__PYREON_LOADER_DATA__`. The client reads this data and hydrates the router's loader cache, so the initial render uses server data without an extra fetch:

```ts
// Server: route with loader
const routes = [
  {
    path: '/users/:id',
    component: UserPage,
    loader: async ({ params }) => {
      const user = await db.users.findById(params.id)
      return { user }
    },
  },
]

// SSR injects into HTML:
// <script>window.__PYREON_LOADER_DATA__={"users/42":{"user":{...}}}</script>

// Client: startClient reads __PYREON_LOADER_DATA__ automatically
startClient({ App, routes })
```

### `hydrateIslands` — Partial hydration (manual registry)

For island architecture where only specific components are interactive:

```ts title="src/entry-client.ts"
import { hydrateIslands } from '@pyreon/server/client'

const cleanup = hydrateIslands({
  Counter: () => import('./components/Counter'),
  SearchBar: () => import('./components/SearchBar'),
  Comments: () => import('./components/Comments'),
})
```

The registry keys must match the `name` in the server-side `island()` calls.

`hydrateIslands`:

1. Queries all `<pyreon-island>` elements in the DOM.
2. For each element, looks up the component loader in the registry by `data-component`.
3. Respects the `data-hydrate` strategy (load, idle, visible, **interaction**, media, never).
4. Deserializes `data-props` and hydrates the component in place.
5. Returns a cleanup function that disconnects any pending observers/listeners.

Only components actually present in the HTML are loaded — if a page doesn't use `SearchBar`, its JavaScript is never fetched.

### `hydrateIslandsAuto` — Auto-discovered registry (preferred)

When using `@pyreon/vite-plugin` (`pyreon({ islands: true })` is the default), the plugin auto-scans the source tree for every `island()` declaration and emits a virtual module containing the registry. Use `hydrateIslandsAuto(registry)` to consume it without writing the registry by hand:

```ts title="src/entry-client.ts"
import { hydrateIslandsAuto } from '@pyreon/server/client'
import islandsRegistry from 'virtual:pyreon/islands-registry'

hydrateIslandsAuto(islandsRegistry)
```

This eliminates the manual sync between every `island()` declaration and the client registry — typo / forgotten entry / registry drift was the #1 author foot-gun before auto-registry shipped. Reference: `examples/islands-showcase`.

`hydrate: 'never'` islands are deliberately omitted from the auto-registry so their components stay out of the client bundle. Don't pair `hydrate: 'never'` with a manual `hydrateIslands({ X })` entry — the lint rule `pyreon/island-never-with-registry-entry` flags this in the same file; the project-wide `pyreon doctor --check-islands` audit catches the cross-file shape.

### `interaction` strategy + click replay

`hydrate: 'interaction'` defers hydration until first user interaction (`focus` / `click` / `pointerenter` / `touchstart` by default). Customize via `'interaction(<events>)'`. Click events are **replayed** on the equivalent live element post-hydration so the user's first click both wakes the island AND fires the action — closes the "user clicks but nothing happens until they click again" UX trap. The replay path uses `data-testid` when present, falling back to a tag + child-index walk relative to the island root.

Pair with `prefetch: 'idle' | 'visible'` to pre-warm the chunk before the trigger fires:

```ts
// Server side:
island(() => import('./components/MobileMenu'), {
  name: 'MobileMenu',
  hydrate: 'interaction',
  prefetch: 'idle',          // chunk fetched during browser idle
})
```

Suppressed (no `data-prefetch` attribute) when `hydrate: 'load'` (loader runs synchronously) or `hydrate: 'never'` (defeats zero-JS).

### Island perf counters

When `@pyreon/perf-harness` is installed, the server-side island machinery emits 7 counters under the `island.*` namespace:

| Counter                  | Meaning                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `island.scheduled`       | Per-island hydration scheduled (idle / visible / etc.)      |
| `island.hydrated`        | Completed hydrations                                        |
| `island.skipped.never`   | Skipped — `hydrate: 'never'` (zero-JS)                      |
| `island.skipped.nested`  | Skipped — nested island (outer hydrates first, swaps DOM)   |
| `island.skipped.no-loader` | Skipped — registry mismatch (loader not found)            |
| `island.error`           | Hydration error (also surfaces via `data-island-error`)     |
| `island.prefetch`        | Prefetch hint fired (idle / visible)                        |

`scheduled - hydrated` at steady state = islands still waiting on a deferred trigger; `skipped.no-loader` should be zero (registry drift); `error` should be zero (pair with `data-island-error="invalid-props"|"hydration-failed"` on the failing element to diagnose).

---

## HTML Template Utilities

These lower-level utilities are exported for advanced use cases (custom renderers, build tools, etc.).

### `DEFAULT_TEMPLATE`

A minimal HTML5 template with all three placeholders:

```ts
import { DEFAULT_TEMPLATE } from '@pyreon/server'

console.log(DEFAULT_TEMPLATE)
// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <!--pyreon-head-->
// </head>
// <body>
//   <div id="app"><!--pyreon-app--></div>
//   <!--pyreon-scripts-->
// </body>
// </html>
```

### `processTemplate`

Replaces the three comment placeholders in an HTML template:

```ts
import { processTemplate } from '@pyreon/server'

const html = processTemplate(template, {
  head: '<title>My Page</title><meta name="description" content="...">',
  app: '<div><h1>Hello</h1></div>',
  scripts: '<script type="module" src="/client.js"></script>',
})
```

#### TemplateData

```ts
interface TemplateData {
  head: string
  app: string
  scripts: string
}
```

### `buildScripts`

Builds the script tags for client hydration:

```ts
import { buildScripts } from '@pyreon/server'

const scripts = buildScripts('/client.js', { users: [{ id: 1 }] })
// <script>window.__PYREON_LOADER_DATA__={"users":[{"id":1}]}</script>
// <script type="module" src="/client.js"></script>
```

If no loader data is present (empty object), only the module script is emitted. The function also escapes `</script>` sequences inside the JSON to prevent XSS via premature tag closing.

### `compileTemplate`

Pre-split a template into parts at initialization time for faster per-request processing. This avoids repeated string scanning on every request — **up to 17x faster** than `processTemplate` on realistic templates (1KB+).

```ts
import { compileTemplate, processCompiledTemplate } from '@pyreon/server'

// Once at startup:
const compiled = compileTemplate(template)

// Per request (fast concatenation, no scanning):
const html = processCompiledTemplate(compiled, {
  head: headTags,
  app: appHtml,
  scripts: scriptTags,
})
```

#### CompiledTemplate

```ts
interface CompiledTemplate {
  parts: [string, string, string, string]
}
```

The four parts correspond to: before `<!--pyreon-head-->`, between head and app, between app and scripts, and after `<!--pyreon-scripts-->`.

Throws if the template does not contain `<!--pyreon-app-->`.

### `buildScriptsFast`

A pre-optimized variant of `buildScripts` that accepts a pre-built client entry tag string instead of a path:

```ts
import { buildClientEntryTag, buildScriptsFast } from '@pyreon/server'

// Once at startup:
const clientEntryTag = buildClientEntryTag('/client.js')

// Per request:
const scripts = buildScriptsFast(clientEntryTag, loaderData)
```

This avoids reconstructing the `<script type="module" src="...">` tag on every request. Used internally by `createHandler`.

> **Note:** `createHandler` uses `compileTemplate` and `buildScriptsFast` internally. You only need these APIs when building custom rendering pipelines.

---

## Full Example — SSR Application

### Project structure

```
my-app/
├── index.html
├── src/
│   ├── App.tsx
│   ├── routes.ts
│   ├── entry-client.ts
│   ├── server.ts
│   └── pages/
│       ├── Home.tsx
│       └── About.tsx
├── package.json
└── vite.config.ts
```

### Server entry

```ts title="src/server.ts"
import { createHandler } from '@pyreon/server'
import { App } from './App'
import { routes } from './routes'

const template = await Bun.file('index.html').text()

const handler = createHandler({
  App,
  routes,
  template,
  clientEntry: '/src/entry-client.ts',
  middleware: [
    // Add custom headers
    (ctx) => {
      ctx.headers.set('X-Powered-By', 'Pyreon')
    },
  ],
})

Bun.serve({
  fetch: handler,
  port: Number(process.env.PORT ?? 3000),
})

console.log(`Server running at http://localhost:3000`)
```

### Client entry

```ts title="src/entry-client.ts"
import { startClient } from '@pyreon/server/client'
import { App } from './App'
import { routes } from './routes'

startClient({ App, routes })
```

### Routes

```ts title="src/routes.ts"
import type { RouteRecord } from '@pyreon/router'

export const routes: RouteRecord[] = [
  {
    path: '/',
    component: () => import('./pages/Home'),
    loader: async () => {
      const res = await fetch('https://api.example.com/featured')
      return { featured: await res.json() }
    },
  },
  {
    path: '/about',
    component: () => import('./pages/About'),
  },
]
```

---

## Full Example — Islands Mode

### Server

```ts title="src/server.ts"
import { createHandler, island } from "@pyreon/server"
import { defineComponent, h } from "@pyreon/core"

// Define islands
const Counter = island(() => import("./components/Counter"), {
  name: "Counter",
})
const Newsletter = island(() => import("./components/Newsletter"), {
  name: "Newsletter",
  hydrate: "visible",
})

// Static page shell — no JavaScript
const Page = defineComponent(() => {
  return () => (
    <main>
      <h1>Welcome</h1>
      <p>This paragraph is static HTML. No JS.</p>

      <Counter initial={0} />

      <section>
        <h2>More static content...</h2>
        <p>Still no JavaScript here.</p>
      </section>

      <Newsletter />
    </main>
  )
})

const handler = createHandler({
  App: Page,
  routes: [{ path: "/", component: Page }],
  clientEntry: "/src/entry-client.ts",
})

Bun.serve({ fetch: handler, port: 3000 })
```

### Client (islands mode)

```ts title="src/entry-client.ts"
import { hydrateIslands } from '@pyreon/server/client'

hydrateIslands({
  Counter: () => import('./components/Counter'),
  Newsletter: () => import('./components/Newsletter'),
})
```

---

## Full Example — Static Site Generation

```ts title="ssg.ts"
import { createHandler, prerender } from '@pyreon/server'
import { App } from './src/App'
import { routes } from './src/routes'

const handler = createHandler({ App, routes })

console.log('Building static site...')

const result = await prerender({
  handler,
  paths: async () => {
    // Static pages
    const staticPaths = ['/', '/about', '/contact']

    // Dynamic blog posts from CMS
    const posts = await fetch('https://cms.example.com/api/posts').then(
      (r) => r.json() as Promise<Array<{ slug: string }>>,
    )
    const blogPaths = posts.map((p) => `/blog/${p.slug}`)

    return [...staticPaths, ...blogPaths]
  },
  outDir: 'dist',
  onPage: (path, html) => {
    const kb = (html.length / 1024).toFixed(1)
    console.log(`  ${path} → ${kb} KB`)
  },
})

console.log(`\nDone! ${result.pages} pages in ${result.elapsed}ms`)

if (result.errors.length > 0) {
  console.error('\nFailed pages:')
  for (const { path, error } of result.errors) {
    console.error(`  ${path}: ${error}`)
  }
  process.exit(1)
}
```

---

## Platform Compatibility

`createHandler` returns a standard `(Request) => Promise<Response>` function. Here's how to use it with different runtimes:

### Bun

```ts
Bun.serve({ fetch: handler, port: 3000 })
```

### Deno

```ts
Deno.serve({ port: 3000 }, handler)
```

### Cloudflare Workers

```ts
export default { fetch: handler }
```

### Node.js (with adapter)

```ts
import { createServer } from 'node:http'

createServer(async (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const request = new Request(url.href, {
    method: req.method,
    headers: req.headers as HeadersInit,
  })

  const response = await handler(request)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(await response.text())
}).listen(3000)
```

### Express

```ts
import express from 'express'

const app = express()

app.use(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const request = new Request(url.href, {
    method: req.method,
    headers: req.headers as HeadersInit,
  })

  const response = await handler(request)
  res.status(response.status)
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.send(await response.text())
})

app.listen(3000)
```

---

## API Reference

### Server exports (`@pyreon/server`)

| Export                                         | Description                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `createHandler(options)`                       | Create an SSR request handler that returns a Web-standard fetch function              |
| `prerender(options)`                           | Pre-render routes to static HTML files                                                |
| `island(loader, options)`                      | Create an island component for partial hydration                                      |
| `processTemplate(template, data)`              | Replace placeholders in an HTML template                                              |
| `compileTemplate(template)`                    | Pre-split template into parts for fast per-request processing                         |
| `processCompiledTemplate(compiled, data)`      | Assemble HTML from a pre-compiled template (17x faster on realistic templates)        |
| `buildScripts(clientEntry, loaderData)`        | Build script tags for client hydration                                                |
| `buildScriptsFast(clientEntryTag, loaderData)` | Build script tags with a pre-built entry tag (avoids per-request string construction) |
| `buildClientEntryTag(clientEntry)`             | Build the `<script type="module">` tag string once at startup                         |
| `DEFAULT_TEMPLATE`                             | Minimal HTML5 template string with all placeholders                                   |

### Client exports (`@pyreon/server/client`)

| Export                     | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `startClient(options)`     | Hydrate a full SSR app on the client, returns cleanup function  |
| `hydrateIslands(registry)` | Hydrate island components on the page, returns cleanup function |

### Type exports

| Type                 | From                    |
| -------------------- | ----------------------- |
| `HandlerOptions`     | `@pyreon/server`        |
| `TemplateData`       | `@pyreon/server`        |
| `IslandOptions`      | `@pyreon/server`        |
| `IslandMeta`         | `@pyreon/server`        |
| `HydrationStrategy`  | `@pyreon/server`        |
| `PrerenderOptions`   | `@pyreon/server`        |
| `PrerenderResult`    | `@pyreon/server`        |
| `Middleware`         | `@pyreon/server`        |
| `MiddlewareContext`  | `@pyreon/server`        |
| `CompiledTemplate`   | `@pyreon/server`        |
| `StartClientOptions` | `@pyreon/server/client` |
