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
    'island(loader, { name, hydrate, prefetch? }) — lazy island with hydration strategy + optional prefetch hint',
    'Hydration strategies: "load" | "idle" | "visible" | "media(...)" | "never"',
    'Prefetch hints: "idle" | "visible" — pre-warm the chunk before the hydration trigger fires',
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
        'island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy; prefetch?: PrefetchStrategy }): ComponentFn',
      summary:
        'Wrap a lazily-loaded component in a `<pyreon-island>` boundary with a hydration strategy. The rest of the page stays HTML-only; only the island fetches its JS bundle and hydrates. Strategies: `"load"` (immediate), `"idle"` (`requestIdleCallback`), `"visible"` (IntersectionObserver), `"interaction"` (first focus/click/pointerenter/touchstart — also `"interaction(<events>)"` for custom event lists; clicks are REPLAYED on the equivalent live element after hydration so the first click both wakes the island AND fires the action), `"media(query)"` (matchMedia), `"never"` (HTML-only, no JS). Props passed to islands are JSON-serialized — non-JSON values (functions, symbols, undefined, children) are stripped. Pair with `prefetch: "idle"` or `"visible"` to pre-warm the chunk BEFORE the hydration trigger fires — eliminates the blank-while-fetching flash on deferred-strategy islands. Prefetch is a no-op for `hydrate: "load"` (loader runs synchronously already) and `hydrate: "never"` (defeats the zero-JS strategy).',
      example: `// Visible-hydration paired with idle-prefetch — chunk arrives during
// browser idle so by scroll-in, hydration is instant.
const Comments = island(
  () => import("./Comments"),
  { name: "Comments", hydrate: "visible", prefetch: "idle" }
)

// Interaction-hydration — perfect for modals / dropdowns / command palettes.
const CommandPalette = island(
  () => import("./CommandPalette"),
  { name: "CommandPalette", hydrate: "interaction" }, // first focus/click/pointerenter/touchstart
)

// Hydration strategies: "load" | "idle" | "visible" | "interaction" | "media" | "never"
// Prefetch strategies:  "none" (default) | "idle" | "visible"`,
      mistakes: [
        'Passing function props (event handlers, callbacks) — silently stripped during JSON serialization, the island sees `undefined`',
        'Passing children to an island — stripped; islands cannot render arbitrary descendant trees from props',
        'Forgetting to wire client-side hydration — under `@pyreon/vite-plugin` use `hydrateIslandsAuto(registry)` (the registry is auto-generated from `island()` calls); without a plugin use the manual `hydrateIslands({ Name: () => import("./Path") })`',
        'Using a duplicate `name` across two islands — the client-side registry collapses them, only one loader will fire',
        'Setting `prefetch: "idle"` on a `hydrate: "load"` island — load runs the loader synchronously, prefetch is redundant (silently suppressed; no `data-prefetch` attribute is emitted)',
        'Setting any `prefetch` on a `hydrate: "never"` island — defeats the whole zero-JS point of `never` (silently suppressed)',
        'Registering a `hydrate: "never"` island in `hydrateIslands({ ... })` — defeats the strategy by pulling the component module into the client bundle. The whole point of `never` is zero client JS. The runtime short-circuits never-strategy before the registry lookup so missing entries are silent (no `data-island-error="no-loader"`); the auto-registry omits never-strategy islands by design.',
        'Using `"interaction"` for visible-on-load components — defeats the strategy. Use `"load"` for above-the-fold interactive content; reserve `"interaction"` for modals / dropdowns / command palettes that are interactive but only shown on user demand',
        'Relying on focus/pointerenter to trigger the SAME action as click for `"interaction"` — only clicks are replayed post-hydration. Non-click events trigger hydration but no replay (focus can\\\'t be reliably re-dispatched once the user has tabbed past; pointerenter is passive)',
      ],
      seeAlso: ['createHandler', 'hydrateIslands', 'hydrateIslandsAuto'],
    },
    {
      name: 'hydrateIslands',
      kind: 'function',
      signature:
        'hydrateIslands(registry: Record<string, () => Promise<ComponentFn | { default: ComponentFn }>>): () => void',
      summary:
        'Client-side counterpart to `island()`. Walks every `<pyreon-island>` element on the page and schedules hydration per its `data-hydrate` strategy. Manual form: the user maintains the `Name → loader` mapping by hand (must match every `island()` `name` field). Returns a cleanup function that disconnects pending observers / listeners. Use `hydrateIslandsAuto()` under `@pyreon/vite-plugin` to skip the manual sync. Imported from `@pyreon/server/client`, NOT from `@pyreon/server` (server-only entry).',
      example: `import { hydrateIslands } from "@pyreon/server/client"

hydrateIslands({
  Counter:  () => import("./Counter"),
  SearchBar: () => import("./SearchBar"),
  // hydrate: "never" islands are intentionally omitted —
  // registering them defeats the zero-JS contract.
})`,
      mistakes: [
        'Registry key must match the `island()` `name` field exactly — typo / drift causes runtime `data-island-error="no-loader"`. Use `hydrateIslandsAuto()` to eliminate this manual sync.',
        'Including a `hydrate: "never"` island in the registry — defeats the strategy by pulling its module into the client bundle. Skip never-islands; the runtime short-circuits silently for them.',
        'Importing from `@pyreon/server` instead of `@pyreon/server/client` — the main entry is server-only and stubs/throws on client-side use.',
      ],
      seeAlso: ['island', 'hydrateIslandsAuto'],
    },
    {
      name: 'hydrateIslandsAuto',
      kind: 'function',
      signature:
        'hydrateIslandsAuto(registry: AutoIslandRegistry): () => void',
      summary:
        'Auto-discovered counterpart to `hydrateIslands()`. Under `@pyreon/vite-plugin` (`pyreon({ islands: true })` is the default), the plugin pre-scans your source for `island()` declarations and emits a `virtual:pyreon/islands-registry` virtual module. The user imports it into `entry-client.ts` and passes it here. Eliminates the manual `Name → loader` sync that drives the #1 author foot-gun for islands. Never-strategy islands are omitted from the auto-registry by design — their components stay out of the client bundle.',
      example: `// src/entry-client.ts
import { hydrateIslandsAuto } from "@pyreon/server/client"
import * as registry from "virtual:pyreon/islands-registry"

hydrateIslandsAuto(registry)`,
      mistakes: [
        'Calling without the registry argument — the function takes the imported virtual module explicitly. The user-side `import` is what lets the plugin\\\'s `resolveId` hook run; importing from inside `@pyreon/server/client` would fail at build time because Rolldown\\\'s static-import analysis runs before plugin resolveId hooks for workspace sources.',
        'Using under a non-Vite bundler — the virtual module only exists under `@pyreon/vite-plugin`. Fall back to manual `hydrateIslands({ ... })` for non-Vite consumers.',
        'Setting `pyreon({ islands: false })` and still calling `hydrateIslandsAuto()` — the plugin emits a stub registry that throws at runtime with a clear error message. Either re-enable islands (the default) or use `hydrateIslands({ ... })` instead.',
      ],
      seeAlso: ['hydrateIslands', 'island'],
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
