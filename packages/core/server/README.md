# @pyreon/server

SSR handler + SSG prerenderer + island architecture for Pyreon.

`createHandler({ App, routes, … })` produces a Web-standard `(req: Request) => Promise<Response>` for SSR — the HTML template is precompiled ONCE at handler creation (not per request), and a middleware chain short-circuits on the first returned `Response`. `prerender({ handler, paths, outDir, onPage? })` turns the same handler into a static-site generator. `island(loader, { name, hydrate, prefetch? })` wraps a lazy-loaded component in a `<pyreon-island>` boundary with a hydration strategy (`load` / `idle` / `visible` / `media(...)` / `interaction(...)` / `never`) and an optional prefetch hint. Client hydration helpers (`startClient`, `hydrateIslands`, `hydrateIslandsAuto`) live at the tree-shakeable `/client` subpath.

Also exported from this package:

- **`renderPage(App, router, path, options?)`** — the ONE string-mode render pipeline shared by `createHandler`, SSG prerendering, and zero's dev SSR: preload (lazy components + loaders), render, head collection, optional `collectStyles`, loader-data serialization — all inside `runWithRequestContext`. Returns composable parts (`{ kind: 'html', appHtml, head, loaderScript, status }`) or a `{ kind: 'redirect' }` descriptor.
- **`serverIsland(loader, { name, fallback?, cache? })`** — the inverse of a client island: a cacheable page with per-request SERVER-rendered holes, fetched from the name-allowlisted fragment endpoint (`GET /_pyreon/fragment/<name>`) with no-JS fallback content and opt-in fragment caching. See [Zero → Server Islands](https://pyreon.dev/docs/zero#server-islands).

For most apps, the higher-level `@pyreon/zero` meta-framework wraps this package and adds routing conventions / SSG roadmap / adapters. Reach for `@pyreon/server` directly when you want the building blocks without the meta-framework opinions.

## Install

```bash
bun add @pyreon/server @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/runtime-server @pyreon/router @pyreon/head
```

## Quick start — SSR

```ts
// server.ts
import { createHandler } from '@pyreon/server'
import { App } from './App'
import { routes } from './routes'

const handler = createHandler({
  App,
  routes,
  clientEntry: '/src/entry-client.ts',
  mode: 'stream',                   // 'string' (renderToString, default) or 'stream' (renderToStream)
                                    // — zero defaults its mode:'ssr' apps to 'stream' one layer up
  collectStyles: () => sheet.getStyleTag(), // inline @pyreon/styler CSS into <head>
  middleware: [
    async (ctx) => { ctx.locals.user = await getUser(ctx.headers.get('cookie')) },
    async (ctx) => {
      if (ctx.path.startsWith('/admin') && !ctx.locals.user?.admin) {
        return new Response('Forbidden', { status: 403 })
      }
    },
  ],
})

Bun.serve({ fetch: handler, port: 3000 })
```

```tsx
// In a component, read middleware-supplied locals:
import { useRequestLocals } from '@pyreon/server'
function Layout() {
  const user = useRequestLocals().user as User
  return <span>Hi {user.name}</span>
}
```

## SSG

```ts
import { createHandler, prerender } from '@pyreon/server'

const handler = createHandler({ App, routes })
const result = await prerender({
  handler,
  paths: ['/', '/about', '/blog'],
  outDir: 'dist',
  onPage: (path, html) => console.log(`✓ ${path} (${html.length}b)`),
})
console.log(`Generated ${result.pages} pages in ${result.elapsed}ms`)
```

For a richer SSG pipeline (dynamic `getStaticPaths`, per-locale 404s, sitemap, redirects manifest, ISR), use `@pyreon/zero` — it wraps `prerender` and adds the conventions.

## Islands

```ts
// SearchBar.island.ts
import { island } from '@pyreon/server'

export const SearchBar = island(() => import('./SearchBar'), {
  name: 'SearchBar',
  hydrate: 'visible',
  prefetch: 'idle',
})
```

```tsx
// In your SSR template — the island renders a <pyreon-island> custom element
<SearchBar placeholder="Search…" />
```

```ts
// entry-client.ts
import { hydrateIslands } from '@pyreon/server/client'

hydrateIslands({
  SearchBar: () => import('./SearchBar'),
})
```

### Hydration strategies

| Strategy | When |
|----------|------|
| `'load'` | Synchronously on page load (above-the-fold interactive content) |
| `'idle'` | During browser idle (`requestIdleCallback`) — non-critical UI |
| `'visible'` | When the island enters the viewport (`IntersectionObserver`) |
| `'media(<query>)'` | When a media query matches (`'media(min-width: 768px)'`) |
| `'interaction(<events>)'` | On first user interaction (default `focus` / `click` / `pointerenter` / `touchstart`); first click is **replayed** post-hydration |
| `'never'` | Never hydrate — SSR-only zero-JS surface |

### Prefetch hints

```ts
island(loader, { hydrate: 'visible', prefetch: 'idle' })   // chunk warms during idle
island(loader, { hydrate: 'idle',    prefetch: 'visible' }) // chunk warms on viewport entry
```

The prefetch hint independently schedules the loader so the underlying module is already cached when the hydration trigger fires. **Suppressed** (`data-prefetch` not emitted) when `hydrate: 'load'` (already eager) or `hydrate: 'never'` (defeats the zero-JS strategy).

### `hydrate: 'never'` rule

A `never`-strategy island MUST NOT have a registry entry. The whole point is shipping zero client JS; registering a loader pulls the component module into the client bundle graph even though the loader never fires. The auto-registry (via `@pyreon/vite-plugin`'s `islands: true`) omits never-islands by design.

### Auto-registry (recommended)

```ts
// vite.config.ts
import { pyreon } from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ islands: true })] }
```

```ts
// entry-client.ts
import { hydrateIslandsAuto } from '@pyreon/server/client'
import registry from 'virtual:pyreon/islands-registry'
hydrateIslandsAuto(registry)
```

The Vite plugin scans every `island(() => import('PATH'), { name })` call at `buildStart` and emits the registry as a virtual module — no manual sync needed. Drop-in replacement for `hydrateIslands({ ... })`.

For project-wide foot-gun detection (duplicate names, nested islands, dead islands, registry mismatch, never-with-registry-entry), run `pyreon doctor --check-islands`.

## startClient — full hydration

```ts
// entry-client.ts
import { startClient } from '@pyreon/server/client'
import { App } from './App'
import { routes } from './routes'

startClient({ App, routes, container: '#app' })
```

Pairs with `createHandler` for the full SSR → hydration flow. Hydrates the router state from `window.__PYREON_LOADER_DATA__` and calls `router.replace(...)` on SPA cold-start so direct URL navigation works.

`startClient` hard-throws if called server-side.

## Templates

```ts
import { processTemplate, DEFAULT_TEMPLATE } from '@pyreon/server'

const html = processTemplate(DEFAULT_TEMPLATE, {
  head: '<title>Page</title>',
  app: '<div id="app"></div>',
  scripts: '<script src="/entry-client.js" type="module"></script>',
})
```

`compileTemplate(template)` precompiles a template once (faster for high-traffic SSR); `processCompiledTemplate(compiled, data)` runs the compiled form per request. `createHandler` does this for you automatically.

`buildScripts(data)` generates the `<script>` tags for hydration (loader-data + client-entry). Inline-script bodies have `</script>` escaped to prevent breakout.

## Middleware

```ts
createHandler({
  middleware: [
    // Set request-scoped data
    async (ctx) => { ctx.locals.user = await getUser(ctx.headers.get('cookie')) },
    // Short-circuit with a Response
    async (ctx) => {
      if (ctx.path === '/api/health') return new Response('OK')
    },
    // Headers / logging
    async (ctx) => { console.log(ctx.method, ctx.path) },
  ],
})
```

Each middleware receives `ctx: MiddlewareContext` (`{ request, path, method, headers, locals, ... }`) and may return a `Response` (short-circuit), `void` (continue), or `Promise` of either. The first `Response` wins; otherwise the SSR render runs.

## Documentation

Full docs: [pyreon.dev/docs/server](https://pyreon.dev/docs/server) (or `docs/src/content/docs/server.md` in this repo).

## License

MIT
