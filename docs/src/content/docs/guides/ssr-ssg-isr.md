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

```ts
import { zero } from '@pyreon/zero'

export default {
  plugins: [pyreon(), zero({ mode: 'ssg' })],
}
```

## Per-route / hybrid rendering

Export `renderMode` from any route or layout to override the app default (it cascades to descendants):

```ts
// src/routes/dashboard.tsx — server-render just this route inside an SSG site
export const renderMode = 'ssr'
```

One resolver drives both build and runtime, so they never disagree. Inside an SSG app, an `'ssr'`/`'isr'` route declaration is a build error (a static deploy has no server) — the error names the route and the fix.

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

```ts
// per-route revalidation window (seconds)
export const revalidate = 3600
```

ISR keys the cache by `pathname + search` by default. **For auth-gated pages, supply `cacheKey`** so one user's HTML isn't served to another:

```ts
createISRHandler(handler, { cacheKey: (req) => `${new URL(req.url).pathname}::${sessionOf(req)}` })
```

## Common pitfalls

- **`mode: 'ssr'`/`'isr'` route in an SSG app.** Build error by design — a static deploy has no server.
- **Dynamic route without `getStaticPaths` under SSG.** Silently skipped (no HTML emitted). `pyreon doctor --check-ssg` and the `missing-get-static-paths` lint rule catch it.
- **`revalidate` as a non-literal.** `export const revalidate = TTL` is dropped from the build manifest — inline the number: `export const revalidate = 3600`.
- **ISR on an auth page without `cacheKey`.** Leaks one user's cached HTML to others. Supply `cacheKey`.

## Related

- [Zero guide](/docs/zero) · [SSG reference](/docs/ssg) · [SSR & ISR](/docs/ssr)
- [Islands & Partial Hydration](/docs/guides/islands)
- [Deploying a Pyreon App](/docs/guides/deployment)
