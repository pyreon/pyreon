---
title: Static Site Generation
description: The complete @pyreon/zero SSG reference — static + dynamic routes, redirects, i18n, build-time ISR, deployment adapters, and error handling.
---

This is the dedicated reference for `@pyreon/zero`'s Static Site Generation. For the general Zero overview (routing, components, middleware, theme), see **[Zero](/docs/zero)**.

When `mode: "ssg"` is set, `vite build` runs the normal client build, then `ssgPlugin`'s `closeBundle` hook spins up a programmatic Vite SSR sub-build of a synthetic entry, loads the resulting renderer, and writes one static HTML file per resolved path. The temporary `dist/.zero-ssg-server/` artifacts are removed automatically.

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssg' })],
}
```

:::info
`zeroPlugin()` returns `[mainPlugin, ssgPlugin]` in SSG mode (just `[mainPlugin]` otherwise). `plugins: [pyreon(), zero()]` works unchanged — Vite flattens nested plugin arrays.
:::

## When to use SSG vs SSR / SPA / ISR

| Mode      | Render timing                       | Use for                                                              |
| --------- | ----------------------------------- | -------------------------------------------------------------------- |
| **SSG**   | Build time → static HTML            | Content that rarely changes: docs, blogs, marketing, landing pages   |
| **SSR**   | Every request, on the server        | Per-request personalization, fresh data, auth-gated pages            |
| **SPA**   | In the browser only                 | Apps behind a login where SEO/first-paint HTML doesn't matter        |
| **ISR (runtime)** | Cached SSR with stale-while-revalidate | High-traffic pages that tolerate brief staleness — see [Zero → ISR](/docs/zero#isr-incremental-static-regeneration-runtime) |
| **Build-time ISR** | SSG + platform rebuild-on-stale | Mostly-static pages that change occasionally without a full redeploy — see [below](#build-time-isr-per-route-revalidate) |

Per-route override: any route file may `export const renderMode = 'ssg'` to opt a single route in or out independent of the global mode.

## Static routes

By default, omitting `ssg.paths` auto-detects every **static** route (no `[param]` / `[...catchall]` segment) from the file-system route tree:

```ts title="zero.config.ts"
import { defineConfig } from '@pyreon/zero/server'

export default defineConfig({ mode: 'ssg' })
// /, /about, /blog, /contact … all auto-prerendered
```

URL → file mapping:

| Path                  | Output file                          |
| --------------------- | ------------------------------------ |
| `/`                   | `dist/index.html`                    |
| `/about`              | `dist/about/index.html`              |
| `/blog/hello-world`   | `dist/blog/hello-world/index.html`   |

Or list paths explicitly. `ssg.paths` accepts three shapes:

```ts
defineConfig({
  mode: 'ssg',
  ssg: {
    // 1. explicit string[]
    paths: ['/', '/about', '/blog/hello-world'],
    // 2. () => string[]              — derive from config/glob
    // 3. () => Promise<string[]>     — fetch from a CMS/database
  },
})
```

If no static routes exist (only dynamic routes, no `getStaticPaths`), a single `/` fallback is always produced so the static host has an `index.html`.

## Dynamic routes — `getStaticPaths`

Dynamic routes (`/posts/[id].tsx`) are skipped by auto-detect unless they `export const getStaticPaths` (sync or async). The SSG plugin enumerates the params and expands the URL pattern, rendering one HTML file per entry. Mirrors Astro's per-route convention.

```tsx title="src/routes/posts/[id].tsx"
import type { GetStaticPaths } from '@pyreon/zero/server'

export const getStaticPaths: GetStaticPaths<{ id: string }> = async () => {
  const posts = await fetch('https://api.example.com/posts').then((r) => r.json())
  return posts.map((p) => ({ params: { id: p.slug } }))
}

export default function Post(props: { params: { id: string } }) {
  return <article>Post {props.params.id}</article>
}
```

- `GetStaticPaths<TParams>` returns `Array<{ params: TParams }>` (or a promise of one). It is exported from `@pyreon/zero/server`.
- Catch-all routes (`/blog/[...slug].tsx`) work via the full path in the catch-all param: `{ params: { slug: 'a/b' } }` → `/blog/a/b` (slashes preserved).
- Enumeration errors (function throws, returns a non-array, an entry missing `params`, or a missing/empty pattern segment) are captured into the build's error collection — **SSG never aborts on one bad enumerator**, the rest of the site still builds.

## Path-collision detection

Before the render loop runs, the resolved-path list is checked for duplicates. Two routes producing the same URL (e.g. a static `/posts/foo.tsx` plus a dynamic `[id].tsx` whose `getStaticPaths` returns `{ id: 'foo' }`) would otherwise silently last-wins one another's HTML. Instead the build throws with the conflicting URL(s) listed:

```
[Pyreon] SSG path collision — 1 URL(s) resolved by multiple routes:
  - /posts/foo
This happens when a static route + getStaticPaths return overlap, or two
getStaticPaths enumerators produce the same URL. Inspect your routes tree
and ensure each URL is produced by exactly one route.
```

## `_404.tsx` + host routing

Drop a `_404.tsx` (or `_not-found.tsx`) anywhere in the routes tree and SSG auto-emits `dist/404.html`, rendered through the **same** head/styler pipeline as every other page (so `@pyreon/styler` CSS and `@pyreon/head` metadata land correctly). Static hosts (Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront) serve `404.html` for unmatched URLs by convention.

```tsx title="src/routes/_404.tsx"
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

The 404 page is rendered **through the router** so it gets full layout chrome (nav, footer) — the same headers/navigation as regular pages. Parent-layout loaders are skipped during the 404 build (auth/cookie loaders shouldn't fire when generating a static error page — the build has no real request context); lazy components still resolve so the chain renders cleanly.

Disable with `ssg.emit404: false`. Skipped silently when no `_404.tsx` exists. Per-locale 404s are covered in [i18n](#i18n-localized-routes).

## Loader redirects

Throw `redirect(url, status?)` from a route loader and SSG catches it **before** rendering (rendering past a redirect would emit HTML for the wrong page and leak an auth-gated layout to anonymous crawlers):

```tsx title="src/routes/blog/[slug].tsx"
import { redirect } from '@pyreon/router'

export const loader = ({ params }) => {
  if (params.slug === 'old-name') throw redirect('/blog/new-name', 301)
  return loadPost(params.slug)
}
```

The redirected path produces **no** `index.html`. Instead, when `ssg.emitRedirects` is `true` (default), the build writes both manifest formats:

- `dist/_redirects` — Netlify / Cloudflare Pages format (`<from> <to> <status>` per line)
- `dist/_redirects.json` — Vercel format (`{ redirects: [{ source, destination, permanent, statusCode }] }`; 301/308 → `permanent: true`)

Both ship together so you don't have to pick at build time. Set `emitRedirects: false` to treat redirect-throwing loaders as errors instead (pre-2026-Q3 behavior).

For static hosts with no redirect-manifest support (plain S3, GitHub Pages), also emit a meta-refresh HTML stub at the source path:

```ts
defineConfig({
  mode: 'ssg',
  ssg: { redirectsAsHtml: 'meta-refresh' }, // 'none' (default) | 'meta-refresh'
})
```

`'meta-refresh'` writes `dist/<source>/index.html` containing `<meta http-equiv="refresh" content="0; url=<target>">` plus a canonical link. Status codes have no meta-refresh equivalent, so 301/302/307/308 all collapse to a client-side refresh.

## Render-error handling

A per-path render exception (a loader throw that isn't a `redirect()`, a component crash, a path-traversal, a `getStaticPaths` throw) is captured into the build's error collection and the build continues. Two config fields control what happens:

```ts
defineConfig({
  mode: 'ssg',
  ssg: {
    // Per-path fallback. Return a string → written as the path's HTML in
    // place of the failed render. Return null → skip (no HTML for the path).
    // Runs once per failed path; async is awaited; a callback throw is
    // recorded as a separate error and the path is skipped.
    onPathError: async (path, error) => {
      console.error(`SSG render failed for ${path}:`, error)
      return `<!DOCTYPE html><html><body><h1>Temporarily unavailable</h1></body></html>`
    },
    // 'json' (default) writes dist/_pyreon-ssg-errors.json when there were
    // any errors. 'none' opts out (errors stay console-only).
    errorArtifact: 'json',
  },
})
```

`dist/_pyreon-ssg-errors.json` is `{ errors: [{ path, message, name, stack? }] }` and is **only** written when `errors.length > 0` (successful builds don't leak an empty manifest). This makes CI gating structural rather than console-scraping:

```bash
[ ! -f dist/_pyreon-ssg-errors.json ] || { jq -e '.errors | length == 0' dist/_pyreon-ssg-errors.json; }
```

The original error is always recorded **before** `onPathError` runs, so the artifact/summary catches the failure regardless of what the callback returns.

## Concurrency + progress

By default the render loop drains paths through **4** parallel workers (a work-stealing pool — a fast path doesn't idle its worker waiting on a slow peer). Tune it:

```ts
defineConfig({
  mode: 'ssg',
  ssg: {
    concurrency: 8, // faster builds on multi-core CI. Set to 1 for fully sequential.
    onProgress: ({ completed, total, currentPath, elapsed }) => {
      console.log(`[${completed}/${total}] ${currentPath} (${elapsed}ms)`)
    },
  },
})
```

- `concurrency` is clamped to `>= 1`; the real worker count is `min(concurrency, paths.length)`. Set to `1` for the fully-sequential shape (useful when loaders share a non-pooled resource like a single DB connection or a strict serial rate-limit). The practical ceiling is your data layer's concurrent-connection tolerance.
- `onProgress` fires once per path **after** it settles (success, redirect, or failure) — never mid-render. `completed` is 1-indexed, `total` is the full resolved-path count, `elapsed` is wall-clock ms since the loop started. The callback is awaited per-path before that path's progress is considered done, but it does **not** gate the worker pool — callbacks across workers may run in parallel. A throw is captured as a `(onProgress)`-suffixed error so a buggy callback can't take down the build.

Per-path settle outcomes also emit dev-mode perf counters (`ssg.pathRender`, `ssg.pathWrite`, `ssg.pathRedirect`, `ssg.pathError`, `ssg.404Emit`) when a `@pyreon/perf-harness` sink is installed — zero cost otherwise.

## Route-level code splitting

SSG mode code-splits every route into its own dynamic-import chunk by default (`splitChunks: true`) — parity with SSR/SPA mode. Only the landed route plus its dependencies ship on first paint; the rest fetch on navigation.

```ts
defineConfig({
  mode: 'ssg',
  ssg: { splitChunks: false }, // bundle every route into the main chunk
})
```

Set `splitChunks: false` for tiny sites (2–5 pages) where the single-chunk-then-instant-nav trade is preferable. Crossover is roughly 5–8 routes; above that, lazy chunks meaningfully shrink the initial bundle (a 50-route docs site can drop from ~200 KB to ~80 KB on first paint).

## Subpath / base path

`zero({ base: '/blog/' })` is the single source of truth for subpath deploys and propagates into the SSG render too — the synthetic SSR entry reads the Vite-defined `__ZERO_BASE__` and forwards it to `createApp({ base })` so prerendered RouterLink hrefs match the prefixed asset URLs in the built HTML.

The on-disk `dist/` layout stays **unprefixed** (`dist/about/index.html`, not `dist/blog/about/index.html`) — the host serves `dist/` mounted at `/blog/`, the same convention every major SSG framework uses. See [Zero → Base Path](/docs/zero#base-path).

## i18n localized routes

`zero({ i18n: { locales, defaultLocale, strategy } })` fans every route into per-locale variants **at build time** (`expandRoutesForLocales`). This is independent from the request-time `i18nRouting()` middleware — both can be used together.

```ts title="zero.config.ts"
import { defineConfig } from '@pyreon/zero/server'

export default defineConfig({
  mode: 'ssg',
  i18n: {
    locales: ['en', 'de', 'cs'],
    defaultLocale: 'en',
    strategy: 'prefix-except-default', // default. or 'prefix'
  },
})
```

| Strategy                       | Default-locale URLs | Non-default URLs            | Use when                                                  |
| ------------------------------ | ------------------- | --------------------------- | --------------------------------------------------------- |
| `'prefix-except-default'` (default) | `/about` (clean)    | `/de/about`, `/cs/about`    | SEO-on-default-locale apps — canonical URLs stay clean    |
| `'prefix'`                     | `/en/about`         | `/de/about`, `/cs/about`    | No "primary" locale — every URL self-identifies its locale |

- Layouts, error/loading boundaries, and `_404.tsx` duplicate along with pages. Under `prefix-except-default`, the **root** `_layout.tsx` is NOT duplicated (the unprefixed default-locale root layout already wraps every path including `/de/...` via hierarchical matching — duplicating it would double-mount the layout). Non-root layouts (`/dashboard/_layout`) **are** duplicated.
- `getStaticPaths` composes with locales — `/blog/[slug]` × `[en, de]` × `getStaticPaths → [a, b]` produces `/blog/a`, `/blog/b`, `/de/blog/a`, `/de/blog/b`. Cardinality compounds (by design); `ssg.concurrency` bounds in-flight renders independent of route count.
- Locale strings are validated (rejects empty, whitespace, `/`, `\`, `..`, `.`, NUL, leading-dot) before they reach URL emission or filesystem writes.

### Per-locale 404

When i18n is configured, the SSG plugin emits a 404 page per locale subtree that has its own `_404`:

- default / no-i18n → `dist/404.html`
- locale `de` → `dist/de/404.html` (mirrors how Netlify / Cloudflare Pages serve per-prefix 404s)

So search engines and users see a 404 in the right language with the right navigation chrome.

### Hreflang sitemap

`seoPlugin({ sitemap: { useSsgPaths: true, hreflang: true } })` emits `<xhtml:link rel="alternate" hreflang="...">` cross-references between locale variants of each page (plus an `x-default`). The i18n config is auto-read from the SSG paths manifest (`zero({ i18n })` embeds it), so you declare i18n once and the sitemap picks it up. See [Sitemap](#sitemap-from-resolved-paths).

## Sitemap from resolved paths

By default `seoPlugin`'s sitemap walks the file-system route tree and silently skips dynamic routes (their concrete values aren't knowable at scan time). In SSG mode, opt into the real prerendered path set:

```ts title="vite.config.ts"
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    seoPlugin({
      sitemap: {
        origin: 'https://example.com',
        useSsgPaths: true, // read dist/_pyreon-ssg-paths.json (incl. getStaticPaths + per-locale)
        hreflang: true, // emit hreflang alternates (needs zero({ i18n }))
        changefreq: 'weekly',
        priority: 0.8,
      },
    }),
  ],
}
```

When `useSsgPaths` is `true`, sitemap emission moves from `generateBundle` to `closeBundle` (with `enforce: 'post'`) so it runs **after** the SSG plugin has written `dist/_pyreon-ssg-paths.json`. That internal manifest (filename starts with `_` so static hosts don't publish it) lists every path that produced an `index.html` — errored and redirected paths are intentionally excluded (errored pages have no HTML; redirect sources belong in `_redirects`, not the sitemap). It's read and cleaned up after use. Falls back gracefully to the file-system walk when the manifest doesn't exist (non-SSG build).

### Trailing slashes

`sitemap.trailingSlash` controls how non-root `<loc>` paths (and hreflang `href`s) are emitted:

```ts
seoPlugin({
  sitemap: {
    origin: 'https://example.com',
    trailingSlash: 'always', // /resume → /resume/
  },
})
```

- `'preserve'` (default) — emit paths as resolved. No behaviour change.
- `'always'` — append a trailing slash to every non-root path (`/resume` → `/resume/`, root → `https://example.com/`).
- `'never'` — strip trailing slashes (`/resume/` → `/resume`).

**Set `'always'` when deploying SSG output to a host that 301-redirects `/path` → `/path/`** — GitHub Pages, and Netlify / Cloudflare Pages with directory-style URLs. The default `'preserve'` emits `/resume`, which those hosts redirect to `/resume/`; Lighthouse penalises the hop ("Avoid multiple page redirects"). Matching the directory-style output in the sitemap removes it.

The default stays `'preserve'` rather than auto-switching on adapter, because not every SSG host redirects — some serve `/resume` straight from the directory's `index.html` with no hop. Pick the value that matches your host.

## Build-time ISR (per-route `revalidate`)

Distinct from runtime ISR (`mode: 'isr'`, in-memory LRU cache — see [Zero → ISR](/docs/zero#isr-incremental-static-regeneration-runtime)). **Build-time ISR** is static prerender + platform-driven rebuild-on-stale. A route opts in by exporting a `revalidate` literal:

```tsx title="src/routes/posts/[id].tsx"
export const revalidate = 60 // seconds. Or `false` for never-revalidate.

export const getStaticPaths = () => [{ params: { id: '1' } }, { params: { id: '2' } }]
export default function Post({ params }) { /* … */ }
```

`revalidate` is a **build-time-only** concern — it never reaches the runtime router. At build, the SSG plugin scans for `export const revalidate = <number|false>` literals, matches each route's URL pattern against the rendered paths (static → exact, dynamic/catch-all → regex), and writes `dist/_pyreon-revalidate.json`:

```json
{ "revalidate": { "/posts/1": 60, "/posts/2": 60, "/about": 3600 } }
```

All enumerated children of a dynamic route inherit the route's value. The manifest is **only** written when at least one route has a revalidate literal (absence is a meaningful signal to adapters: "no per-route ISR — use platform defaults"). It's atomically written (temp file + rename) so an interrupted build never leaves a half-written manifest.

### Adapter `revalidate(path)`

Deployment adapters consume the manifest. `vercel` / `cloudflare` / `netlify` implement `Adapter.revalidate(path)` to trigger a platform rebuild-on-stale (called by your webhook handlers, cron jobs, CMS triggers); `static` / `node` / `bun` implement it as a no-op. It returns `{ regenerated: boolean }`:

```ts
import { resolveAdapter } from '@pyreon/zero/server'

const adapter = resolveAdapter({ adapter: 'vercel' })
const { regenerated } = await adapter.revalidate('/posts/1')
```

`vercelAdapter().revalidate()` POSTs to `<deployment>/api/_pyreon-revalidate?path=…&secret=…` reading `VERCEL_DEPLOYMENT_URL` (or `VERCEL_URL`) + `VERCEL_REVALIDATE_TOKEN` from env. Missing env vars warn even in production (deduped per process) — that's exactly where a silent misconfig surfaces (CMS triggers revalidate, nothing happens, no signal).

### `vercelRevalidateHandler` — drop-in webhook

The scaffold for the convention the Vercel adapter POSTs to. Mount it as an API route:

```ts title="src/routes/api/_pyreon-revalidate.ts"
import { vercelRevalidateHandler } from '@pyreon/zero/server'

export const POST = vercelRevalidateHandler({
  // Defaults to ./dist/_pyreon-revalidate.json
  manifestPath: './dist/_pyreon-revalidate.json',
})
```

The handler:

- accepts only `POST` with `?path=&secret=` query params,
- validates `secret` against `VERCEL_REVALIDATE_TOKEN` (override via `secretEnvVar`) — missing env → 500, mismatch → 403,
- refuses any path **not** in the revalidate manifest (404) — closes the "secret leaks once → attacker revalidates anything" footgun,
- supports a custom `onRevalidate(path)` impl for self-hosted SSR runtimes / edge purge APIs (throw to signal failure → 500).

The manifest is read once per process and cached (including a cached failure, so a broken deploy gets fast 500s until restart).

## Deployment adapters in SSG mode

In SSG mode the adapter's `build()` is invoked automatically by the SSG plugin's `closeBundle` with `{ kind: 'ssg', outDir, config }` (vs `{ kind: 'ssr', serverEntry, clientOutDir, outDir, config }` for SSR). Adapter throws are caught and recorded as a `(adapter:<name>)` error so a buggy adapter can't take down the rest of the build (sitemap, error artifact, summary already ran).

| Adapter      | SSG `build()` writes                                                  |
| ------------ | --------------------------------------------------------------------- |
| `node`       | no-op                                                                 |
| `bun`        | no-op                                                                 |
| `static`     | no-op (dist is already the publishable output)                        |
| `vercel`     | `.vercel/output/config.json` (Build Output API v3, static variant)    |
| `cloudflare` | `_routes.json` static routing config                                  |
| `netlify`    | `netlify.toml` / static config                                        |

Set the adapter by name or instance:

```ts
import { vercelAdapter } from '@pyreon/zero/server'

defineConfig({ mode: 'ssg', adapter: 'vercel' })          // by name
defineConfig({ mode: 'ssg', adapter: vercelAdapter() })   // by instance
```

The build summary log surfaces what landed: page count, `+ 404.html` (or `+ N 404 pages`), redirect count, `+ N revalidate path(s)`, elapsed ms, `(concurrency: N)`, `[adapter: name]`, and a per-locale breakdown `[en: 100, de: 100, cs: 100]` when i18n is active.

## Build artifacts reference

Files the SSG plugin may write to `dist/`. All `_`-prefixed files are internal manifests (static hosts shouldn't publish them; `seoPlugin` reads + cleans `_pyreon-ssg-paths.json`):

| File                          | When                                         | Consumed by                                  |
| ----------------------------- | -------------------------------------------- | -------------------------------------------- |
| `<path>/index.html`           | Per successfully-rendered path               | The static host                              |
| `404.html`, `<locale>/404.html` | `_404.tsx` exists, `emit404 !== false`     | Static host (unmatched-URL fallback)         |
| `_redirects`                  | A loader threw `redirect()`, `emitRedirects` | Netlify / Cloudflare Pages                   |
| `_redirects.json`             | Same                                         | Vercel                                       |
| `_pyreon-ssg-paths.json`      | Any page rendered                            | `seoPlugin({ sitemap: { useSsgPaths: true } })` |
| `_pyreon-revalidate.json`     | A route exported `revalidate`                | Deployment adapter / `vercelRevalidateHandler` |
| `_pyreon-ssg-errors.json`     | `errors.length > 0`, `errorArtifact !== 'none'` | CI gates                                  |
| `sitemap.xml`                 | `seoPlugin({ sitemap })`                      | Search engines                               |

Manifest writes (`_redirects*`, `_pyreon-*.json`) are atomic (temp file + `rename`) so an interrupted build never leaves a half-written manifest an adapter or CI might misparse. Per-page HTML writes are intentionally non-atomic (individually-readable, no cross-file invariant, and the rename cost on 10k-path sites would be significant).

## Delivery polish

Four opt-in options tune how the prerendered pages *ship*:

- **`speculationRules: 'prefetch' | 'prerender'`** — emits a `<script type="speculationrules">` document-rules block into every prerendered page (Chrome's Speculation Rules API: near-instant navigations by prefetching — or fully prerendering — likely same-origin links). Progressive enhancement; unsupported browsers ignore the block.
- **`viewTransitions: true`** — opts prerendered pages into cross-document View Transitions (`@view-transition { navigation: auto }`): MPA navigations between prerendered pages animate with zero JS in supporting browsers.
- **`cssMode: 'asset'`** — ships the styler's collected CSS as ONE content-hashed shared file (`assets/pyreon-ssg.<hash>.css`) linked from every page, instead of the default `'inline'` per-page `<style>` tag. Pages share the browser-cached file; HTML shrinks by the full sheet per page. No-op without `@pyreon/styler`.
- **`earlyHints: true`** — writes per-path `Link: <chunk>; rel=modulepreload` entries into `_headers` for each page's route-chunk closure. Cloudflare Pages and Netlify turn `Link` headers into HTTP 103 Early Hints, so the browser starts fetching route chunks before the HTML arrives.

See **[Zero → ZeroConfig Options](/docs/zero#zeroconfig-options)** for the full `ssg` surface.

## `ssg` config quick reference

| Option            | Type                                                        | Default  | Summary                                                  |
| ----------------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------- |
| `paths`           | `string[] \| () => string[] \| () => Promise<string[]>`     | auto     | Explicit prerender paths (else auto-detect)              |
| `emit404`         | `boolean`                                                   | `true`   | Emit `dist/404.html` from `_404.tsx`                     |
| `emitRedirects`   | `boolean`                                                   | `true`   | Write `_redirects` / `_redirects.json` on loader redirect |
| `redirectsAsHtml` | `'none' \| 'meta-refresh'`                                   | `'none'` | Also emit a meta-refresh HTML stub per redirect          |
| `onPathError`     | `(path, error) => string \| null \| Promise<…>`             | —        | Per-path fallback HTML hook                              |
| `errorArtifact`   | `'json' \| 'none'`                                           | `'json'` | Write `_pyreon-ssg-errors.json` on errors                |
| `concurrency`     | `number`                                                    | `4`      | Parallel render workers                                  |
| `onProgress`      | `({ completed, total, currentPath, elapsed }) => void \| …`  | —        | Per-path settle callback                                 |
| `splitChunks`     | `boolean`                                                   | `true`   | Route-level code splitting                               |
| `modulePreload`   | `boolean`                                                   | `true`   | Per-route `<link rel="modulepreload">` delta (islands-safe) |
| `speculationRules`| `'prefetch' \| 'prerender' \| false`                         | off      | Speculation Rules block per prerendered page             |
| `viewTransitions` | `boolean`                                                   | off      | Cross-document View Transitions opt-in                   |
| `cssMode`         | `'inline' \| 'asset'`                                        | `'inline'` | Styler CSS inlined per page or one shared hashed file  |
| `earlyHints`      | `boolean`                                                   | off      | Per-path `Link:` modulepreload entries in `_headers` (HTTP 103) |

Top-level `i18n` (`I18nRoutingConfig`) drives per-locale route duplication; per-route `export const revalidate` drives the build-time ISR manifest.

## Diagnostics — `pyreon doctor --check-ssg`

`pyreon doctor --check-ssg` runs the `ssg-audit` gate (equivalent to `pyreon doctor --only ssg-audit`) — a programmatic doctor v2 gate that checks the SSG configuration and route tree for common mistakes before you build.

```bash
pyreon doctor --check-ssg
# or, with the unified gate API:
pyreon doctor --only ssg-audit
```

## Next Steps

- **[Zero](/docs/zero)** — the full meta-framework overview (routing, components, middleware, theme, adapters).
- **[Router](/docs/router)** — `redirect()`, loaders, and the routing primitives SSG builds on.
- **[Create Zero](/docs/create-zero)** — scaffolding (templates include `getStaticPaths` examples).
