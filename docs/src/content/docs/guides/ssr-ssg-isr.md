---
title: "SSR, SSG & ISR"
description: "How to choose and configure rendering modes in a @pyreon/zero app — static (SSG), server-rendered (SSR), incremental (ISR), or SPA — including per-route hybrid rendering."
---

# SSR, SSG & ISR

`@pyreon/zero` renders your app four ways, app-wide or **per route**:

- **SSG** (`'ssg'`) — prerender to static HTML at build time. Fastest, cheapest, CDN-friendly.
- **SSR** (`'ssr'`) — render on each request. For per-request/auth-gated/personalized pages.
- **ISR** (`'isr'`) — render on first request, cache with TTL, revalidate in the background.
- **SPA** (`'spa'`) — ship a client shell, render entirely in the browser.

## Choosing a mode

- Content that's the same for everyone and changes at build time → **SSG**.
- Content that depends on the request (cookies, auth, query) → **SSR**.
- Mostly-static content that updates periodically → **ISR**.
- A dashboard behind a login with no SEO needs → **SPA**.

## App-wide mode

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssg' })],
}
```

`zero` is the **default** export of `@pyreon/zero/server` — not a named export, and not importable from the client-safe main `@pyreon/zero` entry (which has no `node:fs` access and can't build routes). `mode` defaults to `'ssr'` when omitted.

## Per-route / hybrid rendering

Export `renderMode` from any route or layout to override the app default (it cascades to descendants that don't declare their own):

```ts
// src/routes/dashboard.tsx — server-render just this route inside an SSG site
export const renderMode = 'ssr'
```

One resolver (`resolveRenderModeForPath`/`collectRouteModes`) drives both the SSG build filter and the runtime dispatch, so they never disagree — leaf wins over layout, and a route-file export always wins over the two mechanisms below. Inside an SSG app, an `'ssr'`/`'isr'` route declaration is a build error (a static deploy has no server) — the error names the route and the fix.

### `routeRules` — central overrides without touching route files

`zero({ routeRules })` applies a render mode to every route matching a glob that has **no** `renderMode` export of its own — handy for retrofitting a policy across many routes at once:

```ts
zero({
  mode: 'ssg',
  routeRules: {
    '/blog/**': { renderMode: 'isr' }, // every depth under /blog
    '/admin/*': { renderMode: 'spa' }, // exactly one segment under /admin
  },
})
```

`*` matches one path segment, `**` matches any depth (including zero). Matching is most-specific-first (exact path > more segments > `*` over `**`). Precedence: **route-file `export const renderMode` > `routeRules` > app `mode`.** An impossible combo (e.g. a rule declaring `'ssr'` inside a `mode: 'ssg'` app) fails the build exactly like a route-file declaration would, naming the offending rule.

### `mode: 'auto'` (EXPERIMENTAL) — infer per route from exports

Pass `mode: 'auto'` to `zero()` and every route's mode is **inferred** from what it exports, instead of defaulting to the app mode:

- `export const revalidate` → `'isr'`
- `export const getStaticPaths` → `'ssg'` (an enumerator is a static-intent signal, even alongside a `loader` — SSG runs loaders at build)
- `loader` / `serverLoader` / `guard` / `middleware` → `'ssr'`
- otherwise → `'ssg'`

An explicit `renderMode` export or a `routeRules` match still wins. `mode: 'auto'` widens only `zero()`'s own parameter — `ZeroConfig.mode` (what `resolveConfig`/`defineConfig` accept) never carries `'auto'`; it's resolved to a concrete app-level mode (`'ssr'` if any page needs server rendering, else `'ssg'`) once, up front, at plugin-factory time. The build's per-route mode table shows `'auto'` as the app mode plus each route's inferred value, so the inference is always visible, never silent.

## SSG: static paths

Dynamic routes need to enumerate their concrete URLs at build time:

```ts
// src/routes/posts/[id].tsx
export const getStaticPaths = () => [
  { params: { id: 'hello' } },
  { params: { id: 'world' } },
]
```

Catch-all routes use `{ params: { slug: 'a/b' } }` → `/blog/a/b`. A `_404.tsx` co-located with `_layout.tsx` is emitted as `dist/404.html` with layout chrome.

## ISR caching

There are **two separate ISR mechanisms**, both named `revalidate` — different enforcement points, deliberately the same word ("how stale may this page get"):

1. **Build-time, per-route `export const revalidate`** — a route file export. It feeds a build-time `dist/_pyreon-revalidate.json` manifest that a platform adapter (Vercel/Netlify/Cloudflare) reads for its own rebuild-on-stale primitive. Must be a pure literal — inlining a variable or expression is silently dropped (see pitfalls below).

   ```ts
   // src/routes/posts/[id].tsx
   export const revalidate = 3600 // seconds
   ```

2. **Runtime `mode: 'isr'` + `zero({ isr })`** — an in-memory (or pluggable-store) stale-while-revalidate cache the request goes through on every hit:

   ```ts
   zero({
     mode: 'isr',
     isr: { revalidate: 60, maxEntries: 1000 },
   })
   ```

   ISR keys the cache by `pathname + search` by default. Cookies/Authorization are **not** included by default — a request that arrives WITH credentials is fail-safe by default (not cached, re-rendered every time) unless the response marks itself `Cache-Control: public`. **For a cacheable auth-gated page, supply `cacheKey`** so one user's HTML isn't served to another:

   ```ts
   zero({
     mode: 'isr',
     isr: {
       revalidate: 60,
       cacheKey: (req) => `${new URL(req.url).pathname}::${sessionOf(req)}`,
     },
   })
   ```

   The same `ISRConfig` shape drives `createISRHandler` directly (`@pyreon/zero/server`) if you're wiring the cache around your own handler outside `mode: 'isr'`:

   ```ts
   import { createISRHandler } from '@pyreon/zero/server'

   const handler = createISRHandler(
     async (req) => new Response(await renderPage(req)),
     { revalidate: 60, cacheKey: (req) => `${new URL(req.url).pathname}::${sessionOf(req)}` },
   )
   ```

## Common pitfalls

- **`mode: 'ssr'`/`'isr'` route in an SSG app.** Build error by design — a static deploy has no server.
- **Dynamic route without `getStaticPaths` under SSG.** No page is emitted for it — the build prints a `[Pyreon] SSG: dynamic route "…" has no \`getStaticPaths\`` warning naming the fix (enumerate it, hand-list it in `ssg.paths`, or declare `renderMode = 'spa'` if the client shell is intended). Also caught earlier, at edit time, by `pyreon doctor --check-ssg` and the `pyreon/missing-get-static-paths` lint rule.
- **`revalidate` as a non-literal.** `export const revalidate = TTL` is dropped from the build manifest silently (only a pure numeric/`false` literal is captured) — inline the number: `export const revalidate = 3600`. The `pyreon/revalidate-not-pure-literal` lint rule catches this at edit time.
- **Confusing the two `revalidate` knobs.** A route file's `export const revalidate` is build-time-only (the platform-manifest signal) and does NOT set the runtime ISR TTL — `zero({ isr: { revalidate } })` is the separate runtime knob.
- **ISR on an auth-reading page without a custom `cacheKey` FUNCTION.** No longer leaks by default (the fail-safe default refuses to cache a credentialed request unless the response is `Cache-Control: public`) — but it silently degrades to uncached-per-request SSR, and the build warns when it detects a cookie/Authorization read on an ISR route with no custom `cacheKey`. Supply a `cacheKey` that varies on the session identifier to actually cache it.

## Related

- [Zero guide](/docs/zero) · [SSG reference](/docs/ssg) · [SSR & ISR](/docs/ssr)
- [Islands & Partial Hydration](/docs/guides/islands)
- [Deploying a Pyreon App](/docs/guides/deployment)
