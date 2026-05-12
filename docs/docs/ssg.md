# Static Site Generation (SSG)

Prerender every route to HTML at build time. The dist/ directory is fully static — deployable to any CDN (Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront, Vercel static) with no Node/Bun runtime required.

[[toc]]

## When to use SSG

| Mode | Render time | Server needed | Best for |
| --- | --- | --- | --- |
| `'ssg'` | Build time | No (static host) | Marketing sites, blogs, docs, content that rarely changes |
| `'ssr'` | Per request | Yes (Node/Bun) | Personalized content, frequently-updated pages, auth-gated views |
| `'isr'` | First request + cache | Yes (Node/Bun) | Content that's mostly stable but needs occasional refresh |
| `'spa'` | Client only | No (static host) | Apps where SEO isn't a concern + initial paint can wait for JS |

Pick `'ssg'` when the page's HTML can be computed at build time and is identical for every visitor. Reach for `'isr'` or `'ssr'` once any rendered HTML varies by user or changes between deploys.

The canonical reference example is [`examples/cpa-pw-blog`](https://github.com/pyreon/pyreon/tree/main/examples/cpa-pw-blog) — exercises `getStaticPaths`, build-time ISR via `revalidate`, the Vercel revalidate handler, `_404.tsx`, sitemap auto-emit, RSS feed via API route, and theme.

## Quick start

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssg' })],
}
```

```tsx
// src/routes/index.tsx
export default function Home() {
  return <h1>Hello, world</h1>
}

// src/routes/about.tsx
export default function About() {
  return <h1>About</h1>
}
```

```bash
bun run build
```

```text
dist/
├── index.html          # from src/routes/index.tsx
├── about/
│   └── index.html      # from src/routes/about.tsx
└── assets/             # hashed JS / CSS bundles
```

Drop `dist/` on any static host. Done.

## Static routes — auto-detection

When `mode: 'ssg'` is set, `vite build` runs the regular client build, then a programmatic SSR sub-build, then renders every static route to `dist/<path>/index.html`. The `ssg.paths` config field accepts three shapes:

```ts
zero({
  mode: 'ssg',
  ssg: {
    // Explicit list (most common)
    paths: ['/', '/about', '/blog'],

    // Or a function returning paths
    paths: () => ['/', '/about'],

    // Or async — fetch from a CMS / database
    paths: async () => {
      const posts = await fetch('https://cms.example.com/posts').then((r) => r.json())
      return ['/', '/blog', ...posts.map((p) => `/blog/${p.slug}`)]
    },
  },
})
```

Omitting `ssg.paths` triggers **auto-detection**: every route file under `src/routes/` without a `:param` or `*` catch-all segment is included. A single `/` fallback is always produced so the static host has an `index.html`.

Dynamic routes (`[id].tsx`, `[...slug].tsx`) are NOT picked up by auto-detection — they need `getStaticPaths` (next section).

## Dynamic routes — `getStaticPaths`

Dynamic routes enumerate their concrete `params` values via a per-route export:

```tsx
// src/routes/posts/[id].tsx
import type { GetStaticPaths } from '@pyreon/zero/server'

export const getStaticPaths: GetStaticPaths<{ id: string }> = () => [
  { params: { id: 'a' } },
  { params: { id: 'b' } },
]

export default function Post({ params }) {
  return <article>Post {params.id}</article>
}
```

The SSG plugin expands the URL pattern (`/posts/:id` × `[a, b]` → `/posts/a`, `/posts/b`) and renders one HTML file per concrete value.

### Async enumeration — fetch slugs from a CMS

```tsx
export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  const posts = await fetch('https://api.example.com/posts').then((r) => r.json())
  return posts.map((p) => ({ params: { slug: p.slug } }))
}
```

### Catch-all routes

```tsx
// src/routes/docs/[...slug].tsx
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => [
  { params: { slug: 'intro' } }, // → /docs/intro
  { params: { slug: 'guides/setup' } }, // → /docs/guides/setup
]
```

### Multi-param routes

```tsx
// src/routes/blog/[year]/[slug].tsx
export const getStaticPaths: GetStaticPaths<{ year: string; slug: string }> = () => [
  { params: { year: '2026', slug: 'why-signals' } }, // → /blog/2026/why-signals
]
```

### Error handling

If `getStaticPaths()` throws, returns a non-array, or returns entries missing the required params, the error lands in `PrerenderResult.errors` and the build continues for other routes. SSG never aborts on a single bad enumerator.

::: warning Silent skip
Dynamic routes WITHOUT `getStaticPaths` are silently skipped during SSG auto-detect — `dist/posts/<id>/index.html` is never created, production serves 404 for every URL. Pair with [`pyreon doctor --check-ssg`](#project-audit-pyreon-doctor-check-ssg) and the [`pyreon/missing-get-static-paths`](#lint-rules) lint rule to catch this at edit time.
:::

## 404 page — `_404.tsx`

Drop `_404.tsx` (or `_not-found.tsx`) anywhere in the routes tree and SSG auto-emits `dist/404.html`:

```tsx
// src/routes/_404.tsx
import { Meta } from '@pyreon/zero'

export default function NotFound() {
  return (
    <>
      <Meta title="Not found" noIndex />
      <h1>404 — page not found</h1>
    </>
  )
}
```

The 404 page goes through the same head/styler/meta pipeline as every other route. **And it's wrapped in the parent `_layout.tsx`'s chrome** — sticky headers, footers, navigation, PyreonUI provider all render around the not-found content. No need to inline navigation markup into `_404.tsx` itself.

Disable with `ssg.emit404: false` if you serve a runtime 404 from your reverse proxy instead.

### Host routing required

SSG writes `dist/404.html` but the static host (or your reverse proxy) is responsible for SERVING it when an incoming URL doesn't match a prerendered file. Most managed hosts do this by convention:

| Host | Behaviour | Config needed |
| --- | --- | --- |
| **Netlify** | Serves `404.html` for unmatched paths | None |
| **Cloudflare Pages** | Serves `404.html` for unmatched paths | None |
| **GitHub Pages** | Serves `404.html` for unmatched paths | None |
| **Vercel** (static) | Serves `404.html` for unmatched paths | None |
| **S3 + CloudFront** | No convention | Set CloudFront error response for HTTP 404 → `/404.html` (status 404) |
| **nginx** | No convention | `error_page 404 /404.html;` + `try_files $uri $uri/ $uri.html =404;` |
| **Caddy** | No convention | `handle_errors { @404 expression {http.error.status_code} == 404; rewrite @404 /404.html; file_server }` |

If you self-host on Node/Bun in `mode: 'ssr' | 'isr'`, the runtime handles 404 routing in-process — `dist/404.html` is for static-deploy scenarios only.

## Loader-thrown redirects

A loader can throw `redirect()` to skip rendering and emit a redirect manifest entry instead:

```tsx
// src/routes/blog/[slug].tsx
import { redirect } from '@pyreon/router'

export const loader = ({ params }) => {
  if (params.slug === 'old-name') throw redirect('/blog/new-name', 301)
  return loadPost(params.slug)
}
```

SSG catches the redirect during prerender and writes BOTH:

- `dist/_redirects` (Netlify / Cloudflare Pages format)
- `dist/_redirects.json` (Vercel format)

```text
/blog/old-name  /blog/new-name  301
```

Both files ship together so adapters pick whichever they read. Default `ssg.emitRedirects: true`; set `false` to disable.

### Static HTML meta-refresh fallback

For hosts without redirect manifest support (plain S3, GitHub Pages), emit `<meta http-equiv="refresh">` HTML files instead:

```ts
zero({
  mode: 'ssg',
  ssg: { redirectsAsHtml: 'meta-refresh' },
})
```

This writes `dist/blog/old-name/index.html` with a `<meta http-equiv="refresh" content="0; url=/blog/new-name">` + `<link rel="canonical">` pointing at the new URL.

## Per-route ISR — `revalidate` export

For managed static hosts (Vercel / Cloudflare Pages / Netlify), declare per-route revalidation intervals:

```tsx
// src/routes/posts/[id].tsx
export const revalidate = 60 // revalidate every 60 seconds

export const getStaticPaths = async () => {
  const posts = await fetchPosts()
  return posts.map((p) => ({ params: { id: p.slug } }))
}

export default function Post({ params }) {
  return <article>Post {params.id}</article>
}
```

Or disable explicitly:

```tsx
export const revalidate = false // never revalidate (default)
```

The SSG plugin emits `dist/_pyreon-revalidate.json` mapping concrete paths to TTLs:

```json
{
  "/posts/1": 60,
  "/posts/2": 60,
  "/posts/3": 60
}
```

::: danger Inline literals only
The `revalidate` export must be a literal (`60` / `3600` / `false`). Non-literal expressions are silently omitted from the manifest:

```tsx
// ❌ Silently dropped — TTL is a const reference
const TTL = 60
export const revalidate = TTL

// ❌ Silently dropped — arithmetic expression
export const revalidate = 30 * 60

// ✅ Inline literal
export const revalidate = 60
```

The [`pyreon/revalidate-not-pure-literal`](#lint-rules) rule catches this at edit time.
:::

### `Adapter.revalidate(path)` — platform integration

Deploy adapters consume the manifest and call each platform's ISR API:

| Adapter | Mechanism | Env vars |
| --- | --- | --- |
| `vercelAdapter` | POST to `<deployment>/api/_pyreon-revalidate?path=…&secret=…` | `VERCEL_DEPLOYMENT_URL`, `VERCEL_REVALIDATE_TOKEN` |
| `cloudflareAdapter` | POST to `zones/{id}/purge_cache` (edge cache invalidation) | `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_SITE_URL` |
| `netlifyAdapter` | POST to Build Hook URL (full-site rebuild) | `NETLIFY_BUILD_HOOK_URL` |
| `staticAdapter` / `nodeAdapter` / `bunAdapter` | no-op (use runtime ISR for self-hosted) | — |

**Cloudflare** has a rate limit: ~1000 purges per 24h per zone. High-volume revalidation can hit the cap; the adapter returns `{ regenerated: false }` on 429 responses.

**Netlify's** build hook triggers a FULL site rebuild, not per-page ISR. The `path` argument flows into `trigger_title` for audit-log traceability only.

When required env vars are missing, the adapter returns `{ regenerated: false }` and warns once per process (deduped across calls regardless of NODE_ENV).

## `vercelRevalidateHandler()` — drop-in webhook scaffold

Vercel's adapter POSTs to `/api/_pyreon-revalidate?path=…&secret=…` — a convention you used to have to implement by hand (parse request, validate secret, validate path, dispatch to Vercel's API). `@pyreon/zero/server` ships a drop-in handler that does it for you:

```tsx
// src/routes/api/_pyreon-revalidate.ts
import { vercelRevalidateHandler } from '@pyreon/zero/server'

export default vercelRevalidateHandler({
  // Optional — defaults shown
  manifestPath: './dist/_pyreon-revalidate.json',
  secretEnvVar: 'VERCEL_REVALIDATE_TOKEN',

  // Optional — fires AFTER manifest validation passes
  onRevalidate: async (path) => {
    console.log(`[revalidate] ${path}`)
    // Call Vercel's `res.revalidate(path)` from a serverless handler,
    // or hit any other downstream cache here.
  },
})
```

The handler validates:

1. **POST only** — GET / PUT / DELETE → 405
2. **`?path=…` and `?secret=…` query params** — missing either → 400
3. **`VERCEL_REVALIDATE_TOKEN` env var** present — missing → 500 (misconfigured deploy)
4. **Secret matches env var** — mismatch → 401
5. **Path exists in the manifest** — unknown path → 404

That last check is load-bearing: a leaked secret without the manifest gate would let an attacker revalidate ANY URL, forcing the platform to re-render arbitrary pages (cost amplification + cache pollution). The manifest is the allowlist.

The handler caches the manifest read on first call (process lifetime) so high-throughput webhooks don't re-stat the file. Returns a Web-standard `Response` — works in Vercel Edge, Node serverless, and the in-process `mode: 'ssr'` runtime.

## Concurrency + progress reporting

The render loop runs `ssg.concurrency` paths in flight at a time (default `4`):

```ts
zero({
  mode: 'ssg',
  ssg: {
    concurrency: 8,
    onProgress: ({ completed, total, currentPath, elapsed }) => {
      console.log(`[${completed}/${total}] ${currentPath} (${elapsed}ms)`)
    },
  },
})
```

Set `concurrency: 1` for fully-sequential rendering when loaders share a non-pooled resource (single in-process DB connection, third-party API with serial rate limits). Higher values land in the multi-core CI sweet spot; the practical ceiling is your data layer's connection tolerance.

`onProgress` fires per-path settle (success / redirect / error). Useful for build-tool progress bars and CI heartbeat lines on long builds — silent stretches on 10k-path sites look hung.

Async progress callbacks are awaited PER WORKER before the same worker pulls its next item, but across workers callbacks may run in parallel. Wrap to a single-consumer queue if you need strictly serial output.

## Subpath / base-path deploys

For deploys under a non-root prefix (e.g. `https://example.com/blog/`), `zero({ base })` is the single source of truth — Vite's `base`, the router's link prefixing, and the SSG entry's `__ZERO_BASE__` global all flow from this one field:

```ts
zero({
  mode: 'ssg',
  base: '/blog/',
})
```

```text
dist/
├── index.html            # serves at https://example.com/blog/
└── about/index.html      # serves at https://example.com/blog/about
```

Asset URLs in built HTML automatically get the `/blog/` prefix. `<Link to="/about">` renders `<a href="/blog/about">`. Direct-link navigation to `/blog/about` requires the static host to map `/blog/about` → `dist/about/index.html` — most managed hosts (Netlify / Cloudflare Pages / GitHub Pages) do this by convention.

## i18n — locale-aware prerendering

`zero({ i18n: { locales, defaultLocale, strategy } })` fans the route tree into per-locale variants and prerenders each:

```ts
zero({
  mode: 'ssg',
  i18n: {
    locales: ['en', 'de', 'cs'],
    defaultLocale: 'en',
    strategy: 'prefix-except-default', // or 'prefix'
  },
})
```

| Strategy | Default locale | Other locales |
| --- | --- | --- |
| `'prefix-except-default'` (default) | `/about` (unprefixed) | `/de/about`, `/cs/about` |
| `'prefix'` | `/en/about` (prefixed) | `/de/about`, `/cs/about` |

Use `'prefix-except-default'` for SEO-on-default-locale apps; use `'prefix'` when no locale is "primary".

### Dynamic routes × locale cross-product

`getStaticPaths` composes with locale duplication — 3 IDs × 3 locales = 9 prerendered HTML files:

```text
dist/posts/1/index.html
dist/posts/2/index.html
dist/posts/3/index.html
dist/de/posts/1/index.html
dist/de/posts/2/index.html
dist/de/posts/3/index.html
dist/cs/posts/1/index.html
dist/cs/posts/2/index.html
dist/cs/posts/3/index.html
```

Cardinality compounds by design. Use `ssg.concurrency` to bound in-flight renders independent of route count.

### Per-locale 404

Each locale subtree gets its own `dist/<locale>/404.html` rendered through that locale's `_404.tsx`:

```text
dist/404.html              # default locale (or no-i18n)
dist/de/404.html           # German 404
dist/cs/404.html           # Czech 404
```

Real static hosts only serve the ROOT `dist/404.html` by convention — per-prefix 404 routing under `/de/...` needs explicit declarations (Netlify `[[redirects]]`, Cloudflare `_redirects`, nginx `try_files` per-location, Caddy `handle_errors` matcher).

### hreflang sitemap

Enable `<xhtml:link rel="alternate" hreflang>` cross-references in the sitemap by composing `seoPlugin` with the i18n config:

```ts
import { seoPlugin } from '@pyreon/zero/seo'

zero({
  mode: 'ssg',
  i18n: { locales: ['en', 'de', 'cs'], defaultLocale: 'en' },
})

seoPlugin({
  sitemap: {
    origin: 'https://example.com',
    useSsgPaths: true,
    hreflang: true, // auto-detect from i18n config
  },
})
```

Three locale URLs cluster into one `<url>` with hreflang siblings + an `x-default` entry pointing at the default-locale URL.

## Sitemap auto-emit

`dist/sitemap.xml` is generated automatically from the resolved SSG path set (post-`getStaticPaths` expansion). The SSG plugin emits `dist/_pyreon-ssg-paths.json` after the path render loop; `seoPlugin({ sitemap: { useSsgPaths: true } })` reads it and includes every concrete URL:

```ts
import { seoPlugin } from '@pyreon/zero/seo'

seoPlugin({
  sitemap: {
    origin: 'https://example.com',
    useSsgPaths: true,
    changefreq: 'weekly',
    priority: 0.8,
  },
})
```

Without `useSsgPaths: true`, the sitemap walks the file-system route tree directly and skips dynamic routes.

## Render-error handling

When a route's render throws, the error lands in `PrerenderResult.errors` and the build continues. Two hooks let you intervene:

```ts
zero({
  mode: 'ssg',
  ssg: {
    // Per-path fallback — returned HTML is written in place of the failed render
    onPathError: async ({ path, error }) => {
      console.error(`[ssg] ${path}: ${error.message}`)
      return `<!doctype html><h1>Temporarily unavailable</h1>` // or null to skip
    },

    // Machine-readable summary (default 'json'; 'none' to disable)
    errorArtifact: 'json',
  },
})
```

When `errorArtifact: 'json'` AND any errors occurred, `dist/_pyreon-ssg-errors.json` is written:

```json
{
  "errors": [
    { "path": "/posts/broken", "message": "...", "name": "TypeError", "stack": "..." }
  ]
}
```

CI gating becomes structural:

```bash
cat dist/_pyreon-ssg-errors.json | jq '.errors | length' | grep -q '^0$' || exit 1
```

The file is ONLY written when errors occurred — successful builds don't leak an empty manifest.

## Path collisions

Two routes producing the same URL (a static route overlapping a `getStaticPaths` enumeration, or two enumerators emitting the same slug) used to silently dedupe — one of them disappeared from `dist/`. The build now aborts loudly:

```text
[Pyreon] SSG path collision — 2 URL(s) resolved by multiple routes:
  /posts/featured (3 routes)
  /posts/about    (2 routes)

Each URL must be produced by exactly one route. Check getStaticPaths
enumerators for overlapping params, or remove static routes that
overlap with dynamic-route enumerations.
```

Fix the collision in your route tree — there's no `--ignore-collisions` opt-out, because silent dedup masks a real bug class.

## Project audit — `pyreon doctor --check-ssg`

Run the project-wide audit before pushing:

```bash
bunx pyreon doctor --check-ssg
```

Three syntactic detectors run across `src/routes/`:

| Code | Severity | Detects |
| --- | --- | --- |
| `404-outside-layout-dir` | warn | `_404.tsx` / `_not-found.tsx` NOT co-located with `_layout.tsx` (renders standalone without layout chrome) |
| `dynamic-route-missing-get-static-paths` | warn | `[id].tsx` / `[...slug].tsx` without `export const getStaticPaths` (silently skipped by auto-detect) |
| `non-literal-revalidate-export` | error | `export const revalidate = TTL` (variable refs, arithmetic) — silently dropped from the build-time ISR manifest |

Each finding ships with file path + line/column + an actionable fix:

```text
src/routes/posts/[id].tsx:1:1 — dynamic-route-missing-get-static-paths
  Dynamic route is missing `getStaticPaths`. Add `export const getStaticPaths`
  to enumerate concrete params, or switch to `mode: 'ssr' | 'isr'` if you
  intend the route to be rendered at request time.
```

CI integration:

```bash
bunx pyreon doctor --check-ssg --json | jq '.findings | length' | grep -q '^0$' || exit 1
```

## Lint rules

Three `@pyreon/lint` rules under the `ssg` category catch SSG-specific mistakes at edit time. Add `@pyreon/lint` to devDependencies and run `bunx pyreon-lint .` (or wire it into your editor's LSP integration):

| Rule | Severity | Catches |
| --- | --- | --- |
| `pyreon/missing-get-static-paths` | warn | `[id].tsx` without `getStaticPaths` |
| `pyreon/revalidate-not-pure-literal` | error | `export const revalidate = X` where X isn't a literal |
| `pyreon/invalid-loader-export` | error | `export const loader = { data: 1 }` / non-callable shapes |

All three are scoped to `src/routes/` — the conventions only have meaning inside the routes tree. The `missing-get-static-paths` rule is `warn` not `error` because dynamic routes in `mode: 'ssr' | 'isr'` legitimately don't need the enumerator; the author must consciously decide which mode the route uses.

## Manifests reference

Every SSG build emits these files alongside the rendered HTML:

| File | Purpose | Consumers |
| --- | --- | --- |
| `index.html`, `<path>/index.html` | Prerendered pages | The static host serves them as the user navigates |
| `404.html`, `<locale>/404.html` | Not-found page | Static host serves on unmatched URLs (see [Host routing](#host-routing-required)) |
| `assets/*` | Hashed JS / CSS bundles | Linked from prerendered HTML for hydration |
| `sitemap.xml` | SEO sitemap | Search engine crawlers, monitoring tools |
| `_redirects` | Netlify / Cloudflare redirect manifest | Static-host redirect engines (loader-thrown `redirect()` flows here) |
| `_redirects.json` | Vercel redirect format | Vercel's deploy config |
| `_pyreon-revalidate.json` | Per-route ISR TTLs | Platform adapters call `revalidate(path)` against this allowlist |
| `_pyreon-ssg-paths.json` | Resolved-paths manifest | `seoPlugin({ useSsgPaths: true })` reads this to populate sitemap |
| `_pyreon-ssg-errors.json` | Render-error summary | CI gates (only written when errors occurred) |

Underscore-prefixed manifests are NOT public assets — most static hosts treat them as deploy-config files and don't expose them at user-facing URLs. If yours does, configure the host to deny them explicitly.

All manifest writes are atomic — written to a `<target>.tmp.<pid>.<seq>` sibling first, then `rename`d into place. Readers see either the OLD content or the FULL new content, never a half-written file. A `SIGINT` mid-build can never leave partial manifest state.

## Deployment

### Netlify

```toml
# netlify.toml
[build]
  command = "bun run build"
  publish = "dist"
```

Netlify auto-serves `dist/404.html` for unmatched URLs and reads `dist/_redirects` for the loader-thrown-redirect manifest. No additional config needed for the common case.

For per-locale 404 routing under `prefix-except-default`:

```toml
[[redirects]]
  from = "/de/*"
  to = "/de/404.html"
  status = 404
```

### Cloudflare Pages

```text
Build command:        bun run build
Build output:         dist
```

Auto-serves `dist/404.html` and reads `dist/_redirects`. For per-locale 404, extend `_routes.json`:

```text
/de/* /de/404.html 404
/cs/* /cs/404.html 404
```

### GitHub Pages

```yaml
# .github/workflows/deploy.yml
- run: bun install
- run: bun run build
- uses: actions/upload-pages-artifact@v3
  with:
    path: ./dist
- uses: actions/deploy-pages@v4
```

GitHub Pages auto-serves `dist/404.html` for the root site but does NOT support per-directory 404 customization. For per-locale 404 deploy via a different host.

### Vercel (static)

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist"
}
```

Vercel reads `dist/_redirects.json` and auto-serves `dist/404.html`. For per-route ISR via `revalidate` exports, wire `vercelRevalidateHandler` at `src/routes/api/_pyreon-revalidate.ts` and set `VERCEL_REVALIDATE_TOKEN` in your project environment.

### S3 + CloudFront

S3 has no `404.html` convention — set the CloudFront error response for HTTP 404 to point at `/404.html` with response status 404.

```text
CloudFront → Error Pages → Create custom error response
  HTTP Error Code: 404
  Response Page Path: /404.html
  HTTP Response Code: 404
```

S3 has no redirect-manifest reader either; use the meta-refresh fallback (`ssg.redirectsAsHtml: 'meta-refresh'`) for redirects.

### nginx

```nginx
server {
  root /var/www/dist;
  error_page 404 /404.html;

  location / {
    try_files $uri $uri/ $uri.html =404;
  }
}
```

For per-locale 404:

```nginx
location /de/ {
  try_files $uri $uri/ $uri.html /de/404.html;
}

location /cs/ {
  try_files $uri $uri/ $uri.html /cs/404.html;
}

location / {
  try_files $uri $uri/ $uri.html /404.html;
}
```

### Caddy

```caddy
example.com {
  root * /var/www/dist
  try_files {path} {path}/ {path}.html /404.html
  file_server
}
```

For per-locale 404:

```caddy
handle_errors {
  @404_de expression {http.error.status_code} == 404 && {http.request.uri.path} startswith "/de/"
  rewrite @404_de /de/404.html

  @404_cs expression {http.error.status_code} == 404 && {http.request.uri.path} startswith "/cs/"
  rewrite @404_cs /cs/404.html

  rewrite /404.html
  file_server
}
```

## Real-app reference

[`examples/cpa-pw-blog`](https://github.com/pyreon/pyreon/tree/main/examples/cpa-pw-blog) is the canonical SSG reference example, exercising:

- Static routes (`/`, `/about`, `/blog`)
- Dynamic routes with `getStaticPaths` (`/blog/:slug` enumerating 3 posts)
- Build-time ISR via `revalidate` export on the post route
- `vercelRevalidateHandler` wired at `src/routes/api/_pyreon-revalidate.ts`
- `_404.tsx` with layout chrome
- `_layout.tsx` with theme + global nav
- API routes (`/api/rss.xml`)
- Sitemap auto-emit with `useSsgPaths: true`
- Real loaders + `useHead` per-post

Clone, build, deploy — or use it as a starting template:

```bash
git clone https://github.com/pyreon/pyreon
cd pyreon/examples/cpa-pw-blog
bun install
bun run build
ls dist/
```

## Migration tips

### From SPA (`mode: 'spa'`)

Most SPA → SSG migrations need three changes:

1. **Switch the mode**: `zero({ mode: 'ssg' })`.
2. **Add `getStaticPaths` to every dynamic route** (`[id].tsx`, `[...slug].tsx`). Without it, those routes are silently skipped.
3. **Audit loaders for `window` / `document` access** — they now run at build time. Move browser-only reads into `onMount`.

Run `bunx pyreon doctor --check-ssg` to surface the dynamic-route omissions automatically.

### From Next.js / Astro

| Next.js / Astro | Pyreon Zero SSG |
| --- | --- |
| `getStaticPaths` (Next page) | `export const getStaticPaths` (per route file) |
| `getStaticProps` | `export const loader` (per route file) |
| `revalidate` field in `getStaticProps` | `export const revalidate = 60` |
| `notFound: true` from getStaticProps | `throw notFound()` from `loader` |
| `redirect:` from getStaticProps | `throw redirect('/new')` from `loader` |
| `_404.tsx` (Next) / `404.astro` (Astro) | `_404.tsx` (same convention) |
| Astro Content Collections | Not yet — tracked in roadmap |

The biggest semantic difference: Pyreon components run **once** at mount, then signals patch the DOM in place. There's no per-state-change re-render cycle, so `useState` / `useEffect` / `useMemo` from React-style patterns don't exist. See [Reactivity Rules](/docs/reactivity-rules).

## See also

- [Zero](/docs/zero) — the meta-framework reference
- [Router](/docs/router) — loaders, navigation, route record shape
- [Head](/docs/head) — per-route `useHead`
- [Lint](/docs/lint) — full rule catalog (65 rules across 13 categories)
- [CLI](/docs/cli) — `pyreon doctor` reference
- [`examples/cpa-pw-blog`](https://github.com/pyreon/pyreon/tree/main/examples/cpa-pw-blog) — canonical reference
