---
title: Zero
description: Full-stack meta-framework for Pyreon applications.
---

`@pyreon/zero` is a batteries-included meta-framework for Pyreon, similar to Next.js for React or Nuxt for Vue. It provides file-system routing, SSR/SSG/ISR/SPA rendering modes, optimized components, a theme system, SEO utilities, font/image optimization, and production deployment adapters — everything you need to ship a full-stack Pyreon application.

<PackageBadge name="@pyreon/zero" href="/docs/zero" status="beta" />

:::tip{title="Static Site Generation"}
This page is a quick-start + feature overview. SSG has its own dedicated reference with the full `getStaticPaths`, redirects, i18n, ISR, and adapter story — see **[SSG](/docs/ssg)**.
:::

## Installation

:::code-group

```bash [npm]
npm install @pyreon/zero
```

```bash [bun]
bun add @pyreon/zero
```

```bash [pnpm]
pnpm add @pyreon/zero
```

```bash [yarn]
yarn add @pyreon/zero
```

:::

## Quick Start

Scaffold a new project with the `create` command:

```bash
bun create @pyreon/zero my-app
cd my-app
bun install
bun run dev
```

This gives you a working application with file-system routing, SSR, and hot module replacement out of the box. The dev server defaults to port `3000`; override with `--port` or `zero({ port })`.

## Client-Safe vs Server-Only Entry Points

`@pyreon/zero` is split into a small client-safe main entry and a larger server-only entry. **This is the single most important thing to get right when importing from Zero.**

| Entry                  | Contains                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/zero`         | Browser-safe only: `Image`, `Link`, `Script`, `Icon`, `Meta`, theme system, i18n hooks, plus types                                                          |
| `@pyreon/zero/server`  | Everything that touches `node:fs`/`node:path`: `createServer`, `createApp`, `defineConfig`, `resolveConfig`, adapters, `seoPlugin`, `aiPlugin`, `i18nRouting`, fs-router helpers, `vercelRevalidateHandler` |

The main entry exports **throwing stubs** for the most commonly mis-imported server APIs (`createServer`, `defineConfig`, `seoPlugin`, `faviconPlugin`, `validateEnv`, `ogImagePlugin`, `aiPlugin`) so a wrong import fails fast with an actionable message instead of a cryptic `node:fs` bundling error:

```ts
// ✅ client-safe
import { Image, Link, Icon, theme } from '@pyreon/zero'

// ✅ server-only
import { createServer, defineConfig } from '@pyreon/zero/server'

// ❌ throws at import: "createServer is server-only. Import from '@pyreon/zero/server' instead."
import { createServer } from '@pyreon/zero'
```

A handful of features live on their own focused subpaths (so a client bundle that imports `corsMiddleware` doesn't pull in unrelated server code) — see [Subpath Exports](#subpath-exports).

## Single-instance contract

Pyreon's `@pyreon/*` packages MUST resolve to exactly one copy per heap. Multiple instances of the same package (Vite resolver divergence, sub-dep version mismatch, workspace+npm mix) break the framework's contracts silently — `runWithHooks` sets `_current` on instance A, `onMount` reads `_current` from instance B, warning storms ensue. Pyreon ships **two layers** to enforce this:

1. **Bundler prevention (default-on).** `@pyreon/vite-plugin` injects `resolve.dedupe: <all @pyreon/* + transitive>` automatically — walks `node_modules/@pyreon` for the full set (direct AND transitive deps a direct dep pulled in). Zero config; works for every Vite-driven app. Override with `PYREON_DISABLE_DEDUPE=1` only if you have a specific need to allow duplicate resolution (rare).
2. **Runtime detection (default-on).** Every `@pyreon/*` package with module-level state calls `registerSingleton(...)` at module load. If two distinct module instances of the same package register, the second registration throws an actionable `Error` naming both file paths + three concrete fixes. Demote to a warning with `PYREON_SINGLE_INSTANCE=warn`; disable entirely with `PYREON_SINGLE_INSTANCE=silent` (browser extensions, micro-frontends, nested SSR test harnesses).

For non-Vite bundlers, you need the equivalent configuration manually:

- **Webpack / Next.js**: `resolve.alias` every `@pyreon/<name>` to a single absolute path, OR use `module.rules.resolve.symlinks: false` if your bundler resolves through a unified workspace.
- **Rollup**: `@rollup/plugin-node-resolve` + `dedupe: ['@pyreon/<name>', ...]`.
- **esbuild**: no native dedupe; use a plugin or symlinks.

`pyreon doctor --check-dedup` audits any consumer's lockfile (`bun.lock` / `package-lock.json` / `pnpm-lock.yaml`) for `@pyreon/*` packages with more than one resolved version — surfaces duplicates BEFORE runtime detection fires.

## Configuration

Zero is configured as a set of Vite plugins in your `vite.config.ts`. The default export of `@pyreon/zero/server` is the Zero Vite plugin:

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { fontPlugin } from '@pyreon/zero/font'
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    pyreon(),
    zero({ mode: 'ssr' }),
    fontPlugin({ google: ['Inter:wght@400;500;700'] }),
    seoPlugin({ sitemap: { origin: 'https://example.com' } }),
  ],
}
```

`zeroPlugin()` returns `Plugin[]` — `[mainPlugin]` for `ssr`/`spa`/`isr`, `[mainPlugin, ssgPlugin]` for `ssg`. Vite's plugins array natively accepts nested arrays, so `plugins: [pyreon(), zero()]` works unchanged in all modes.

For type-safe config, use `defineConfig` from `@pyreon/zero/server` (or `@pyreon/zero/config`):

```ts title="zero.config.ts"
import { defineConfig } from '@pyreon/zero/server'

export default defineConfig({
  mode: 'ssr',
  adapter: 'node',
  port: 3000,
})
```

### ZeroConfig Options

| Option       | Type                                                                          | Default | Description                                                  |
| ------------ | ----------------------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `mode`       | `"ssr" \| "ssg" \| "spa" \| "isr"`                                            | `"ssr"` | Global rendering mode                                        |
| `vite`       | `Record<string, unknown>`                                                     | `{}`    | Vite config overrides                                        |
| `ssr.mode`   | `"stream" \| "string"`                                                        | `"stream"` when `mode: "ssr"`, `"string"` otherwise | SSR output mode                |
| `ssg`        | `{ paths?, emit404?, emitRedirects?, redirectsAsHtml?, onPathError?, errorArtifact?, concurrency?, onProgress?, splitChunks?, speculationRules?, viewTransitions?, cssMode?, earlyHints?, modulePreload? }` | `{}` | SSG options — see **[SSG](/docs/ssg)** |
| `isr`        | `ISRConfig` (`{ revalidate, maxEntries?, cacheKey?, store?, tagsForRequest? }`) | —       | Runtime ISR config (only used when `mode: "isr"`)            |
| `adapter`    | `"node" \| "bun" \| "static" \| "vercel" \| "cloudflare" \| "netlify" \| Adapter` | `"node"` | Deployment adapter (name or constructed instance)        |
| `base`       | `string`                                                                      | `"/"`   | Base URL path — single source of truth (see [Base Path](#base-path)) |
| `i18n`       | `I18nRoutingConfig`                                                           | —       | Build-time locale-prefixed route duplication — see **[SSG → i18n](/docs/ssg#i18n-localized-routes)** |
| `middleware` | `Middleware[]`                                                                | `[]`    | Global server middleware                                     |
| `port`       | `number`                                                                      | `3000`  | Dev/preview server port                                      |

`resolveConfig(userConfig?)` merges user config with the defaults above (`mode: 'ssr'`, `base: '/'`, `port: 3000`, `adapter: 'node'`). When no `ssr.mode` is set, the server picks the effective default at runtime: `'stream'` for `mode: 'ssr'`, `'string'` for every other mode — pass `ssr: { mode: 'string' }` to opt an SSR app back into buffered rendering.

## File-System Routing

Routes live in `src/routes/`. The file path maps directly to the URL:

| File                            | URL          |
| ------------------------------- | ------------ |
| `src/routes/index.tsx`          | `/`          |
| `src/routes/about.tsx`          | `/about`     |
| `src/routes/users/[id].tsx`     | `/users/:id` |
| `src/routes/blog/[...slug].tsx` | `/blog/*`    |

### Special Files

| File           | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `_layout.tsx`  | Wraps all routes in the same directory and subdirectories              |
| `_error.tsx`   | Error boundary for the route segment                                   |
| `_loading.tsx` | Loading/suspense fallback for the route segment                        |
| `_404.tsx`     | Not-found page (also `_not-found.tsx`) — drives runtime + SSG 404s      |

:::warning{title="Don't double-mount the layout"}
fs-router emits `_layout.tsx` as a **parent route**. Do **not** also pass it via `createApp({ layout })` / `startClient({ layout })` — that mounts the layout twice. `createApp` detects this collision and ignores the explicit `layout` with a dev warning, but the correct shape is to never pass it.
:::

### Route Groups

Wrap a directory name in parentheses to group routes without affecting the URL:

```
src/routes/
  (auth)/
    login.tsx    → /login
    register.tsx → /register
  (marketing)/
    pricing.tsx  → /pricing
```

### Virtual Modules

The plugin generates three virtual modules you import in your entry files:

```ts
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
```

Add their types to `env.d.ts`:

```ts title="env.d.ts"
declare module 'virtual:zero/route-middleware' {
  import type { RouteMiddlewareEntry } from '@pyreon/zero'
  export const routeMiddleware: RouteMiddlewareEntry[]
}
```

## Route Module Exports

Each route file can export any combination of:

```tsx
// src/routes/users/[id].tsx

// Required: the page component
export default function UserPage({ params, data }) {
  return (
    <div>
      User {params.id}: {data.name}
    </div>
  )
}

// Optional: server-side data loading
export async function loader({ params, query, request, signal }) {
  const user = await db.users.findById(params.id)
  return { name: user.name }
}

// Optional: per-route middleware (@pyreon/server signature)
export const middleware = (ctx) => {
  if (!ctx.req.headers.get('authorization')) return new Response('Unauthorized', { status: 401 })
}

// Optional: navigation guard
export function guard({ params }) {
  return params.id ? true : '/404'
}

// Optional: head/meta tags
export const meta = { title: 'User Profile', description: 'View user profile details' }

// Optional: per-route rendering mode override
export const renderMode = 'ssr' // "ssr" | "ssg" | "spa" | "isr"

// SSG-only: enumerate concrete params for a dynamic route
export const getStaticPaths = () => [{ params: { id: 'a' } }, { params: { id: 'b' } }]

// SSG/ISR: build-time revalidate interval (seconds, or `false` for never)
export const revalidate = 60

// Loader cache controls
export const loaderKey = ({ params }) => `user-${params.id}`
export const gcTime = 0 // disable loader caching for auth-gated routes
```

`getStaticPaths`, `revalidate`, `loaderKey`, and `gcTime` are documented in depth in the **[SSG reference](/docs/ssg)** (the first two) and **[router docs](/docs/router)** (the last two).

### Loader Context

The `loader` receives a `LoaderContext` (re-exported from `@pyreon/router`):

| Property  | Type                     | Description                                                       |
| --------- | ------------------------ | ----------------------------------------------------------------- |
| `params`  | `Record<string, string>` | Dynamic route parameters                                          |
| `query`   | `Record<string, string>` | URL search parameters                                             |
| `request` | `Request \| undefined`   | The incoming HTTP request — populated only during SSR/SSG preload |
| `signal`  | `AbortSignal`            | Abort signal for cancellation                                     |

Throw `redirect(url, status?)` from `@pyreon/router` inside a loader to redirect before the layout renders — handled at SSR, CSR, **and SSG** (see [SSG → Loader redirects](/docs/ssg#loader-redirects)).

## Rendering Modes

### SSR (Server-Side Rendering)

The default mode. Pages are rendered on the server for every request and hydrated on the client. SSR auto-bundles the server handler to `dist/server/entry-server.js` at build time and dispatches to platform adapters (vercel / cloudflare / netlify / node / bun). See the dedicated **[SSR & ISR reference](/docs/ssr)** for the build pipeline, loaders, streaming, runtime caching, the synthetic-vs-user-entry contract, and per-platform deployment.

```ts
defineConfig({
  mode: 'ssr',
  ssr: { mode: 'string' }, // streaming is the default for mode: 'ssr'; 'string' opts back to buffered
})
```

### SSG (Static Site Generation)

Pages are prerendered to static HTML at build time. Ideal for content that rarely changes. SSG has a substantial feature surface — see the dedicated **[SSG reference](/docs/ssg)**.

```ts
defineConfig({
  mode: 'ssg',
  ssg: { paths: ['/', '/about', '/blog/hello-world'] },
})
```

### SPA (Single-Page Application)

Client-only rendering. The server sends a minimal HTML shell and all rendering happens in the browser.

```ts
defineConfig({ mode: 'spa' })
```

### ISR (Incremental Static Regeneration — runtime)

`mode: 'isr'` combines SSR with stale-while-revalidate **in-memory** caching at request time. Pages are served from cache and regenerated in the background after the revalidation window.

```ts
defineConfig({
  mode: 'isr',
  isr: {
    revalidate: 60, // seconds before a cached entry is considered stale
    maxEntries: 1000, // LRU cap on the in-memory cache (default 1000)
    // cacheKey defaults to `url.pathname + url.search` — query strings vary the cache.
    // Cookies are NOT included by default (auth-gated content requires explicit cacheKey).
  },
})
```

:::warning{title="ISR cache key — two trade-offs"}
The default cache key is `url.pathname + url.search` — query strings affect the key, cookies and Authorization headers do NOT. Two adjustments depending on your route:

**Auth-gated content** (loader reads `cookie` / `Authorization`): the default is unsafe — the first user's cached HTML serves every other user. Supply a `cacheKey` that varies on the session identifier:

```ts
cacheKey: (req) => {
  const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
  return `${new URL(req.url).pathname}::${session}`
}
```

**High-cardinality query params** (analytics tokens like `utm_*`, `fbclid`, `gclid`): the default causes cache explosion (one entry per click variant). For routes that ignore query strings entirely, strip them:

```ts
cacheKey: (req) => new URL(req.url).pathname
```

A one-time dev-mode warning fires at handler init when no `cacheKey` is configured — it names both fixes inline. Production builds tree-shake the warning to zero bytes via the standard `process.env.NODE_ENV !== 'production'` gate.
:::

Build-time ISR (per-route `export const revalidate` + adapter-driven rebuild-on-stale) is a **separate** mechanism documented in [SSG → Build-time ISR](/docs/ssg#build-time-isr-per-route-revalidate).

### Per-route render modes (hybrid rendering)

`mode` is the **default** for routes that don't declare their own. Any route file (or layout — declarations cascade to descendants) can override it:

```ts
// src/routes/about.tsx — prerendered at build inside an SSR app
export const renderMode = 'ssg'

// src/routes/dashboard.tsx — opt OUT of SSR: the server responds with the
// CSR shell, the client mounts fresh and runs loaders on the cold-start path
export const renderMode = 'spa'

// src/routes/pricing.tsx — per-route stale-while-revalidate caching
export const renderMode = 'isr'

// src/routes/blog/_layout.tsx — cascades 'ssg' to every /blog/** route
// that doesn't declare its own renderMode
export const renderMode = 'ssg'
```

Resolution is leaf-first along the matched chain: a page's own declaration beats its layout's, and a layout's beats the app default. One implementation (`resolveRenderModeForPath`) drives **both** the build and the runtime, so they can never disagree.

**What each declaration does inside a server app (`mode: 'ssr' | 'isr'`):**

| renderMode | Build | Runtime |
| --- | --- | --- |
| `'ssg'` | Prerendered to `dist/<path>/index.html` (loaders run at build; `getStaticPaths` expands dynamic routes) + listed in `_pyreon-ssg-paths.json` | Served **static-first** by the emitted node/bun servers and excluded from the Cloudflare worker via `_routes.json`; a missing file falls back to SSR — never a 404 |
| `'spa'` | Nothing emitted | The server responds with the CSR shell (built template, placeholders blanked, GET-only); the client mounts + runs loaders |
| `'isr'` | — | Routed through the shared SWR cache handler (`config.isr`, default `revalidate: 60`) |
| `'ssr'` | — | Under an `'isr'` app mode this is the per-route **cache bypass** |

**Inside a static app (`mode: 'ssg'`):** `'spa'` routes emit the CSR shell instead of prerendered HTML; declaring `'ssr'` or `'isr'` is a **build error** (a static deploy has no server — the error names each offending route and the fix). Vercel/Netlify serve prerendered files static-first by platform convention; for subpath (`base`) deploys on Cloudflare the `_routes.json` excludes are root-relative — verify them when combining `base` with hybrid.

When no route declares a divergent mode, the pipeline is byte-identical to the app-level mode — existing apps are unaffected.

### Streaming by default (`mode: 'ssr'`)

`mode: 'ssr'` streams by default: the shell flushes immediately and Suspense boundaries resolve out-of-order (styles flush inline per boundary, so streamed content arrives styled). Opt back into buffered rendering with `ssr: { mode: 'string' }`. ISR apps stay buffered — the SWR cache stores complete bodies; a per-route `renderMode = 'isr'` declaration inside a streaming app automatically uses a buffered render for the cached routes.

## Server Islands

The inverse of client islands: a **cacheable page with per-request server-rendered holes**. `island()` defers client hydration of an interactive component; `serverIsland()` defers SERVER rendering of a fragment whose content depends on the request (session, cookies, A/B bucket, live data) — so the page around it can be prerendered, ISR-cached, or CDN-cached while the hole stays personalized.

```tsx
import { serverIsland } from '@pyreon/zero'

const CartBadge = serverIsland(() => import('../islands/CartBadge'), {
  name: 'CartBadge',
  fallback: <span class="badge">Cart</span>, // shown until the fragment arrives (and for no-JS)
})

// In any route/layout — the page emits ONLY a marker here:
<CartBadge label="Cart" />
```

How it works: every render emits only a `<pyreon-server-island>` marker (name + codec-encoded props — the same lossless codec client islands use). On the client the marker **self-activates on mount** and fetches `GET /_pyreon/fragment/<name>?props=…` — an endpoint `createServer` auto-mounts — then swaps the returned HTML in. The fragment renders per request with full request context (`useRequestLocals()` works inside it, exactly like a page).

Contracts worth knowing:

- **Always deferred** — even on a fully-SSR page the island arrives via the fragment fetch. That's what makes the surrounding page's cacheability unconditional.
- **Allowlisted endpoint** — only registered island names render; unknown names 404. Hostile `props` return 400, never a 500.
- **Fragments default to `Cache-Control: no-store`**. The `cache` option sets a custom value for deferred-but-public fragments — never cache a fragment that varies on cookies (the same auth caveat as ISR's `cacheKey`).
- **Failure degrades to the fallback** — a failed fragment fetch leaves the fallback content in place and flags the marker (`data-island-error="fragment-failed"`); the page never breaks.
- **Cold starts work**: the endpoint warms lazy route modules once on a registry miss, so a fragment request hitting a freshly-restarted server (pages served from CDN cache) still resolves.
- Pages without a full Pyreon mount (static-islands apps) call `activateServerIslands()` from `@pyreon/server/client` once after load.
- Composing a client `island()` INSIDE a server island is not supported in v1.

### Delivery polish (SSG toggles)

Four opt-in `ssg` options, each verified on real builds:

```ts
zero({
  mode: 'ssg',
  ssg: {
    speculationRules: 'prefetch', // or 'prerender' — Chrome Speculation Rules; near-instant MPA navs
    viewTransitions: true,        // cross-document View Transitions (@view-transition CSS, zero JS)
    cssMode: 'asset',             // styler CSS as ONE hashed shared file instead of inlined per page
    earlyHints: true,             // per-path Link: modulepreload entries in _headers → HTTP 103 on CF/Netlify
  },
})
```

- `speculationRules` injects a document-rules block (`href_matches: "/*"`, moderate eagerness) into every prerendered page; unsupported browsers ignore it.
- `viewTransitions` opts prerendered pages into cross-document View Transitions — MPA navigations animate with zero JS in supporting browsers.
- `cssMode: 'asset'` extracts the styler's per-page inline `<style>` (identical across pages by construction) into one content-hashed `assets/pyreon-ssg.<hash>.css` that every page links — pages share the browser-cached file instead of re-downloading the full sheet inside each HTML. No-op for projects without `@pyreon/styler`.
- `earlyHints` appends per-path `Link: <chunk>; rel=modulepreload` entries to `_headers` (existing user `_headers` content is preserved); Cloudflare Pages and Netlify turn those into HTTP 103 Early Hints.

### ISR: tag-based invalidation + filesystem store

```ts
import { createFsStore } from '@pyreon/zero/server'

zero({
  mode: 'isr',
  isr: {
    revalidate: 60,
    store: createFsStore('./.isr-cache'),       // survives restarts (single-box node/bun)
    tagsForRequest: (req) => {
      const p = new URL(req.url).pathname
      return p.startsWith('/posts/') ? ['posts', `post:${p.split('/')[2]}`] : []
    },
  },
})

// webhook handler:
await isrHandler.revalidateTag('posts') // drops every page that rendered posts
```

`tagsForRequest` records tags at cache-set time; `revalidateTag(tag)` drops every entry carrying the tag — the webhook-ergonomic unit (no path enumeration). Both shipped stores (`createMemoryStore`, `createFsStore`) implement the tag index; custom stores add `setTags`/`keysByTag`. `createFsStore(dir)` persists entries (and the tag index) as JSON files so a restart doesn't cold-start the cache — multi-instance deploys still want a shared external store (Redis/KV).

## Server Loaders

Route loaders are **isomorphic** by default — they run on the server during SSR and **in the browser** on client-side navigations, so they can't touch a database, a secret, or a server-only SDK. A **server loader** can: put it in a `.server.ts` sibling next to the route file.

```ts
// src/routes/dashboard.server.ts — NEVER ships to the client
import { db } from '../lib/db'

export async function serverLoader(ctx: { request?: Request }) {
  const session = ctx.request?.headers.get('cookie') // cookies flow on SSR AND navigations
  return db.dashboardFor(session)
}
```

```tsx
// src/routes/dashboard.tsx — reads it like any loader
const data = useLoaderData<Dashboard>()
```

How it works:

- **SSR / SSG / fragments**: the serverLoader runs in-process, exactly like a `loader` (full `LoaderContext`, including `request`).
- **Client navigations**: the router fetches `GET /_pyreon/data?path=<to>` — ONE request for the whole matched chain (single-fetch), auto-mounted by `createServer`. Cookies flow (same-origin). A `redirect()` thrown in a serverLoader comes back as a JSON envelope and becomes a client-side navigation.
- **Every server-module extension is recognized**: `.server.ts`, `.server.tsx`, `.server.js`, and `.server.jsx` siblings are all picked up as server-loader modules AND all excluded from the client bundle.
- **Bundle exclusion is structural**: the client routes module never imports `.server.*` files — the server code can't leak into the client bundle by construction (gated in CI by an artifact-level sentinel scan).
- A route may have `loader` OR a `.server.ts` sibling, **not both** — the build fails with the fix spelled out (move the public fetching into the serverLoader).
- **Layouts can't have server loaders** — `_layout.server.ts` siblings are deliberately not picked up. Put per-request layout data in a page's serverLoader or in middleware locals (`useRequestLocals()`).
- `staleWhileRevalidate` does not apply to server-loader records.

Isomorphic `loader` stays the right tool for public-API fetching that benefits from running client-side.

## Components

All four components are client-safe and follow the same three-layer extensibility pattern: a **`useX` composable** (full control), a **`createX` HOC** (wrap any component with the behavior), and a **default component**.

### Link

Client-side navigation with prefetching and active state tracking.

```tsx
import { Link, useLink, createLink, prefetchRoute } from '@pyreon/zero'

;<Link href="/about">About</Link>
<Link href="/dashboard" prefetch="hover">Dashboard</Link>
<Link href="/settings" prefetch="viewport">Settings</Link>
<Link href="/admin" prefetch="none">Admin</Link>
```

| Prop               | Type                              | Default          | Description                                  |
| ------------------ | --------------------------------- | ---------------- | -------------------------------------------- |
| `href`             | `string`                          | required         | Navigation target                            |
| `prefetch`         | `"hover" \| "viewport" \| "none"` | `"hover"`        | When to prefetch the route                   |
| `activeClass`      | `string`                          | `"active"`       | Class when the link matches the current route |
| `exactActiveClass` | `string`                          | `"exact-active"` | Class for exact route match                  |

**Three layers:**

```tsx
// 1. useLink — composable, full control
function CustomNav({ href, children }) {
  const { isActive, isExactActive, navigate, prefetch } = useLink({ href })
  return (
    <button class={isActive() ? 'active' : ''} onClick={navigate} onMouseEnter={prefetch}>
      {children}
    </button>
  )
}

// 2. createLink — wrap any component with link behavior
const FancyLink = createLink((props) => (
  <button class={props.isActive() ? 'fancy-active' : 'fancy'} onClick={props.onClick}>
    {props.children}
  </button>
))

// 3. Link — the default <a>-based link (itself built via createLink)
```

`prefetchRoute('/about')` imperatively prefetches a route's chunk + loader data.

### Image

Optimized image with lazy loading, responsive `srcset`, multi-format `<picture>`, and blur-up placeholders.

```tsx
import { Image, useImage, createImage } from '@pyreon/zero'

;<Image
  src="/photos/hero.jpg"
  alt="Hero image"
  width={1200}
  height={600}
  priority // skip lazy loading for above-the-fold images
  placeholder="data:image/svg+xml;base64,..." // low-quality placeholder URL/data URI
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

`useImage(props)` returns the resolved `src`/`srcset`/`sizes`, the container ref, load state, and style accessors; `createImage(Component)` wraps any component with `ImageRenderProps` (pre-rendered `<img>` + placeholder + ref/styles). The default `<Image>` is built via `createImage`.

Build-time optimization (responsive variants, modern formats, generated placeholders) is handled by [`imagePlugin`](#image-processing).

### Script

Optimized third-party script loading.

```tsx
import { Script, useScript, createScript } from '@pyreon/zero'

;<Script src="https://cdn.example.com/critical.js" strategy="beforeHydration" />
<Script src="https://cdn.example.com/analytics.js" strategy="afterHydration" />
<Script src="https://cdn.example.com/widget.js" strategy="onIdle" />
<Script src="https://cdn.example.com/chat.js" strategy="onInteraction" />
<Script src="https://cdn.example.com/video.js" strategy="onViewport" />
```

| Strategy          | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `beforeHydration` | Loads synchronously before the app hydrates. Use sparingly.                     |
| `afterHydration`  | Loads asynchronously after hydration completes.                                 |
| `onIdle`          | Loads during `requestIdleCallback`. Good for non-critical scripts.              |
| `onInteraction`   | Loads on first user interaction (click, scroll, keydown).                       |
| `onViewport`      | Loads when the script's container enters the viewport via IntersectionObserver. |

Same three-layer shape: `useScript(props)` / `createScript(Component)` / `Script`.

### Icon

A minimal inline-SVG leaf — renders an SVG you loaded, container-sizable and theme-aware (`fill="currentColor"` by default, so CSS `color` themes it). Two ways to supply the SVG:

```tsx
import { Icon, createIcon, createNamedIcon } from '@pyreon/zero'

// Component form (recommended) — import the SVG as a component
import Check from './check.svg?component'
;<span style="width:2rem"><Icon as={Check} /></span>

// Raw-markup form — import the SVG as a string
import check from './check.svg?raw'
;<span style="width:2rem"><Icon svg={check} /></span>

// Factory: one reusable component per glyph
export const CheckIcon = createIcon(check) // or createIcon(Check)
;<span style="width:48px"><CheckIcon class="text-green-600" /></span>
```

There is intentionally **no `useIcon`** — an icon has no composable behavior. For a folder of icons, [`iconsPlugin`](#other-build-time-plugins) scans a directory and generates a strictly-typed `<Icon name="...">` via `createNamedIcon`.

### Meta

Per-page head tags, including Open Graph + SEO.

```tsx
import { Meta } from '@pyreon/zero'

;<Meta
  title="My Page"
  description="Page description"
  ogImage={{ url: '/og.png', width: 1200, height: 630 }}
  ogVideo={{ url: '/video.mp4', type: 'video/mp4' }}
  ogAudio={{ url: '/audio.mp3', type: 'audio/mpeg' }}
  noIndex
  ogTemplate="default"
  favicon="/custom-favicon.svg"
/>
```

`buildMetaTags(props)` returns the tag list directly if you need to compose head output yourself.

## Theme System

Built-in dark/light theme with FOUC prevention. All theme APIs are client-safe.

```tsx
import {
  theme,
  resolvedTheme,
  toggleTheme,
  setTheme,
  initTheme,
  ThemeToggle,
  themeScript,
  setSSRThemeDefault,
} from '@pyreon/zero'

function Header() {
  return (
    <header>
      <p>Theme: {theme()}</p>
      <p>Resolved (system-aware): {resolvedTheme()}</p>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('system')}>System</button>
      <ThemeToggle />
    </header>
  )
}
```

| Export               | Type                                         | Description                                              |
| -------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `theme`              | `() => "light" \| "dark" \| "system"`        | Current theme preference (reactive)                      |
| `resolvedTheme`      | `() => "light" \| "dark"`                    | Resolved theme — reactive to OS color-scheme changes     |
| `toggleTheme`        | `() => void`                                 | Toggle between light and dark                            |
| `setTheme`           | `(t) => void`                                | Set theme explicitly                                     |
| `initTheme`          | `() => void`                                 | Initialize from storage/system on startup                |
| `ThemeToggle`        | Component                                    | Pre-built toggle button                                  |
| `themeScript`        | `string`                                     | Inline `<script>` to apply theme before first paint      |
| `setSSRThemeDefault` | `(t) => void`                                | Set the theme used during SSR render                     |

Add `themeScript` to your HTML `<head>` and call `initTheme()` on startup to prevent FOUC.

## Middleware

Built-in server middleware. Wire them into `createServer({ middleware: [...] })`.

| Middleware                | Import path                  | Purpose                                            |
| ------------------------- | ---------------------------- | -------------------------------------------------- |
| `cacheMiddleware`         | `@pyreon/zero/cache`         | `Cache-Control` headers by asset type              |
| `securityHeaders`         | `@pyreon/zero/cache`         | CSP, X-Frame-Options, etc.                         |
| `varyEncoding`            | `@pyreon/zero/cache`         | `Vary: Accept-Encoding` for CDN correctness        |
| `corsMiddleware`          | `@pyreon/zero/cors`          | CORS                                               |
| `rateLimitMiddleware`     | `@pyreon/zero/rate-limit`    | Token-bucket rate limiting                         |
| `compressionMiddleware`   | `@pyreon/zero/compression`   | gzip/br via native `CompressionStream`             |
| `cspMiddleware`           | `@pyreon/zero/csp`           | Content-Security-Policy with per-request nonce     |
| `loggerMiddleware`        | `@pyreon/zero/logger`        | Structured request logging                         |

```ts
import { cacheMiddleware, securityHeaders } from '@pyreon/zero/cache'
import { corsMiddleware } from '@pyreon/zero/cors'
import { rateLimitMiddleware } from '@pyreon/zero/rate-limit'

cacheMiddleware({ immutable: 31536000, static: 86400, pages: 0, staleWhileRevalidate: 60 })
corsMiddleware({ origin: ['https://app.com'], credentials: true, maxAge: 86400 })
rateLimitMiddleware({ max: 20, window: 60, include: ['/api/*'] })
```

### CSP Nonce

```tsx
import { cspMiddleware } from '@pyreon/zero/csp'
import { useNonce } from '@pyreon/zero/server'

cspMiddleware({ directives: { 'default-src': ["'self'"], 'script-src': ["'self'", "'nonce'"] } })

function InlineScript() {
  return <script nonce={useNonce()}>console.log('safe')</script>
}
```

## API Routes

API routes are `.ts` files in `src/routes/api/` that export HTTP method handlers and return `Response` objects.

```ts title="src/routes/api/posts.ts"
import type { ApiContext } from '@pyreon/zero'

export function GET(ctx: ApiContext) {
  return Response.json([{ id: 1, title: 'Hello World' }])
}

export async function POST(ctx: ApiContext) {
  const body = await ctx.request.json()
  return Response.json({ id: 2, ...body }, { status: 201 })
}
```

| File                            | URL                  |
| ------------------------------- | -------------------- |
| `src/routes/api/posts.ts`       | `/api/posts`         |
| `src/routes/api/posts/[id].ts`  | `/api/posts/:id`     |
| `src/routes/api/[...path].ts`   | `/api/*` (catch-all) |

Wire them via the virtual module. They run before SSR and dispatch by URL + HTTP method; unsupported methods return `405` with an `Allow` header. API routes also work in dev (the plugin dispatches them in the dev server).

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

export default createServer({ routes, apiRoutes })
```

## Server Actions

Server-side mutations callable from the client, mounted at `/_zero/actions/*`.

```ts title="src/features/posts.ts"
import { defineAction } from '@pyreon/zero/actions'

export const createPost = defineAction(async (ctx) => {
  const { title, body } = ctx.json as { title: string; body: string }
  return { success: true, id: await db.posts.create({ title, body }) }
})
```

```ts title="src/entry-server.ts"
import { createActionMiddleware } from '@pyreon/zero/actions'
import { createServer } from '@pyreon/zero/server'

export default createServer({
  routes,
  middleware: [createActionMiddleware()],
})
```

Call them from components as plain async functions: `const r = await createPost({ title, body })`.

The `ActionContext` exposes `request`, `json` (parsed JSON body), `formData` (for `multipart/form-data`), and `headers`.

## SEO

`seoPlugin` (from `@pyreon/zero/seo` or `@pyreon/zero/server`) auto-generates `sitemap.xml` and `robots.txt` at build time:

```ts title="vite.config.ts"
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    seoPlugin({
      sitemap: { origin: 'https://example.com', changefreq: 'weekly', priority: 0.8 },
      robots: { rules: [{ userAgent: '*', allow: ['/'] }], sitemap: 'https://example.com/sitemap.xml' },
    }),
  ],
}
```

`generateSitemap(paths, config)`, `generateRobots(config)`, and `jsonLd(data)` are also exported for manual use. `seoMiddleware(config)` serves sitemap/robots in development. In SSG mode, the sitemap can be driven by the actual prerendered path set including dynamic and per-locale variants — see [SSG → Sitemap](/docs/ssg#sitemap-from-resolved-paths).

## Font Optimization

`fontPlugin` (`@pyreon/zero/font`) downloads Google Fonts at build time and self-hosts them; in dev it falls back to the CDN.

```ts title="vite.config.ts"
import { fontPlugin } from '@pyreon/zero/font'

export default {
  plugins: [
    fontPlugin({
      google: [
        'Inter:wght@400;500;700',
        { family: 'Fira Code', weights: [400, 700] },
        { family: 'Roboto Flex', weightRange: [100, 900], variable: true },
      ],
      local: [{ family: 'Custom Font', src: './fonts/custom.woff2', weight: 400 }],
      display: 'swap',
      preload: true,
      selfHost: true,
      fallbacks: { Inter: { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 0.9 } },
    }),
  ],
}
```

`fontVariables({ Inter: "'Inter', sans-serif" })` generates CSS custom properties.

### `usePreloadFont` — per-route runtime preload

For fonts that **aren't** in the global `fontPlugin` declaration — a route-specific display face, a conditionally-loaded variable font, a CDN-hosted brand font — use `usePreloadFont` to emit a `<link rel="preload" as="font">` into `<head>` at render time:

```ts
import { usePreloadFont } from '@pyreon/zero'

export default function HeroRoute() {
  usePreloadFont('/fonts/display-bold.woff2')
  return <h1 style="font-family: 'Display Bold'">…</h1>
}
```

Emitted tag (SSR-visible to the preload scanner):

```html
<link rel="preload" as="font" href="/fonts/display-bold.woff2" type="font/woff2" crossorigin="anonymous">
```

Subtleties handled automatically:

- **`crossorigin="anonymous"` is required** for every font preload — even same-origin. Without it, the CSS Fonts CORS rule forces a double-fetch (preload, then refetch under CORS). The helper sets it by default.
- **`type` is required** — preload-scanner ignores `as=font` without a matching MIME. Auto-inferred from the extension: `.woff2`/`.woff`/`.ttf`/`.otf`/`.eot`. Pass `type` to override.
- **Dedup** — two `usePreloadFont(href)` calls with the same href emit ONE preload (via `@pyreon/head`'s LinkTag href-keying).

Use `usePreloadFont` per-route; for fonts declared globally via `zero({ font: { google, local } })`, `fontPlugin` already emits the preload at build time.

## Image Processing

`imagePlugin` (`@pyreon/zero/image-plugin`) provides build-time image optimization via [sharp](https://sharp.pixelplumbing.com/) (copies as-is with a warning if sharp isn't installed). Import an image with `?optimize` to get a `ProcessedImage` (`{ src, srcset, width, height, placeholder, formats }`):

```ts title="vite.config.ts"
import { imagePlugin } from '@pyreon/zero/image-plugin'

export default {
  plugins: [
    imagePlugin({
      widths: [640, 1024, 1920], // default
      formats: ['avif', 'webp'], // default ['webp']
      quality: { avif: 55, webp: 75 }, // number OR per-format object — default 80
      placeholder: 'color', // 'blur' | 'color' | 'none' (default 'blur')
      placeholderSize: 16, // only used by the 'blur' strategy
    }),
  ],
}
```

```tsx
import hero from './images/hero.jpg?optimize'
import { Image, OptimizedImage } from '@pyreon/zero'

// Recommended — one prop, every field forwarded (nothing dropped)
;<OptimizedImage source={hero} alt="Hero" priority />

// Equivalent spread form
;<Image {...hero} alt="Hero" priority />
```

:::warning{title="Don't pull just `.src` onto a raw `<img>`"}
`<img src={hero.src} />` discards `width` / `height` / `srcset` / `placeholder` / `formats` — the #1 real-world cause of Cumulative Layout Shift. Render the whole descriptor via `<OptimizedImage source={hero} />` or `<Image {...hero} />`. The opt-in lint rule `pyreon/no-discarded-optimize-fields` (enable via the `best-practices` preset) flags the discard shape automatically in `@pyreon/zero` projects.
:::

**Typing the `?optimize` import.** `?optimize` (and `?component` / `?raw` for SVG) are custom Vite import queries — TypeScript doesn't know their shape by default. Zero ships the ambient declarations; add **one line** to any tsconfig-covered `.d.ts` (e.g. `src/env.d.ts`):

```ts
/// <reference types="@pyreon/zero/image-types" />
```

This makes `import hero from './x.jpg?optimize'` resolve to `ProcessedImage` (and `'./logo.svg?component'` to a component, `'./logo.svg?raw'` to a string) with zero hand-authored `declare module` blocks — the ambient reuses the plugin's own `ProcessedImage`, so it never drifts.

**Placeholder strategies:**

| Strategy           | Output                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `'blur'` (default) | Base64 blur data URI (size controlled by `placeholderSize`)                   |
| `'color'`          | The image's dominant color as a ~200-byte flat SVG data URI                   |
| `'none'`           | No placeholder (`placeholder: ''`) — skips all placeholder work               |

`'dominant-color'` is a deprecated alias of `'color'`. `quality` accepts a single number applied to all lossy formats, or a per-format object (`{ avif, webp, jpeg }`) — AVIF achieves comparable perceived quality at a much lower number than WebP/JPEG. Optional CDN delivery providers (`cloudinary`, `imgix`, `vercel`, `bunny`) are also available.

## Favicons

`faviconPlugin` (`@pyreon/zero/favicon`) generates the full favicon set from a **single source** (SVG or PNG) and injects every `<head>` tag automatically — no manual `<link>`/`<meta>` wiring. Like `imagePlugin`, it uses [sharp](https://sharp.pixelplumbing.com/) for image generation.

```ts title="vite.config.ts"
import { faviconPlugin } from '@pyreon/zero/favicon'

export default {
  plugins: [
    faviconPlugin({
      source: './src/assets/icon.svg', // required
      darkSource: './src/assets/icon-dark.svg', // optional — light/dark variants
      themeColor: '#6d28d9',
      name: 'My App', // web-manifest app name
      locales: { de: { source: './icon-de.svg' } }, // optional per-locale sets
    }),
  ],
}
```

Generated at build time and emitted into `dist/`: `favicon.ico` (16+32), `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `site.webmanifest`. The plugin injects the matching `<link rel="icon">` (SVG + PNG), `apple-touch-icon`, `manifest`, and `<meta name="theme-color">` into every page's `<head>`, plus media-conditioned light/dark links and a no-flash blocking script when `darkSource` is set. In dev the assets are served on the fly.

**Cache-busting.** Browsers cache favicons extremely aggressively (often per-session / effectively forever), so a stable URL means a changed icon is never re-fetched by returning visitors. Every injected `<link>` href carries a `?v=<hash>` derived from the **source file content** — same bytes produce the identical query (no needless cache churn), changed bytes produce a new query so the browser re-downloads. This is orthogonal to theme-reactive favicons (the light/dark swap toggles the `media` attribute, not `href`). Two URLs intentionally stay stable and rely on host cache headers instead: the bare `/favicon.ico` (browsers request it by convention with no `<link>` tag) and the `site.webmanifest`'s internal `icons[]` entries (re-resolved on PWA (re)install). Set a long `Cache-Control` on `/favicon.ico` at your host if you change it.

**`sharp` is required.** It is an optional peer install — add it explicitly:

```bash
bun add -D sharp   # or: npm i -D sharp
```

In **dev**, a missing `sharp` is a one-time console warning (favicons just don't appear locally — iteration isn't blocked). In a **production `vite build`**, a configured `source` with `sharp` missing is a **hard, actionable build error** — the build fails rather than silently shipping a site with zero favicons. To intentionally build without favicons, remove `faviconPlugin()` from your Vite plugins.

**Cache-busting.** Browsers cache favicons extremely aggressively (often per-session / effectively forever), so a stable URL means a changed icon is never re-fetched by returning visitors. The injected `<link>` hrefs therefore carry a `?v=<hash>` query derived from the **source file content** (FNV-1a): identical bytes → identical query (no needless cache churn), changed bytes → new query → the browser re-downloads. This is orthogonal to light/dark switching (the theme swap toggles each link's `media` attribute, not its `href`). **Caveat:** only `<link>`/manifest-referenced assets are versioned. The bare `/favicon.ico` convention request (browsers fetch it with no link tag) and the `site.webmanifest`'s internal icon entries keep stable URLs — those rely on your host's cache headers / are re-resolved on PWA (re)install.

## Environment Validation

```ts
import { validateEnv, schema, publicEnv } from '@pyreon/zero/env'

const env = validateEnv({
  PORT: 3000, // number with default
  DEBUG: false, // boolean with default
  API_KEY: String, // required string
  ALLOWED_ORIGINS: schema((v) => v.split(',')), // custom parser
})

const pub = publicEnv() // only PUBLIC_-prefixed vars (safe for client bundles)
```

## App Assembly APIs

These come from `@pyreon/zero/server` (`createApp`, `createServer`) and `@pyreon/zero/client` (`startClient`).

### createApp

Assembles router + head provider + root layout. Returns `{ App, router }`.

```tsx
import { createApp } from '@pyreon/zero/server'

const { App, router } = createApp({
  routes, // from virtual:zero/routes
  routerMode: 'history', // "history" (default) | "hash"
  url: '/', // initial URL (SSR/SSG)
  base: '/blog/', // optional — see Base Path
  errorComponent: GlobalError, // optional global error boundary
})
```

### createServer

Production SSR request handler.

```ts
import { createServer } from '@pyreon/zero/server'

export default createServer({
  routes,
  apiRoutes, // optional — run before SSR
  routeMiddleware, // optional — per-route middleware from the virtual module
  middleware: [securityHeaders(), cacheMiddleware()],
  config: { mode: 'ssr' },
  template: indexHtml, // optional HTML template override
  clientEntry: '/src/main.tsx', // optional
})
```

### startClient

Client-side hydration / mount.

```ts
import { startClient } from '@pyreon/zero/client'

startClient({ routes })
```

`startClient` auto-detects whether to hydrate (SSR-rendered HTML present) or mount fresh (SPA). It also reads the Vite-injected `__ZERO_BASE__` so the router prefix matches the SSR/build output. With fs-router, never pass `layout` to `startClient`.

## Base Path

`zero({ base: '/blog/' })` is the **single source of truth** for subpath deploys. It propagates to:

1. **Vite's `base`** — asset URLs in built HTML/JS get the prefix (`<script src="/blog/assets/...">`).
2. **`createRouter({ base })`** — RouterLink hrefs render prefixed (`<a href="/blog/about">`), incoming URLs are `stripBase`d.
3. **SSG render + `startClient`** — the SSR sub-build and client both read `__ZERO_BASE__` so hydration matches.

A user's explicit `vite.config.base` still wins (Vite merge semantics: plugin config is the base). The on-disk `dist/` layout stays **unprefixed** (`dist/about/index.html`) — the host serves `dist/` mounted at `/blog/`.

## Deployment Adapters

Adapters tailor build output per platform. Resolve from config (string name or constructed instance) or call directly. All adapter functions come from `@pyreon/zero/server`.

```ts
import { resolveAdapter, nodeAdapter, vercelAdapter } from '@pyreon/zero/server'

defineConfig({ adapter: 'vercel' }) // or adapter: vercelAdapter()
```

| Adapter      | SSR build                                  | SSG build                                              |
| ------------ | ------------------------------------------ | ------------------------------------------------------ |
| `node`       | Node HTTP server output                    | no-op                                                  |
| `bun`        | Bun HTTP server output                     | no-op                                                  |
| `static`     | Static HTML/CSS/JS                         | no-op (dist already final)                             |
| `vercel`     | `.vercel/output` (Build Output API v3)     | `.vercel/output/config.json` (static variant)          |
| `cloudflare` | Cloudflare Pages + Workers                 | `_routes.json` static config                           |
| `netlify`    | Netlify Functions (streaming)              | `netlify.toml` / static config                         |

`vercel`/`cloudflare`/`netlify` also implement `Adapter.revalidate(path)` for build-time ISR — see [SSG → Build-time ISR](/docs/ssg#build-time-isr-per-route-revalidate). `static`/`node`/`bun` implement `revalidate` as a no-op.

The adapter's `build()` receives a discriminated `AdapterBuildOptions`: `{ kind: 'ssr', serverEntry, clientOutDir, outDir, config }` or `{ kind: 'ssg', outDir, config }`. **Auto-invoked by mode**: SSG mode (`ssgPlugin`) calls `adapter.build({ kind: 'ssg', … })` after every path renders; SSR/ISR modes (`ssrPlugin`) bundle the SSR handler to `dist/server/entry-server.js` and call `adapter.build({ kind: 'ssr', … })`. SPA mode ships only a client bundle (no adapter.build call).

### SSR/ISR build

When `mode: 'ssr'` or `mode: 'isr'` is set, the build pipeline also produces a server bundle at `dist/server/entry-server.js`:

- If you have a `src/entry-server.ts` (the standard hand-written entry — useful when you ship `securityHeaders()` / `cacheMiddleware()` / custom `ssr.mode` overrides / `actions: { corsOrigins }` config), the plugin uses **that file** as the bundle entry.
- Otherwise the plugin synthesizes the canonical entry `import { routes } from "virtual:zero/routes"; … export default createServer({ routes, routeMiddleware, apiRoutes })` automatically — no setup required.

After the bundle lands the configured adapter's `build({ kind: 'ssr', … })` is invoked so platform adapters (vercel/cloudflare/netlify) can wrap it into a deployable serverless function. The recursive SSR sub-build uses `PYREON_ZERO_SSR_INNER_BUILD` as its env-flag gate (distinct from SSG's `PYREON_ZERO_SSG_INNER_BUILD`) so the two modes can never collide.

## ISR Handler (runtime)

For custom runtime ISR outside `mode: 'isr'`, use `createISRHandler` (`@pyreon/zero/server`) directly:

```ts
import { createISRHandler } from '@pyreon/zero/server'

const handler = createISRHandler(
  async (req) => new Response(await renderPage(req), { headers: { 'Content-Type': 'text/html' } }),
  { revalidate: 60, maxEntries: 1000, cacheKey: (req) => new URL(req.url).pathname },
)
```

In-memory LRU cache with stale-while-revalidate. Cached responses carry `x-isr-cache: HIT|STALE|MISS` and `x-isr-age` headers.

## Other Build-Time Plugins

| Plugin / API     | Import path                | Purpose                                               |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| `faviconPlugin`  | `@pyreon/zero/favicon`     | Per-locale favicon generation; `faviconLinks` helper  |
| `ogImagePlugin`  | `@pyreon/zero/og-image`    | Build-time Open Graph image generation                |
| `aiPlugin`       | `@pyreon/zero/ai`          | Generates `llms.txt`, JSON-LD inference, AI manifest  |
| `iconsPlugin`    | `@pyreon/zero/server`      | Scan an icon dir → typed `<Icon name>` set            |
| `i18nRouting`    | `@pyreon/zero/server`      | Request-time locale detection middleware              |

```ts
import { faviconPlugin } from '@pyreon/zero/favicon'
import { ogImagePlugin } from '@pyreon/zero/og-image'

faviconPlugin({ source: './icon.svg', locales: { de: { source: './icon-de.svg' } } })
ogImagePlugin({ templates: { default: './og-template.tsx' }, locales: { en: { title: 'My App' } } })
```

## i18n

Two independent layers, both keyed off the same `I18nRoutingConfig`:

- **Request-time detection** — `i18nRouting(config)` Vite plugin + client hooks `useLocale()` / `setLocale(locale, config)` (client-safe from `@pyreon/zero`), plus server helpers `createLocaleContext` / `detectLocaleFromHeader` (`@pyreon/zero/server`).
- **Build-time route duplication** — `zero({ i18n: { locales, defaultLocale, strategy } })` fans every route into per-locale variants for SSG. Documented in **[SSG → i18n](/docs/ssg#i18n-localized-routes)**.

```tsx
import { useLocale, setLocale } from '@pyreon/zero'

function LocaleSwitcher() {
  const locale = useLocale()
  return <button onClick={() => setLocale('de', i18nConfig)}>{locale} → Deutsch</button>
}
```

`I18nRoutingConfig`: `{ locales, defaultLocale, detectLocale?, cookieName?, strategy? }`. Strategy is `'prefix'` (every locale prefixed, including default) or `'prefix-except-default'` (default — default locale keeps clean URLs).

## Request Locals

Bridge middleware locals into the component tree:

```tsx
import { useRequestLocals } from '@pyreon/server'

// middleware: ctx.locals.user = authenticatedUser
function Dashboard() {
  const user = useRequestLocals().user as User
  return <h1>Welcome, {user.name}</h1>
}
```

## Testing Utilities

From `@pyreon/zero/testing`:

```ts
import { testMiddleware, createTestApiServer, createMockHandler, createTestContext } from '@pyreon/zero/testing'

const { headers } = await testMiddleware(corsMiddleware({ origin: '*' }), '/api/posts')

const server = createTestApiServer([{ pattern: '/api/posts', module: { GET: () => Response.json([]) } }])
const res = await server.request('/api/posts')
```

## Subpath Exports

| Import Path                | Exports                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `@pyreon/zero`             | Client-safe: `Image`, `Link`, `Script`, `Icon`, `Meta`, `island`, `serverIsland`, `activateServerIslands`, theme, i18n hooks, types |
| `@pyreon/zero/server`      | `createServer`, `createApp`, `defineConfig`, `resolveConfig`, adapters, `seoPlugin`, `aiPlugin`, `ogImagePlugin`, `iconsPlugin`, `i18nRouting`, `vercelRevalidateHandler`, fs-router helpers, `createISRHandler`, `createFsStore`, `createMemoryStore`, default = `zeroPlugin` |
| `@pyreon/zero/client`      | `startClient`                                                                        |
| `@pyreon/zero/config`      | `defineConfig`, `resolveConfig`                                                       |
| `@pyreon/zero/image`       | `Image`, `useImage`, `createImage`                                                   |
| `@pyreon/zero/link`        | `Link`, `useLink`, `createLink`, `prefetchRoute`                                     |
| `@pyreon/zero/script`      | `Script`, `useScript`, `createScript`                                                |
| `@pyreon/zero/meta`        | `Meta`, `buildMetaTags`                                                              |
| `@pyreon/zero/theme`       | Theme signals + `ThemeToggle`                                                         |
| `@pyreon/zero/font`        | `fontPlugin`, `fontVariables`                                                         |
| `@pyreon/zero/image-plugin`| `imagePlugin`                                                                        |
| `@pyreon/zero/cache`       | `cacheMiddleware`, `securityHeaders`, `varyEncoding`                                  |
| `@pyreon/zero/seo`         | `seoPlugin`, `seoMiddleware`, `generateSitemap`, `generateRobots`, `jsonLd`           |
| `@pyreon/zero/actions`     | `defineAction`, `createActionMiddleware`                                              |
| `@pyreon/zero/api-routes`  | API route utilities, `createApiMiddleware`                                            |
| `@pyreon/zero/cors`        | `corsMiddleware`                                                                     |
| `@pyreon/zero/rate-limit`  | `rateLimitMiddleware`                                                                 |
| `@pyreon/zero/compression` | `compressionMiddleware`                                                              |
| `@pyreon/zero/csp`         | `cspMiddleware`                                                                       |
| `@pyreon/zero/env`         | `validateEnv`, `schema`, `publicEnv`                                                  |
| `@pyreon/zero/logger`      | `loggerMiddleware`                                                                   |
| `@pyreon/zero/favicon`     | `faviconPlugin`, `faviconLinks`                                                       |
| `@pyreon/zero/og-image`    | `ogImagePlugin`, `ogImagePath`                                                        |
| `@pyreon/zero/ai`          | `aiPlugin`, `inferJsonLd`, `generateLlmsTxt`, `generateLlmsFullTxt`                   |
| `@pyreon/zero/i18n-routing`| `useLocale`, `setLocale`, `buildLocalePath`, `extractLocaleFromPath`                  |
| `@pyreon/zero/testing`     | Test helpers for middleware + API routes                                             |

:::info
There are no `@pyreon/zero/adapter-*` or `@pyreon/zero/isr` subpaths. Adapters and `createISRHandler` are exported from `@pyreon/zero/server`.
:::

## Next Steps

- **[SSG reference](/docs/ssg)** — static generation, dynamic routes, redirects, i18n, build-time ISR, adapters, error handling.
- **[Router](/docs/router)** — the routing primitives Zero is built on.
- **[Create Zero](/docs/create-zero)** — project scaffolding.
