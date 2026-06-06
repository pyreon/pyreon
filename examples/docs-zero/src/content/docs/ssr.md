---
title: Server-Side Rendering & ISR
description: The complete @pyreon/zero SSR / ISR reference — auto-build pipeline, loaders, streaming, runtime caching, adapter dispatch, and deployment.
---

This is the dedicated reference for `@pyreon/zero`'s server-side rendering. For the general Zero overview (routing, components, middleware, theme), see **[Zero](/docs/zero)**. For pre-rendering pages at build time, see **[SSG](/docs/ssg)**.

When `mode: "ssr"` or `mode: "isr"` is set, `vite build` runs the normal client build, then `ssrPlugin`'s `closeBundle` hook spins up a programmatic Vite SSR sub-build of either your `src/entry-server.ts` (if it exists) or a synthetic entry, and writes `dist/server/entry-server.js`. The configured adapter's `build({ kind: 'ssr', … })` is invoked so platform adapters (vercel / cloudflare / netlify) can wrap the bundle into a deployable serverless function.

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssr' })],
}
```

::: info
`zeroPlugin()` returns `[mainPlugin, ssrPlugin]` for `mode: 'ssr' | 'isr'` (just `[mainPlugin]` for SPA, `[mainPlugin, ssgPlugin]` for SSG). `plugins: [pyreon(), zero()]` works unchanged — Vite flattens nested plugin arrays.
:::

## When to use SSR vs SSG / SPA / ISR

| Mode      | Render timing                       | Use for                                                              |
| --------- | ----------------------------------- | -------------------------------------------------------------------- |
| **SSR**   | Every request, on the server        | Per-request personalization, fresh data, auth-gated pages            |
| **SSG**   | Build time → static HTML            | Content that rarely changes — see [SSG](/docs/ssg)                   |
| **SPA**   | In the browser only                 | Apps behind a login where SEO / first-paint HTML doesn't matter      |
| **ISR (runtime)** | Cached SSR with stale-while-revalidate | High-traffic pages that tolerate brief staleness — see [below](#isr-incremental-static-regeneration) |

Per-route override: any route file may `export const renderMode = 'ssg'` / `'ssr'` / `'spa'` / `'isr'` to opt a single route in or out independent of the global mode.

## Setup

The minimum:

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssr' })],
}
```

Build → run:

```sh
$ vite build
[zero:ssr] Built dist/server/entry-server.js [adapter: node] (synthetic entry)

$ node dist/server/entry-server.js
# or via the adapter's deploy path — see Deployment below
```

The build emits two trees:

- `dist/` — the client bundle (HTML shell + JS / CSS assets / static files)
- `dist/server/entry-server.js` — the SSR handler

A platform adapter takes both as input and produces whatever the platform expects (Vercel function, Cloudflare worker, Netlify edge function, etc.).

## The synthetic-vs-user-entry contract

The framework looks for `src/entry-server.ts` and uses **that file** as the SSR bundle entry when present. Use this when you need to:

- ship custom middleware (`securityHeaders()`, `cacheMiddleware()`, `varyEncoding()`)
- override `ssr.mode: 'stream'`
- configure `actions: { corsOrigins }`
- wrap `createServer({...})` in a request-logging or tracing decorator

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
import { securityHeaders } from './middleware/security-headers'

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  middleware: [securityHeaders()],
})
```

If no `src/entry-server.ts` exists, the framework materializes the canonical 6-line shape automatically:

```ts
// synthetic entry — created by ssrPlugin, removed after build
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
export default createServer({ routes, routeMiddleware, apiRoutes })
```

The synthetic entry is cleaned up after the build completes. A user-authored `src/entry-server.ts` is **never** removed — the cleanup discipline only deletes files the plugin created.

::: tip Why per-mode env flag
The recursive SSR sub-build is gated by `PYREON_ZERO_SSR_INNER_BUILD` (distinct from SSG's `PYREON_ZERO_SSG_INNER_BUILD`). The inner build loads the SAME plugin chain as the outer build, so without a gate the outer plugin's `closeBundle` would re-trigger inside the inner build → infinite loop. Per-mode flag namespaces eliminate the cross-mode flag-leak failure class structurally.
:::

## Loaders

Route files export a `loader` that runs at SSR time before rendering. The result is serialized into the HTML, then hydrated on the client so the first-render UI has the data without a fetch waterfall.

```tsx title="src/routes/posts/[id].tsx"
import type { LoaderContext } from '@pyreon/zero/server'

export const loader = async ({ params, request }: LoaderContext) => {
  const post = await fetch(`https://api.example.com/posts/${params.id}`)
  return { post: await post.json() }
}

export default function PostPage() {
  const { post } = useLoaderData<typeof loader>()
  return <article><h1>{post.title}</h1><p>{post.body}</p></article>
}
```

### LoaderContext shape

- `params: Record<string, string>` — URL params from the route pattern
- `query: URLSearchParams` — parsed query string
- `request: Request` — the original Web `Request`. Read cookies / Authorization headers here for auth-gated content. **Only populated during SSR** — `undefined` on every client-side navigation.
- `redirect(url, status?)` — throw to redirect (default 307, method-preserving)
- `notFound()` — throw to trigger the 404 boundary

### Per-request auth

```tsx
export const loader = async ({ request, redirect }: LoaderContext) => {
  const session = request?.headers.get('cookie')?.match(/session=([^;]+)/)?.[1]
  if (!session) throw redirect('/login')
  return { user: await fetchUser(session) }
}
```

### Loader-thrown redirects

The SSR pipeline catches `redirect()` BEFORE rendering — no layout HTML is sent to the client. The handler returns a real HTTP 302 / 307 response with a `Location:` header. Server-side, this is the only way to redirect without leaking authenticated UI structure to anonymous users.

## ISR (Incremental Static Regeneration)

`mode: 'isr'` combines SSR with stale-while-revalidate in-memory caching at request time. Pages are served from cache and regenerated in the background after the revalidation window.

```ts
defineConfig({
  mode: 'isr',
  isr: {
    revalidate: 60,    // seconds before a cached entry is considered stale
    maxEntries: 1000,  // LRU cap on the in-memory cache (default 1000)
    // cacheKey defaults to `url.pathname + url.search`
  },
})
```

### Cache key — two trade-offs

The default cache key is `url.pathname + url.search`. Query strings vary the cache (the `/posts?id=42` vs `?id=99` shape is correctly distinct). **Cookies and Authorization headers are NOT included by default** — auth-gated content still requires an explicit `cacheKey`.

**Auth-gated content** (loader reads `cookie` / `Authorization`): the default is unsafe — the first user's cached HTML serves every other user. Supply a `cacheKey` that varies on the session identifier:

```ts
isr: {
  revalidate: 60,
  cacheKey: (req) => {
    const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
    return `${new URL(req.url).pathname}::${session}`
  },
}
```

**High-cardinality query params** (analytics tokens like `utm_*`, `fbclid`, `gclid`): the default causes cache explosion (one entry per click variant). For routes that ignore query strings entirely, strip them:

```ts
isr: {
  revalidate: 60,
  cacheKey: (req) => new URL(req.url).pathname,
}
```

A one-time dev-mode warning fires at handler init when no `cacheKey` is configured — it names both fixes inline. Production builds tree-shake the warning to zero bytes via the standard `process.env.NODE_ENV !== 'production'` gate.

### Pluggable backing store

The default in-memory `Map` is per-process. Multi-instance deploys (load-balanced Node, autoscaled containers, edge functions) need a SHARED store:

```ts
import type { ISRStore } from '@pyreon/zero/server'
import Redis from 'ioredis'

const redis = new Redis()
const store: ISRStore = {
  async get(key) {
    const v = await redis.get(`isr:${key}`)
    return v ? JSON.parse(v) : undefined
  },
  async set(key, entry) {
    await redis.set(`isr:${key}`, JSON.stringify(entry), 'EX', 86400)
  },
  async delete(key) {
    await redis.del(`isr:${key}`)
  },
}

defineConfig({ mode: 'isr', isr: { revalidate: 60, store } })
```

The handler `await`s every store call — the in-memory default stays cheap (no Promise allocation per request), while a Redis store hits real network promises naturally. When `store` is set, `maxEntries` is ignored (custom store owns its eviction policy).

### Build-time ISR

Build-time ISR (per-route `export const revalidate = 60` + platform-driven rebuild-on-stale) is a **separate** mechanism documented in [SSG → Build-time ISR](/docs/ssg#build-time-isr-per-route-revalidate). The two can coexist: a `mode: 'isr'` app with per-route `revalidate` exports gets BOTH runtime caching AND deploy-time ISR config.

## 404 handling

A `src/routes/_404.tsx` (or `_not-found.tsx`) is auto-registered as the not-found component. SSR returns HTTP 404 for unmatched URLs and renders the component **inside the parent layout's chrome** (header, sidebar, navigation, `<PyreonUI>` provider) — same router-driven render path as regular pages.

```tsx title="src/routes/_404.tsx"
import { Meta } from '@pyreon/zero'

export default function NotFound() {
  return (
    <>
      <Meta title="Page not found" />
      <main>
        <h1>404 — Page not found</h1>
        <p>The page you requested doesn't exist.</p>
      </main>
    </>
  )
}
```

::: info Framework auto-injects noindex
The framework injects `<meta name="robots" content="noindex, nofollow">` into every emitted 404 HTML — runtime AND build-time. The `<Meta>` component's default of `'index, follow'` is correct for regular pages but wrong on a 404. User override always wins: if your `_404.tsx` emits `<Meta robots="...">`, the framework preserves it. See [SSG → 404 handling](/docs/ssg#_404-tsx-convention) for the host-routing requirement.
:::

## Per-route renderMode override

Any route file can override the global mode independently:

```tsx title="src/routes/blog/index.tsx"
// This page is statically prerendered even though the app is mode: 'ssr'
export const renderMode = 'ssg'

export default function BlogIndex() { ... }
```

Available values: `'ssr' | 'isr' | 'ssg' | 'spa'`. Common patterns:

- `mode: 'ssr'` globally, `renderMode: 'ssg'` on marketing pages → fast static landing pages
- `mode: 'ssg'` globally, `renderMode: 'ssr'` on `/dashboard` → mostly-static site with one personalized page

## Streaming

Set `ssr.mode: 'stream'` to use chunked transfer encoding. The framework sends the HTML shell + `<head>` immediately, then streams Suspense boundaries as their data resolves:

```ts
defineConfig({
  mode: 'ssr',
  ssr: { mode: 'stream' }, // default is 'string' (buffered)
})
```

```tsx
import { Suspense } from '@pyreon/core'

export default function ProductPage() {
  return (
    <Layout>
      {/* Above-the-fold renders in the initial chunk */}
      <Hero />
      <Suspense fallback={<RelatedSkeleton />}>
        {/* Streams when the loader resolves */}
        <RelatedProducts />
      </Suspense>
    </Layout>
  )
}
```

Streaming improves Time-To-First-Byte (TTFB) for pages with slow data. Suspense boundaries are independent — a slow one doesn't block earlier chunks. The 30-second timeout applies per-boundary; an unresolved boundary keeps its fallback.

## Adapter dispatch

The configured adapter's `build({ kind: 'ssr', serverEntry, clientOutDir, outDir, config })` is invoked after the SSR bundle lands. Each adapter wraps the bundle for its target platform:

| Adapter      | Output                                              | Read at deploy time                    |
| ------------ | --------------------------------------------------- | -------------------------------------- |
| `node`       | `dist/server/entry-server.js` (default — no wrap)   | `node dist/server/entry-server.js`     |
| `bun`        | Same — Bun runs ESM natively                        | `bun run dist/server/entry-server.js`  |
| `vercel`     | `.vercel/output/` v3 config + serverless function   | `vercel deploy`                        |
| `cloudflare` | `_worker.js` + `_routes.json` for Pages Functions   | `wrangler pages publish dist`          |
| `netlify`    | `netlify/functions/server.mjs` + `netlify.toml`     | `netlify deploy`                       |
| `static`     | **Errors** if mode is `ssr` or `isr`                | Use `ssg` mode for static deploys      |

::: warning Adapter throws are NOT rethrown
If the adapter's `build()` throws, the framework logs the error but the SSR bundle remains on disk at `dist/server/entry-server.js`. This is intentional — a buggy adapter can't hide a successful SSR build from CI. You can still hand-deploy the bundle via `node dist/server/entry-server.js` even if `vercel deploy` would fail.
:::

## Per-platform deployment

### Node / Bun (self-host)

```sh
$ vite build
$ node dist/server/entry-server.js
# Server listens on PORT env var (default 3000)
```

### Vercel

`adapter: 'vercel'` produces `.vercel/output/config.json` (v3) + the serverless function. Deploy with `vercel deploy` or push to a connected Git repo.

```ts
import { vercelAdapter } from '@pyreon/zero/server'

defineConfig({
  mode: 'ssr',
  adapter: vercelAdapter(),
})
```

### Cloudflare Pages

`adapter: 'cloudflare'` produces `_worker.js` + `_routes.json`. Deploy with `wrangler pages publish dist` or via the Pages git integration.

```ts
import { cloudflareAdapter } from '@pyreon/zero/server'

defineConfig({
  mode: 'ssr',
  adapter: cloudflareAdapter(),
})
```

**Cloudflare runs in workerd (not Node), so two requirements apply:**

- **`nodejs_compat` is required.** The SSR bundle imports Node builtins (`node:async_hooks` for per-request context isolation — instantiated at module load, so **without the flag the worker fails to start** — and `node:fs`). The create-zero cloudflare scaffold sets it for you:

  ```toml
  # wrangler.toml
  compatibility_date = "2026-01-01"
  compatibility_flags = ["nodejs_compat"]
  pages_build_output_dir = "dist"
  ```

  A hand-rolled deploy must set it in the Pages dashboard (Settings → Functions → Compatibility flags) or `wrangler.toml`, or pass `--compatibility-flags nodejs_compat` to `wrangler pages dev`.

- **The SSR template is inlined automatically.** workerd has no filesystem, so the adapter inlines the built `index.html` (with its hashed client-entry `<script>`) into `_worker.js` at build time and reads it from a global at runtime — there's nothing to configure. Without this, SSR pages would render but never hydrate (they'd reference the dev client entry). This is transparent; it's documented here only so the larger `_worker.js` is expected.

### Netlify

`adapter: 'netlify'` produces `netlify/functions/server.mjs` + a `netlify.toml` redirect for `/* → /.netlify/functions/server`. Deploy with `netlify deploy`.

```ts
import { netlifyAdapter } from '@pyreon/zero/server'

defineConfig({
  mode: 'ssr',
  adapter: netlifyAdapter(),
})
```

## Migration paths

### From SSG → SSR

When your content starts depending on per-request data (auth, personalization, fresh API state):

1. Change `mode: 'ssg'` → `mode: 'ssr'` (or `'isr'` for SSR + caching)
2. Move `getStaticPaths` → `loader` (params come from `params` in `LoaderContext` instead of being enumerated at build time)
3. Drop `dist/<path>/index.html` deploy step; deploy `dist/server/entry-server.js` instead via your chosen adapter
4. Keep `_404.tsx` and `_layout.tsx` — same shapes work across all modes

Per-route opt-in is the gentler path: keep `mode: 'ssg'` and add `export const renderMode = 'ssr'` to the one route that needs it.

### From SSR → ISR

When you outgrow the per-request render cost but the content can tolerate brief staleness:

1. Change `mode: 'ssr'` → `mode: 'isr'`
2. Add `isr: { revalidate: 60 }` (or whatever staleness window your content tolerates)
3. **If your loaders read cookies / Authorization headers**, supply ``cacheKey: (req) => `${pathname}::${session}` `` — the auto-warning at handler init names this trade-off
4. **If your URLs have high-cardinality query params** (`utm_*`, `fbclid`), supply `cacheKey: (req) => new URL(req.url).pathname` to strip them
5. Consider a shared `store` (Redis / KV) for multi-instance deploys

### From Next.js / Remix

| Next.js / Remix concept              | Pyreon equivalent                                       |
| ------------------------------------ | ------------------------------------------------------- |
| `getServerSideProps`                 | `export const loader`                                   |
| `getStaticProps`                     | `export const loader` (results cached via SSG mode)     |
| `getStaticPaths`                     | Same name, same shape — see [SSG → Dynamic routes](/docs/ssg#dynamic-routes-getstaticpaths) |
| `revalidate: N` in getStaticProps    | `export const revalidate = N` per route                 |
| `app/api/*` (Next.js App Router)     | `src/routes/api/*.ts` — see [Zero → API Routes](/docs/zero#api-routes) |
| `next/link` `<Link>`                 | `<Link>` from `@pyreon/zero`                            |
| `next/image` `<Image>`               | `<Image>` from `@pyreon/zero/image`                     |
| `unstable_cache`                     | ISR runtime caching (`mode: 'isr'`) or external cache layer |
| `redirect()` from `next/navigation`  | `redirect(url, status?)` from `LoaderContext`           |
| `notFound()` from `next/navigation`  | `notFound()` from `LoaderContext`                       |

::: tip Single render pipeline
Pyreon uses ONE rendering pipeline across all four modes. The same `loader` works in SSR, ISR, SSG (run at build), and SPA (run client-side via the dehydrated cache). No `getServerSideProps` vs `getStaticProps` split, no App Router vs Pages Router split. Per-route `renderMode` is the only opt-in.
:::
