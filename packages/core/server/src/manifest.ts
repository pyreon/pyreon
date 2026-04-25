import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/server',
  title: 'SSR / SSG / Islands',
  tagline:
    'SSR + SSG + island architecture — createHandler(), prerender(), island(), middleware chain',
  description:
    '`@pyreon/server` is the production HTTP entry point and SSG generator. `createHandler()` produces a `(req: Request) => Promise<Response>` that handles SSR for every request, with a precompiled template (one parse at handler-creation, not per request) and middleware-chain support that short-circuits on the first `Response`. `prerender()` turns the same handler into a static-site generator. `island()` wraps a lazy-loaded component in a `<pyreon-island>` boundary with a hydration strategy (`load` / `idle` / `visible` / `media` / `never`) — the rest of the page stays HTML-only.',
  category: 'server',
  features: [
    'createHandler({ App, routes, template?, clientEntry?, middleware?, mode?, collectStyles? })',
    'mode: "string" (renderToString) or "stream" (renderToStream with Suspense out-of-order)',
    'Middleware chain — `(ctx) => Response | void | Promise<…>`, short-circuit on first Response',
    'prerender({ handler, paths, outDir, origin?, onPage? }) — SSG with onPage callback',
    'island(loader, { name, hydrate }) — lazy island with hydration strategy',
    'Hydration strategies: "load" | "idle" | "visible" | "media(...)" | "never"',
    'useRequestLocals() bridges middleware `ctx.locals` into the component tree',
    'Loader-data inline-script escaping — `</script>` becomes `<\\/script>`',
  ],
  longExample: `import { createHandler, prerender, island } from '@pyreon/server'
import { App } from './App'
import routes from './routes'

// SSR handler — one precompiled template, middleware chain, stream mode
const handler = createHandler({
  App,
  routes,
  clientEntry: '/src/entry-client.ts',
  mode: 'stream',
  middleware: [
    async (ctx) => {
      ctx.locals.user = await getUser(ctx.headers.get('cookie'))
    },
    async (ctx) => {
      if (ctx.path.startsWith('/admin') && !ctx.locals.user?.admin) {
        return new Response('Forbidden', { status: 403 })
      }
    },
  ],
})

export default { fetch: handler }

// SSG — generate a static site from the same handler
await prerender({
  handler,
  paths: ['/', '/about', '/blog/1', '/blog/2'],
  outDir: './dist',
  onPage: (path, html) => console.log(\`generated \${path} (\${html.length} bytes)\`),
})

// Islands — hydrate selectively
const SearchBar = island(
  () => import('./SearchBar'),
  { name: 'SearchBar', hydrate: 'visible' },
)

// Inside a component:
function useUser() {
  return useRequestLocals().user as User | null
}`,
  api: [
    {
      name: 'createHandler',
      kind: 'function',
      signature: 'createHandler(options: HandlerOptions): (req: Request) => Promise<Response>',
      summary:
        'Build a production SSR handler from your `App`, `routes`, and optional template / client entry / middleware. The template is precompiled once at handler-creation (split into 4 parts to skip three string scans per request); a missing `<!--pyreon-app-->` placeholder throws at creation time, not per request. Middleware runs before render with `ctx.locals` for cross-middleware data passing — return a `Response` to short-circuit the chain. `mode: "stream"` uses `renderToStream` so Suspense boundaries flush out-of-order; `mode: "string"` uses `renderToString` (default).',
      example: `import { createHandler } from "@pyreon/server"

export default createHandler({
  App,
  routes,
  clientEntry: "/src/entry-client.ts",
  mode: "stream",  // or "string"
})`,
      mistakes: [
        'Omitting `<!--pyreon-app-->` from the custom template — throws at handler-creation, not per request',
        'Returning a `Response` from middleware and expecting downstream middleware to still run — the chain short-circuits on the first `Response`',
        'Reading `ctx.locals` from inside the component without `useRequestLocals()` — the component tree only sees locals when bridged through that hook',
        'Forgetting to escape user data inserted into a custom template — `createHandler` only escapes its own loader-data injection (`</script>` → `<\\/script>`); your template content is your responsibility',
      ],
      seeAlso: ['prerender', 'island', 'useRequestLocals'],
    },
    {
      name: 'island',
      kind: 'function',
      signature:
        'island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy }): ComponentFn',
      summary:
        'Wrap a lazily-loaded component in a `<pyreon-island>` boundary with a hydration strategy. The rest of the page stays HTML-only; only the island fetches its JS bundle and hydrates. Strategies: `"load"` (immediate), `"idle"` (`requestIdleCallback`), `"visible"` (IntersectionObserver), `"media(query)"` (matchMedia), `"never"` (HTML-only, no JS). Props passed to islands are JSON-serialized — non-JSON values (functions, symbols, undefined, children) are stripped.',
      example: `const SearchBar = island(
  () => import("./SearchBar"),
  { name: "SearchBar", hydrate: "visible" }
)

// Hydration strategies: "load" | "idle" | "visible" | "media" | "never"`,
      mistakes: [
        'Passing function props (event handlers, callbacks) — silently stripped during JSON serialization, the island sees `undefined`',
        'Passing children to an island — stripped; islands cannot render arbitrary descendant trees from props',
        'Forgetting to call `hydrateIslands({ Name: () => import("./Path") })` on the client — islands render as HTML and never hydrate',
        'Using a duplicate `name` across two islands — the client-side registry collapses them, only one loader will fire',
      ],
      seeAlso: ['createHandler', 'hydrateIslands'],
    },
    {
      name: 'prerender',
      kind: 'function',
      signature: 'prerender(options: PrerenderOptions): Promise<PrerenderResult>',
      summary:
        'Static-site generator built on `createHandler`. Walks the `paths` array (or async generator), invokes the handler for each path, and writes the rendered HTML to `outDir/<path>.html`. The `onPage(path, html)` callback fires per page so callers can post-process or stream output. Validates `outDir` against path traversal (`../` segments are rejected). Errors per-page are collected in the result, not thrown.',
      example: `await prerender({
  handler,
  paths: ["/", "/about", "/blog/1", "/blog/2"],
  outDir: "./dist",
})`,
      mistakes: [
        'Passing a relative `outDir` and being surprised when it resolves against `process.cwd()` — pass an absolute path for predictability',
        'Expecting per-page errors to throw — they\\\'re collected in `result.errors`; check the array after `await`',
        'Generating thousands of paths without batching — the function processes the array sequentially; if you need parallelism, batch the `paths` array yourself',
      ],
      seeAlso: ['createHandler'],
    },
  ],
  gotchas: [
    {
      label: 'Stream mode',
      note:
        '`mode: "stream"` uses `renderToStream` with shell + app + tail emission; Suspense boundaries resolve out-of-order. The `<head>` collected via `@pyreon/head` is flushed in the shell before any Suspense boundaries resolve, so async-loaded data does not contribute to it.',
    },
    {
      label: 'Loader-data escaping',
      note:
        'Inline script JSON is rewritten — `</script>` becomes `<\\/script>` to prevent breaking out of the wrapping `<script>` tag. User data in a custom template is your responsibility; only the loader-data injection point is escaped.',
    },
  ],
})
