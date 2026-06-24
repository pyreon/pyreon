---
title: Server-Side Rendering & ISR
description: The complete @pyreon/zero SSR / ISR reference — build pipeline, loaders, render modes, runtime caching, adapter dispatch, and deployment.
---

This is the dedicated reference for `@pyreon/zero`'s server-side rendering. SSR is a feature of the **`@pyreon/zero`** meta-framework — there is no separate `@pyreon/ssr` package. For the general Zero overview (routing, components, middleware, theme), see **[Zero](/docs/zero)**. For pre-rendering pages at build time, see **[SSG](/docs/ssg)**. Two adjacent server-rendering features are documented on the Zero page: **[Server Islands](/docs/zero#server-islands)** (cacheable pages with per-request server-rendered holes) and **[Server Loaders](/docs/zero#server-loaders)** (`.server.ts` data loaders that never ship to the client).

When `mode: "ssr"` or `mode: "isr"` is set, `vite build` runs the normal client build, then `ssrPlugin`'s `closeBundle` hook spins up a programmatic Vite SSR sub-build of either your `src/entry-server.ts` (if it exists) or a synthetic entry, and writes `dist/server/entry-server.js`. The configured adapter's `build({ kind: 'ssr', … })` is then invoked so platform adapters (node / bun / vercel / cloudflare / netlify) can wrap the bundle into whatever the target platform expects.

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssr' })],
}
```

:::info
`zeroPlugin()` returns `[mainPlugin, ssrPlugin]` for `mode: 'ssr' | 'isr'` (just `[mainPlugin]` for SPA, `[mainPlugin, ssgPlugin]` for SSG). `plugins: [pyreon(), zero()]` works unchanged — Vite flattens nested plugin arrays.
:::

## Where configuration lives

There are two distinct config surfaces, and the distinction is load-bearing for SSR:

1. **`zero({ ... })` in `vite.config.ts`** — controls the *build* (which mode, which adapter, base path, SSG paths, image/font wiring). This is where `mode: 'ssr' | 'isr'` is selected.
2. **`createServer({ config: { ... } })` in `src/entry-server.ts`** — controls *runtime rendering* (streaming vs buffered, the live `ISRConfig`, request middleware).

:::warning{title="Runtime config does NOT flow into the synthetic entry"}
The auto-generated synthetic entry calls `createServer({ routes, routeMiddleware, apiRoutes })` with **no `config`**. So options that only the runtime handler reads — `ssr: { mode: 'stream' }` and the entire `isr: { ... }` block — are **ignored unless you author your own `src/entry-server.ts` and pass them via `config`**. `zero({ mode: 'isr' })` in `vite.config.ts` enables the ISR *wrapper* (with `{ revalidate: 60 }` defaults), but `cacheKey`, `store`, `tagsForRequest`, etc. only take effect when passed to `createServer`. The "synthetic-vs-user-entry contract" section below shows the shape.
:::

## When to use SSR vs SSG / SPA / ISR

| Mode      | Render timing                          | Use for                                                                                              |
| --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **SSR**   | Every request, on the server           | Per-request personalization, fresh data, auth-gated pages                                            |
| **SSG**   | Build time → static HTML               | Content that rarely changes — see [SSG](/docs/ssg)                                                   |
| **SPA**   | In the browser only                    | Apps behind a login where SEO / first-paint HTML doesn't matter                                      |
| **ISR**   | Cached SSR with stale-while-revalidate | High-traffic pages that tolerate brief staleness — see [below](#isr-incremental-static-regeneration) |

Per-route override: any route file may `export const renderMode = 'ssg' | 'ssr' | 'spa' | 'isr'` to opt a single route in or out independent of the global mode (see [Per-route renderMode](#per-route-rendermode-override)).

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

$ node dist/index.js
#   ⚡ Zero production server running on http://localhost:3000
```

The build emits, before the adapter stages it:

- `dist/` — the client bundle (HTML shell + JS / CSS assets / static files)
- `dist/server/entry-server.js` — the compiled SSR handler
- `dist/server/template.html` — the built `index.html` (with its hashed client `<script>`) copied next to the bundle so the production handler hydrates

The configured adapter then **restructures** this tree for its target platform (see [Adapter dispatch](#adapter-dispatch)). With the default `node` adapter the runnable artifact is `dist/index.js` (an `http` server wrapper), with the client staged into `dist/client/` and the bundle into `dist/server/`.

:::warning{title="The default adapter changes the run command"}
The build log line `[zero:ssr] Built dist/server/entry-server.js` reports where the *bundle* landed — not how you *run* it. The `node` adapter emits a `dist/index.js` HTTP wrapper (run `node dist/index.js`), the `bun` adapter emits `dist/index.ts` (run `bun run dist/index.ts`), and the CDN adapters produce platform-native entry points. Run the artifact the adapter produced, not the raw bundle.
:::

## The synthetic-vs-user-entry contract

The framework looks for `src/entry-server.ts` and uses **that file** as the SSR bundle entry when present. Author it when you need to:

- pass runtime `config` — `ssr: { mode: 'stream' }` for streaming, or the full `isr: { ... }` block
- ship request middleware (`securityHeaders()`, `cacheMiddleware()`, `varyEncoding()` from `@pyreon/zero/cache`)
- configure `actions: { corsOrigins }`
- construct the ISR handler yourself with `createISRHandler` to expose its imperative invalidation methods

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
import { securityHeaders, cacheMiddleware, varyEncoding } from '@pyreon/zero/cache'

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  config: { ssr: { mode: 'stream' } },
  middleware: [securityHeaders(), cacheMiddleware({ staleWhileRevalidate: 120 }), varyEncoding()],
})
```

If no `src/entry-server.ts` exists, the framework materializes the canonical shape automatically — **note it passes no `config`**:

```ts
// synthetic entry — created by ssrPlugin, removed after build
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
export default createServer({ routes, routeMiddleware, apiRoutes })
```

The synthetic entry is cleaned up after the build completes. A user-authored `src/entry-server.ts` is **never** removed — the cleanup discipline only deletes files the plugin created.

:::tip{title="Why per-mode env flag"}
The recursive SSR sub-build is gated by `PYREON_ZERO_SSR_INNER_BUILD` (distinct from SSG's `PYREON_ZERO_SSG_INNER_BUILD`). The inner build loads the SAME plugin chain as the outer build, so without a gate the outer plugin's `closeBundle` would re-trigger inside the inner build → infinite loop. Per-mode flag namespaces eliminate the cross-mode flag-leak failure class structurally.
:::

## Loaders

Route files export a `loader` that runs at SSR time before rendering. The result is serialized into the HTML, then hydrated on the client so the first render has the data without a fetch waterfall. The same loader runs on client-side navigation and at SSG build time — one data-loading API across every mode.

```tsx title="src/routes/posts/[id].tsx"
import { useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'

interface PostData {
  post: { title: string; body: string }
}

export const loader = async ({ params }: LoaderContext): Promise<PostData> => {
  const res = await fetch(`https://api.example.com/posts/${params.id}`)
  return { post: await res.json() }
}

export default function PostPage() {
  const { post } = useLoaderData<PostData>()
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  )
}
```

:::warning{title="useLoaderData takes the DATA type, not typeof loader"}
`useLoaderData<T>()` is generic over the loader's *return* type (`useLoaderData<PostData>()`), not the loader function (`useLoaderData<typeof loader>()` does not infer correctly). Declare the loader's return shape as a named type and pass it to both `loader(): Promise<T>` and `useLoaderData<T>()`.
:::

### LoaderContext shape

The argument every loader receives is `LoaderContext` (re-exported from `@pyreon/zero` and `@pyreon/router`):

| Field     | Type                       | Notes                                                                                                          |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `params`  | `Record<string, string>`   | URL params from the route pattern (`/posts/[id]` → `params.id`)                                                |
| `query`   | `Record<string, string>`   | Parsed query string as a plain object (NOT a `URLSearchParams`)                                                |
| `signal`  | `AbortSignal`              | Aborted when a newer navigation supersedes this one — pass to `fetch(url, { signal })` to cancel stale loads   |
| `request` | `Request \| undefined`     | The incoming Web `Request`. Read cookies / `Authorization` here. **Populated only during SSR** — `undefined` on every client-side navigation |

`redirect` and `notFound` are **not** members of `LoaderContext` — they are standalone functions imported from `@pyreon/router` (see below).

### Per-request auth

```tsx
import { redirect } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'

export const loader = async ({ request }: LoaderContext) => {
  const session = request?.headers.get('cookie')?.match(/session=([^;]+)/)?.[1]
  if (!session) redirect('/login') // throws — nothing after this runs
  return { user: await fetchUser(session) }
}
```

`redirect(url, status?)` throws a redirect error (it returns `never`); writing `redirect(...)` IS the throw, you do not need `throw` in front of it. Default status is `307` (Temporary Redirect, method-preserving); pass `301`/`308` for permanent moves or `302`/`303` to force GET on the target.

`notFound(message?)` throws the not-found error that triggers the 404 boundary.

### Loader-thrown redirects

The SSR pipeline catches `redirect()` BEFORE rendering — no layout HTML is sent to the client. The handler returns a real HTTP `302` / `307` response with a `Location:` header. Server-side, this is the only way to redirect without leaking authenticated UI structure to anonymous users (an `onMount` + client navigate briefly paints the auth-gated layout first).

## ISR (Incremental Static Regeneration)

`mode: 'isr'` wraps the SSR handler with a stale-while-revalidate in-memory cache. The first request for a key MISSes and renders fresh; subsequent requests within the revalidation window serve the cached HTML as a HIT; once stale, the cached HTML is still served immediately while a fresh render runs in the background (the next request gets the updated entry).

Because the runtime cache config lives on `createServer`, configuring anything beyond the defaults requires a `src/entry-server.ts`:

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  config: {
    mode: 'isr',
    isr: {
      revalidate: 60, // seconds before a cached entry is considered stale
      maxEntries: 1000, // LRU cap on the in-memory cache (default 1000)
      // cacheKey defaults to `url.pathname + url.search`
    },
  },
})
```

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'isr' })],
}
```

With the synthetic entry (no `src/entry-server.ts`) the ISR layer still activates with `{ revalidate: 60 }` defaults, but `cacheKey` / `store` / `tagsForRequest` etc. cannot be supplied.

### ISRConfig reference

Pass these inside `isr: { ... }` on `createServer({ config })`. `revalidate` is the only required field.

| Field                 | Type                                            | Default               | Purpose                                                                              |
| --------------------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `revalidate`          | `number`                                        | — (required)          | Seconds before a cached entry is considered stale                                    |
| `maxEntries`          | `number`                                        | `1000`                | LRU cap on the default in-memory store (ignored when `store` is set)                 |
| `cacheKey`            | `(req) => string`                               | `pathname + search`   | Cache-key derivation (see [Cache key](#cache-key--two-trade-offs))                   |
| `store`               | `ISRStore`                                       | in-memory `Map`       | Pluggable backing store (Redis / KV / filesystem)                                    |
| `tagsForRequest`      | `(req) => string[] \| Promise<string[]>`        | none                  | Tags recorded at cache-set time for `revalidateTag` group invalidation               |
| `revalidateTimeoutMs` | `number`                                        | `30000`               | Max wall-time for one background revalidation before it's abandoned + aborted        |
| `revalidateRequest`   | `(req) => Request \| null`                      | the original request  | Construct the request used for background revalidation; `null` skips revalidation    |
| `responseFilter`      | `(res) => Response \| null`                     | none                  | Final say on cacheability; `null` bypasses cache for that render                     |

### Cache key — two trade-offs

The default cache key is `url.pathname + url.search`. Query strings vary the cache (`/posts?id=42` vs `?id=99` are correctly distinct). **Cookies and `Authorization` headers are NOT included by default.**

:::danger{title="Auth-gated content leaks across users with the default key"}
If a loader reads `cookie` / `Authorization`, the default key serves the *first* user's rendered HTML to every other user (the URL is identical). Either use plain `mode: 'ssr'` for those routes, or supply a `cacheKey` that varies on the session identifier:

```ts
isr: {
  revalidate: 60,
  cacheKey: (req) => {
    const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
    return `${new URL(req.url).pathname}::${session}`
  },
}
```
:::

:::warning{title="High-cardinality query params explode the cache"}
Analytics tokens (`utm_*`, `fbclid`, `gclid`, `mc_eid`) generate one cache entry per click variant under the default key. For routes that ignore the query string entirely, strip it:

```ts
isr: { revalidate: 60, cacheKey: (req) => new URL(req.url).pathname }
```
:::

A one-time dev-mode warning fires at handler init when no `cacheKey` is configured — it names both fixes inline. The warning is deduped per handler instance (a busy CMS won't spam logs) and tree-shakes to zero bytes in production via the standard `process.env.NODE_ENV !== 'production'` gate.

### What is and isn't cached

The handler refuses to cache a render whose response matches any of these disqualifiers — the entry is passed through verbatim with an `x-isr-cache: BYPASS` header and is NOT stored, so it can't be replayed as a `200` to later visitors:

- non-`2xx` status (transient errors / redirects)
- a `Set-Cookie` header (per-user session state)
- `Cache-Control: private | no-store | no-cache` (RFC 7234)
- an `Authorization` response header
- `Vary: Cookie | Authorization | *` **without** an explicit `cacheKey` (with a `cacheKey` you've opted into per-user keying, so this is allowed)

`responseFilter` is the final-say override — return the response to cache it, or `null` to bypass:

```ts
isr: {
  revalidate: 60,
  responseFilter: (res) => (res.headers.get('x-page-type') === 'marketing' ? res : null),
}
```

### Response headers

Every ISR response carries diagnostics:

| Header        | Values                          | Meaning                                                      |
| ------------- | ------------------------------- | ----------------------------------------------------------- |
| `x-isr-cache` | `MISS`                          | Rendered fresh and stored (first request for the key)       |
|               | `HIT`                           | Served from cache, still fresh                               |
|               | `STALE`                         | Served from cache past the window; a background re-render fired |
|               | `BYPASS`                        | Not cacheable (see disqualifiers) — passed through verbatim |
| `x-isr-age`   | seconds                         | Age of the served cache entry                               |

### Pluggable backing store

The default in-memory `Map` is per-process. Multi-instance deploys (load-balanced Node, autoscaled containers) need a SHARED store so a revalidation in one instance is visible to all. Any object matching the `ISRStore` interface from `@pyreon/zero/server` works:

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

// in src/entry-server.ts
createServer({ routes, config: { mode: 'isr', isr: { revalidate: 60, store } } })
```

The store interface accepts BOTH sync and async returns — the in-memory default stays cheap (no Promise allocation per request), while a Redis store returns its native promises. When `store` is set, `maxEntries` is ignored (the custom store owns its own eviction / TTL policy). `delete`, `clear`, `setTags`, and `keysByTag` are optional; omitting them disables the corresponding imperative-invalidation method (which then throws a clear error naming the missing method).

For single-box node/bun deploys, the framework ships **`createFsStore(dir)`** — one JSON file per entry plus a tag-index sidecar, so the cache survives server restarts (the in-memory default means every restart is a cold cache + a thundering herd on your origin):

```ts
import { createFsStore } from '@pyreon/zero/server'

createServer({
  routes,
  config: { mode: 'isr', isr: { revalidate: 60, store: createFsStore('.cache/isr') } },
})
```

Both shipped stores (`createMemoryStore`, `createFsStore`) implement the full surface including tag support; `createFsStore` is per-box, so multi-instance deploys still want a shared Redis / KV store.

### Imperative invalidation

When you construct the ISR handler yourself with `createISRHandler(handler, config)`, the returned callable carries methods for webhook / CMS-driven cache busting — strictly more responsive than waiting for the TTL cycle:

| Method                  | Returns                       | Drops                                                                            |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `revalidateNow(key)`    | `{ dropped: boolean }`        | A single key (the next request for it MISSes and re-renders fresh)               |
| `revalidateAll()`       | `void`                        | Every entry (requires a store implementing `clear()`)                            |
| `revalidateTag(tag)`    | `{ dropped: number }`         | Every entry carrying `tag` (requires a store implementing `setTags`/`keysByTag`) |

Tag-based invalidation is the webhook-ergonomic unit — "a post changed → drop every page that rendered posts" — without enumerating concrete paths. Record tags at cache-set time with `tagsForRequest`, then drop by tag:

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer, createISRHandler } from '@pyreon/zero/server'

const ssr = createServer({ routes, apiRoutes })

export const isrHandler = createISRHandler(ssr, {
  revalidate: 60,
  tagsForRequest: (req) => (new URL(req.url).pathname.startsWith('/blog') ? ['posts'] : []),
})

export default isrHandler

// in a webhook handler, somewhere with access to `isrHandler`:
await isrHandler.revalidateTag('posts') // → { dropped: n }
```

:::warning{title="The handler is typed as a plain request function"}
`createServer` returns its handler typed as `(req) => Promise<Response>` — the ISR invalidation methods are erased from the type. To call `revalidateNow` / `revalidateAll` / `revalidateTag`, construct the ISR handler yourself with `createISRHandler` (as above) and keep your own reference to it; the plain `mode: 'isr'` path on `createServer` does not expose them.
:::

### Build-time ISR

Build-time ISR (per-route `export const revalidate = 60` + platform-driven rebuild-on-stale via `Adapter.revalidate(path)`) is a **separate** mechanism documented in [SSG → Build-time ISR](/docs/ssg#build-time-isr-per-route-revalidate). The two can coexist: a `mode: 'isr'` app with per-route `revalidate` exports gets BOTH runtime caching AND deploy-time ISR config.

## Streaming

:::warning{title="Buffered is the default — streaming is opt-in"}
SSR renders in **buffered (`'string'`) mode by default** — the full HTML is produced, then sent in one response. Streaming is **not** automatic: the synthetic entry passes no config, and `createServer` only streams when `config.ssr.mode === 'stream'` (or `config.mode === 'ssr'` reaches the handler). To stream, author `src/entry-server.ts` and pass `config: { ssr: { mode: 'stream' } }`.
:::

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

export default createServer({
  routes,
  apiRoutes,
  config: { ssr: { mode: 'stream' } },
})
```

In streaming mode, chunked transfer encoding sends the HTML shell + `<head>` immediately, then streams each Suspense boundary as its data resolves:

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

Streaming improves Time-To-First-Byte for pages with slow data — Suspense boundaries are independent, so a slow one doesn't block earlier chunks. The default per-boundary timeout is `30000` ms; an unresolved boundary keeps its fallback. The node/bun server entries pipe the response body straight to the socket, so out-of-order boundaries reach the client as they resolve rather than being buffered to the end.

:::note{title="ISR stays buffered regardless"}
The SWR cache stores complete response bodies, so caching a stream would either drain it (defeating streaming) or store nothing (defeating caching). `mode: 'isr'` therefore always renders in buffered mode — including per-route `renderMode: 'isr'` routes inside an otherwise-streaming app, which transparently use a separate buffered handler.
:::

## Per-route renderMode override

Any route file can override the global mode independently. The effective mode for a path is the nearest matched record that declares one (a page's own declaration beats its layout's, and a layout's cascades to descendants), falling back to the app-level `mode`:

```tsx title="src/routes/blog/index.tsx"
// This page is statically prerendered even though the app is mode: 'ssr'
export const renderMode = 'ssg'

export default function BlogIndex() {
  /* ... */
}
```

Available values: `'ssr' | 'isr' | 'ssg' | 'spa'`. Common patterns:

- `mode: 'ssr'` globally, `renderMode: 'ssg'` on marketing pages → fast static landing pages served from disk
- `mode: 'ssr'` globally, `renderMode: 'spa'` on a client-heavy editor route → ship the CSR shell, render client-side
- `mode: 'isr'` globally, `renderMode: 'ssr'` on a dashboard → per-route cache bypass

:::warning{title="A static app cannot opt routes UP to a server mode"}
The direction matters. A server-mode app (`mode: 'ssr'` / `'isr'`) can opt routes DOWN to `'ssg'` / `'spa'`. But under `mode: 'ssg'` or `'spa'` — which builds a static deploy with **no server** — a route declaring `renderMode: 'ssr'` or `'isr'` is a hard **build error** (`assertModesSupported` throws, naming the offending route + the fix). There is nothing to render it at request time. Fix: set the global mode to `'ssr'` / `'isr'` so a server bundle is emitted — per-route `'ssg'` / `'spa'` declarations keep those routes static.
:::

When NO route declares a divergent mode, the build and runtime both take the zero-change fast path (the plain app-level handler). One resolver (`resolveRenderModeForPath`) is shared by the build and the runtime, so the prerendered set and the request-time dispatch can never disagree.

## 404 handling

A `src/routes/_404.tsx` (or `_not-found.tsx`) is auto-registered as the not-found component. SSR returns HTTP `404` for unmatched URLs and renders the component **inside the parent layout's chrome** (header, sidebar, navigation, `<PyreonUI>` provider) via the same router-driven render path as regular pages.

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

:::info{title="Framework auto-injects noindex"}
The framework injects `<meta name="robots" content="noindex, nofollow">` into every emitted 404 HTML — runtime AND build-time. The `<Meta>` component's default of `'index, follow'` is correct for regular pages but wrong on a 404. A deliberate `<Meta robots="noindex, ...">` in your `_404.tsx` is preserved. See [SSG → 404 handling](/docs/ssg#_404-tsx-convention) for the host-routing requirement under prefixed URLs.
:::

## Adapter dispatch

After the SSR bundle lands, the configured adapter's `build({ kind: 'ssr', serverEntry, clientOutDir, outDir, config, assetsDir })` runs. Each adapter **stages** the client + server into the layout its platform expects and writes the platform's entry point + routing config. Select the adapter by name or by constructed instance:

```ts title="vite.config.ts"
import zero from '@pyreon/zero/server'
import { vercelAdapter } from '@pyreon/zero/server'

// string form:
zero({ mode: 'ssr', adapter: 'vercel' })
// instance form (what the scaffolds emit):
zero({ mode: 'ssr', adapter: vercelAdapter() })
```

| Adapter      | Client staged to              | Server staged to               | Entry point + config emitted                                  |
| ------------ | ----------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `node`       | `dist/client/`                | `dist/server/`                 | `dist/index.js` (`http` server) + `dist/package.json`         |
| `bun`        | `dist/client/`                | `dist/server/`                 | `dist/index.ts` (`Bun.serve`)                                 |
| `vercel`     | `.vercel/output/static/`      | `.vercel/output/functions/ssr.func/` | `index.js` + `.vc-config.json` (nodejs20.x) + `config.json` (v3) |
| `cloudflare` | dist root (left flat)         | `dist/_server/`                | `_worker.js` + `_routes.json` + `_headers`                    |
| `netlify`    | `dist/publish/`               | `dist/netlify/functions/_server/` | `netlify/functions/ssr.mjs` + `netlify.toml`               |
| `static`     | `outDir` (no restructuring)   | —                              | none — packages the client only (does NOT error in SSR mode)  |

:::warning{title="`static` does not error in SSR mode"}
The `static` adapter is a client-only output packager — under `mode: 'ssr' | 'isr'` it copies the client to `outDir` and ignores the server bundle (the SSR bundle is still emitted on disk by `ssrPlugin`, just unused). The build error you might expect comes from a *different* mechanism: declaring a per-route `renderMode: 'ssr' | 'isr'` inside a `mode: 'ssg'` / `'spa'` app (`assertModesSupported`). For a true static deploy, use `mode: 'ssg'` — see [SSG](/docs/ssg).
:::

:::warning{title="Adapter throws are NOT rethrown"}
If the adapter's `build()` throws, the framework logs the error but the SSR bundle remains on disk at `dist/server/entry-server.js`. This is intentional — a buggy adapter can't hide a successful SSR build from CI, and you can still hand-deploy the bundle even if `vercel deploy` would fail. (The SSR *bundle build* failing, by contrast, IS fatal.)
:::

Hashed assets under `/<assetsDir>/` (default `/assets/`) get a 1-year `immutable` cache; HTML always revalidates; other static files get a short default. The CDN adapters scope this rule to `<base><assetsDir>` so subpath / custom-`assetsDir` deploys still cache correctly. The self-hosted node/bun servers serve files by raw pathname (no base-stripping), so a subpath deploy isn't supported there.

## Per-platform deployment

### Node (self-host)

```sh
$ vite build           # adapter defaults to node
$ node dist/index.js   # http server; honors $PORT (default 3000)
```

The emitted server serves static + prerendered files first, falling through to the SSR handler. Routes declaring `renderMode = 'ssg'` are listed in `_pyreon-ssg-paths.json` and served straight from disk (no SSR render); a missing file falls through to SSR gracefully.

### Bun (self-host)

```sh
$ vite build              # with adapter: 'bun'
$ bun run dist/index.ts   # Bun.serve; honors $PORT (default 3000)
```

```ts title="vite.config.ts"
import { bunAdapter } from '@pyreon/zero/server'
zero({ mode: 'ssr', adapter: bunAdapter() })
```

### Vercel

`adapter: 'vercel'` produces `.vercel/output/` (Build Output API v3): client assets in `static/`, the SSR serverless function in `functions/ssr.func/` (runtime `nodejs20.x`), and a `config.json` routing the asset prefix to long-cache and everything else to the function. Deploy with `vercel deploy` or push to a connected Git repo.

```ts title="vite.config.ts"
import { vercelAdapter } from '@pyreon/zero/server'
zero({ mode: 'ssr', adapter: vercelAdapter() })
```

For platform-driven build-time ISR, `vercelAdapter().revalidate(path)` POSTs to a deployment revalidation endpoint reading `VERCEL_DEPLOYMENT_URL` (auto-injected) + `VERCEL_REVALIDATE_TOKEN` (set in dashboard).

### Cloudflare Pages

`adapter: 'cloudflare'` leaves the client at the dist root, stages the SSR bundle into `dist/_server/`, and emits `_worker.js` + `_routes.json` + `_headers`. Deploy with `wrangler pages deploy ./dist` or via the Pages git integration.

```ts title="vite.config.ts"
import { cloudflareAdapter } from '@pyreon/zero/server'
zero({ mode: 'ssr', adapter: cloudflareAdapter() })
```

Cloudflare runs in **workerd, not Node**, so two requirements apply:

- **`nodejs_compat` is required.** The SSR bundle imports Node builtins (`node:async_hooks` for per-request context isolation — instantiated at module load, so **without the flag the worker fails to start** — and `node:fs`). The create-zero cloudflare scaffold sets it:

  ```toml title="wrangler.toml"
  compatibility_date = "2026-01-01"
  compatibility_flags = ["nodejs_compat"]
  pages_build_output_dir = "dist"
  ```

  A hand-rolled deploy must set it in the Pages dashboard (Settings → Functions → Compatibility flags) or `wrangler.toml`, or pass `--compatibility-flags nodejs_compat` to `wrangler pages dev`.

- **The SSR template is inlined automatically.** workerd has no filesystem, so the adapter inlines the built `template.html` (with its hashed client `<script>`) into a global in `_worker.js` at build time and reads it from there at runtime — there's nothing to configure. Without this, SSR pages would render but never hydrate (they'd reference the dev client entry). This is transparent; it's documented here only so the larger `_worker.js` is expected.

  Cloudflare Pages Functions have a ~1 MB module size limit. For large apps, set `ssr: { noExternal: true }` in `vite.config.ts` so server deps bundle into the worker.

### Netlify

`adapter: 'netlify'` stages the client to `dist/publish/`, the SSR bundle to `dist/netlify/functions/_server/`, and emits the function entry `netlify/functions/ssr.mjs` (Functions v2 — Web-standard `Request`/`Response`, `preferStatic: true`) plus a `netlify.toml` routing `/*` to the function. Deploy with `netlify deploy`.

```ts title="vite.config.ts"
import { netlifyAdapter } from '@pyreon/zero/server'
zero({ mode: 'ssr', adapter: netlifyAdapter() })
```

Netlify's `revalidate(path)` triggers a Build Hook (full-site rebuild — Netlify has no per-page ISR API); the path is recorded as the hook's `trigger_title` for audit traceability.

## Migration paths

### From SSG → SSR

When your content starts depending on per-request data (auth, personalization, fresh API state):

1. Change `mode: 'ssg'` → `mode: 'ssr'` (or `'isr'` for SSR + caching) in `vite.config.ts`
2. Move `getStaticPaths` → `loader` (params come from `params` in `LoaderContext` instead of being enumerated at build time)
3. Drop the `dist/<path>/index.html` deploy step; deploy the adapter's emitted artifact instead (`node dist/index.js`, the Vercel function, etc.)
4. Keep `_404.tsx` and `_layout.tsx` — the same shapes work across all modes

Per-route opt-in is the gentler path: keep `mode: 'ssg'` and add `export const renderMode = 'ssr'` to the one route that needs it.

### From SSR → ISR

When you outgrow the per-request render cost but the content can tolerate brief staleness:

1. Change `mode: 'ssr'` → `mode: 'isr'` in `vite.config.ts`
2. Author `src/entry-server.ts` (if you don't already have one) and pass `config: { mode: 'isr', isr: { revalidate: 60 } }` — the synthetic entry can't carry `isr` config
3. **If your loaders read cookies / `Authorization`**, supply a `cacheKey` that varies on the session identifier — the auto-warning at handler init names this trade-off
4. **If your URLs have high-cardinality query params** (`utm_*`, `fbclid`), supply `cacheKey: (req) => new URL(req.url).pathname` to strip them
5. Consider a shared `store` (Redis / KV) for multi-instance deploys, or `createFsStore` for a single box

### From Next.js / Remix

| Next.js / Remix concept             | Pyreon equivalent                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getServerSideProps`                | `export const loader` (`mode: 'ssr'`)                                                            |
| `getStaticProps`                    | `export const loader` (results cached via SSG mode)                                              |
| `getStaticPaths`                    | Same name, same shape — see [SSG → Dynamic routes](/docs/ssg#dynamic-routes-getstaticpaths)      |
| `revalidate: N` in `getStaticProps` | `export const revalidate = N` per route — see [SSG → Build-time ISR](/docs/ssg#build-time-isr-per-route-revalidate) |
| `unstable_cache` / on-demand revalidation | `mode: 'isr'` runtime caching + `revalidateTag` / `revalidateNow`                          |
| `app/api/*` (App Router)            | `src/routes/api/*.ts` — see [Zero → API Routes](/docs/zero#api-routes)                            |
| `next/link` `<Link>`                | `<Link>` from `@pyreon/zero`                                                                      |
| `next/image` `<Image>`              | `<Image>` from `@pyreon/zero/image`                                                               |
| `redirect()` from `next/navigation` | `redirect(url, status?)` from `@pyreon/router`                                                    |
| `notFound()` from `next/navigation` | `notFound()` from `@pyreon/router`                                                                |

:::tip{title="Single render pipeline"}
Pyreon uses ONE rendering pipeline across all four modes. The same `loader` works in SSR, ISR, SSG (run at build), and SPA (run client-side via the dehydrated cache). No `getServerSideProps` vs `getStaticProps` split, no App Router vs Pages Router split. Per-route `renderMode` is the only opt-in.
:::
