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

The SSG renderer goes through the **same** `renderPage` pipeline that production SSR and zero's dev SSR middleware use (preload → redirect-catch → render → styler-collect → loader-data → status). One implementation, no drift between build-time and runtime output.

## When to use SSG vs SSR / SPA / ISR

| Mode      | Render timing                       | Use for                                                              |
| --------- | ----------------------------------- | -------------------------------------------------------------------- |
| **SSG**   | Build time → static HTML            | Content that rarely changes: docs, blogs, marketing, landing pages   |
| **SSR**   | Every request, on the server        | Per-request personalization, fresh data, auth-gated pages            |
| **SPA**   | In the browser only                 | Apps behind a login where SEO/first-paint HTML doesn't matter        |
| **ISR (runtime)** | Cached SSR with stale-while-revalidate | High-traffic pages that tolerate brief staleness — see [Zero → ISR](/docs/zero#isr-incremental-static-regeneration-runtime) |
| **Build-time ISR** | SSG + platform rebuild-on-stale | Mostly-static pages that change occasionally without a full redeploy — see [below](#build-time-isr-per-route-revalidate) |

The app-level `mode` is the **default** for routes that don't declare their own — see [Per-route render modes](#per-route-render-modes-hybrid).

## Static routes

By default, omitting `ssg.paths` auto-detects every **static** route (no `[param]` / `[...catchall]` segment) from the file-system route tree:

```ts title="zero.config.ts"
import { defineConfig } from '@pyreon/zero/server'

export default defineConfig({ mode: 'ssg' })
// /, /about, /blog, /contact … all auto-prerendered
```

`defineConfig` (and the same `ssg` options) are exported from `@pyreon/zero/server` and `@pyreon/zero/config`. URL → file mapping:

| Path                  | Output file                          |
| --------------------- | ------------------------------------ |
| `/`                   | `dist/index.html`                    |
| `/about`              | `dist/about/index.html`              |
| `/blog/hello-world`   | `dist/blog/hello-world/index.html`   |

A path ending in `.html` is written verbatim (`/sitemap.html` → `dist/sitemap.html`); everything else maps to `<path>/index.html`.

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

## Output format (directory vs file URLs)

`ssg.format` controls which file(s) each route writes — mirroring Astro's `build.format`:

```ts
defineConfig({
  mode: 'ssg',
  adapter: 'static',
  ssg: {
    paths: ['/', '/resume'],
    format: 'both', // 'file' | 'directory' | 'both' — default 'directory'
  },
})
```

| `format`            | `/resume` writes                              |
| ------------------- | --------------------------------------------- |
| `'directory'` (default) | `dist/resume/index.html`                  |
| `'file'`            | `dist/resume.html`                            |
| `'both'`            | `dist/resume/index.html` **and** `dist/resume.html` (byte-identical) |

The root route always writes `dist/index.html` (there is no `dist/.html`), and a path that already ends in `.html` is written verbatim — both regardless of `format`.

### Why this exists — the slash-less-URL 301

With `'directory'` only, a host that does **not** auto-rewrite slash-less URLs to the trailing-slash form — **GitHub Pages, raw Cloudflare R2 / S3 without an index-document config, plain nginx without `try_files`** — answers a direct hit to `/resume` (the canonical share/link form) with a redirect:

```
GET /resume   → 301 → /resume/   → 200
```

That single redirect is a measurable mobile-performance cost — Lighthouse / PageSpeed flags it under **"Avoid multiple page redirects"** (hundreds of ms on a cold mobile connection). Emitting `dist/resume.html` lets those hosts serve `/resume` directly with no redirect.

### Choosing a value

- **`'both'`** is the safe recommendation when redirects matter. It keeps the **directory form** working for trailing-slash links (`<RouterLink to="/resume/">`, the trailing-slash URLs [`seoPlugin`'s sitemap](#trailing-slashes) advertises) *and* serves slash-less share URLs with **no redirect** via the file form. Cost: one extra HTML file per route.
- **`'file'`** is leanest, but a page is then reachable **only** at its slash-less URL — a host that maps `/resume/` → `/resume/index.html` will 404 the trailing-slash form. Avoid `'file'` if your app emits trailing-slash internal links or sitemap URLs.
- When a route is reachable at two URL forms (`'both'`), set a **canonical** ([`<Meta canonical>`](/docs/zero#meta)) so search engines dedupe `/resume` and `/resume/`.

> This is the *output* side of the same concern [`sitemap.trailingSlash`](#trailing-slashes) addresses on the *advertised-URL* side. `format: 'both'` removes the redirect for **both** forms instead of choosing one canonical form for the sitemap to match.

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

| Aspect                | Behavior                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Return shape          | `Array<{ params: TParams }>` (or a promise of one). `GetStaticPaths<TParams>` from `@pyreon/zero/server`. |
| Single param          | `/posts/[id]` × `{ id: 'a' }` → `/posts/a` (one segment — `/` and traversal in the value throw) |
| Catch-all             | `/blog/[...slug]` × `{ slug: 'a/b' }` → `/blog/a/b` (slashes preserved; `.` / `..` segments still rejected) |
| No `getStaticPaths`   | The dynamic route is silently skipped from auto-detect — hand-list it in `ssg.paths` if intended |

Enumeration errors (function throws, returns a non-array, an entry missing `params`, a value containing path traversal, or a missing pattern segment) are captured into the build's [error collection](#render-error-handling) — **SSG never aborts on one bad enumerator**, the rest of the site still builds.

:::warning{title="Slug values are written to disk"}
A `getStaticPaths` value becomes a `dist/<path>/index.html` write target. An unsanitized CMS slug containing `/` (on a non-catch-all `[id]`) or a `.` / `..` segment is rejected at build time with an actionable error — it can't escape the output root. Treat the rejection as a signal that the slug needs cleaning at the source.
:::

## Path-collision detection

Before the render loop runs, the resolved-path list is checked for duplicates. Two routes producing the same URL — a static `/posts/foo.tsx` plus a dynamic `[id].tsx` whose `getStaticPaths` returns `{ id: 'foo' }`, or two `getStaticPaths` enumerators producing the same slug — would otherwise silently last-wins one another's HTML.

:::warning{title="Collisions throw, they don't dedupe"}
The build **fails** with the conflicting URL(s) listed rather than letting one route's HTML silently overwrite the other's between rebuilds:

```
[Pyreon] SSG path collision — 1 URL(s) resolved by multiple routes:
  - /posts/foo
This happens when a static route + getStaticPaths return overlap, or two
getStaticPaths enumerators produce the same URL. Inspect your routes tree
and ensure each URL is produced by exactly one route.
```

Fix the source conflict so each URL is produced by exactly one route.
:::

## `_404.tsx` + host routing

Drop a `_404.tsx` (or its alias `_not-found.tsx`) anywhere in the routes tree and SSG auto-emits `dist/404.html`, rendered through the **same** head/styler pipeline as every other page (so `@pyreon/styler` CSS and `@pyreon/head` metadata land correctly).

```tsx title="src/routes/_404.tsx"
import { Meta } from '@pyreon/zero'

export default function NotFound() {
  return (
    <>
      <Meta title="Not found" />
      <h1>404 — page not found</h1>
    </>
  )
}
```

The 404 page is rendered **through the router** so it gets full layout chrome — the same headers, footer, and navigation as regular pages (`resolveRoute` walks the tree, finds the deepest parent `notFoundComponent`, and builds a matched chain `[...ancestorLayouts, syntheticLeaf]`). Parent-layout loaders are **skipped** during the 404 build — auth/cookie loaders shouldn't fire when generating a static error page, since the build has no real request context — but lazy components still resolve so the chain renders cleanly.

Disable with `ssg.emit404: false`. Skipped silently when no `_404.tsx` exists. Per-locale 404s are covered in [i18n](#per-locale-404).

### `noindex` is auto-injected

The framework knows it's emitting a 404, so it guarantees `<meta name="robots" content="noindex, nofollow">` on the rendered page:

- **Absent** → the noindex tag is inserted before `</head>`.
- **Index-permitting** (the `<Meta>` default `index, follow`, an explicit `index, follow`, or the `all` shorthand) → it is **rewritten** to `noindex, nofollow`. So you don't have to remember `noIndex` in every `_404.tsx`.
- **Already non-indexing** (`noindex`, `none`, or a richer `noindex, nofollow, noarchive`) → passed through unchanged. A deliberate directive always wins.

:::warning{title="404.html still needs host routing"}
SSG **writes** `dist/404.html`, but the static host is responsible for **serving** it for unmatched URLs. Most managed hosts (Netlify, Cloudflare Pages, GitHub Pages, Vercel static) do this by convention; raw nginx / S3+CloudFront need explicit config (see [Deployment](#deployment-per-platform)). Without host routing the file is shipped but never reached.
:::

## Loader redirects

Throw `redirect(url, status?)` from a route loader and SSG catches it **before** rendering (rendering past a redirect would emit HTML for the wrong page and leak an auth-gated layout to anonymous crawlers):

```tsx title="src/routes/blog/[slug].tsx"
import { redirect } from '@pyreon/router'

export const loader = ({ params }) => {
  if (params.slug === 'old-name') throw redirect('/blog/new-name', 301)
  return loadPost(params.slug)
}
```

The redirected path produces **no** `index.html` (and is excluded from the sitemap manifest). Instead, when `ssg.emitRedirects` is `true` (default), the build writes both manifest formats:

- `dist/_redirects` — Netlify / Cloudflare Pages format (`<from> <to> <status>` per line, with a leading `# Auto-generated` comment)
- `dist/_redirects.json` — Vercel format (`{ redirects: [{ source, destination, permanent, statusCode }] }`; 301/308 → `permanent: true`, 302/307 → `permanent: false`)

Both ship together so you don't have to pick at build time. Set `emitRedirects: false` to treat redirect-throwing loaders as errors instead (pre-2026-Q3 behavior — the path silently disappears with no signal).

For static hosts with no redirect-manifest support (plain S3, GitHub Pages), also emit a meta-refresh HTML stub at the source path:

```ts
defineConfig({
  mode: 'ssg',
  ssg: { redirectsAsHtml: 'meta-refresh' }, // 'none' (default) | 'meta-refresh'
})
```

`'meta-refresh'` writes `dist/<source>/index.html` containing `<meta http-equiv="refresh" content="0; url=<target>">` plus a canonical link (for crawler de-dup). Status codes have no meta-refresh equivalent, so 301/302/307/308 all collapse to a client-side refresh.

## Render-error handling

A per-path render exception — a loader throw that isn't a `redirect()`, a component crash, a path-traversal, a `getStaticPaths` throw, or a 30-second prerender timeout — is captured into the build's error collection and the build continues. Two config fields control what happens:

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
# Fail the pipeline if any path errored during SSG.
[ ! -f dist/_pyreon-ssg-errors.json ] || { jq -e '.errors | length == 0' dist/_pyreon-ssg-errors.json; }
```

The original error is always recorded **before** `onPathError` runs, so the artifact and the build-summary log catch the failure regardless of what the callback returns. A `(adapter:<name>)`-suffixed entry means a [deployment adapter](#deployment-per-platform)'s `build()` threw (the rest of the build still completed); an `(onProgress)` / `(onPathError)` suffix means one of your callbacks threw.

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

## Per-route `<link rel=modulepreload>` (islands-safe)

Vite already preloads the **entry's** static import graph in the built `index.html`. What's missing is each route's own delta: its lazy-imported component chunk (discovered late in the network waterfall) plus that chunk's **static** import closure. With `modulePreload: true` (default), the SSG plugin pre-declares the per-route delta in each page's `<head>`, so the browser fetches the whole route graph in parallel from `t=0`:

```html
<link rel="modulepreload" href="/assets/about-Bx2.js" crossorigin>
```

The mechanism: SSG enables Vite's `build.manifest`, computes the static-import closure of the matched route modules, subtracts the entry graph + the template's existing preloads, and emits only the delta. The manifest is read and **deleted** post-build (never shipped) unless you enabled it yourself.

:::warning{title="Static imports only — never dynamic"}
The closure follows the manifest's `imports` field exclusively, **never** `dynamicImports`. A route's dynamic imports are exactly the chunks the author deferred on purpose — islands (`hydrate: 'never' | 'visible' | …`), `lazy()` components, heavy-module-in-handler. Preloading those would pull deferred code onto the first-paint critical path and defeat the islands model. The static-only rule structurally excludes them.
:::

`modulepreload` is a non-load-bearing hint, so every step degrades gracefully — a missing or malformed manifest just disables the feature for that build. Set `modulePreload: false` to opt out. See also [`earlyHints`](#delivery-polish) for the HTTP 103 variant.

## Per-route render modes (hybrid)

The app-level `mode` is the **default**. Any route file (or a layout, which cascades to its descendants) may `export const renderMode` to opt a single route out:

```tsx title="src/routes/blog/_layout.tsx"
// Mark the whole /blog subtree static, inside an otherwise-SSR app.
export const renderMode = 'ssg'
```

Resolution is leaf-first: a page's own `renderMode` beats its layout's, and a layout's beats the app default. The **same** resolver drives the build and the runtime dispatch, so they can never disagree.

| App `mode` | A route declaring `'ssg'`         | A route declaring `'spa'`               | A route declaring `'ssr'` / `'isr'`             |
| ---------- | --------------------------------- | --------------------------------------- | ----------------------------------------------- |
| `'ssg'`    | Prerendered (the default)         | Emits the CSR shell (blank placeholders, boots cold) | **Build error** — see below                     |
| `'ssr'` / `'isr'` (hybrid) | Prerendered at build, served static-first | Server's job at request time      | Server's job at request time                    |

When the app mode is `'ssr'` or `'isr'`, the SSG plugin runs as a **hybrid** pass: it prerenders only the routes that declare `renderMode: 'ssg'`, leaving the 404/adapter steps to the SSR plugin. It pays the SSR sub-build cost only when a cheap file-scan finds at least one static-declared route.

:::warning{title="'ssr'/'isr' routes in a 'ssg' (or 'spa') app are a build error"}
A static deploy has no server, so a route declaring `renderMode: 'ssr'` (or `'isr'`) is unimplementable. The build fails loudly, naming each offending route and the fix, instead of silently shipping a 404 the user discovers in production:

```
[Pyreon] zero({ mode: 'ssg' }) builds a static deploy with no server, but 1 route(s) declare a server render mode:
  /dashboard (renderMode: 'ssr')
Fix: set zero({ mode: 'ssr' }) (or 'isr') so a server bundle is emitted — per-route 'ssg'/'spa' declarations keep those routes static — or change the offending route's renderMode.
```
:::

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
    defaultLocale: 'en', // required
    strategy: 'prefix-except-default', // default. or 'prefix'
  },
})
```

| Strategy                       | Default-locale URLs | Non-default URLs            | Use when                                                  |
| ------------------------------ | ------------------- | --------------------------- | --------------------------------------------------------- |
| `'prefix-except-default'` (default) | `/about` (clean)    | `/de/about`, `/cs/about`    | SEO-on-default-locale apps — canonical URLs stay clean    |
| `'prefix'`                     | `/en/about`         | `/de/about`, `/cs/about`    | No "primary" locale — every URL self-identifies its locale |

- Layouts, error/loading boundaries, and `_404.tsx` duplicate along with pages.
- `getStaticPaths` composes with locales — `/blog/[slug]` × `[en, de]` × `getStaticPaths → [a, b]` produces `/blog/a`, `/blog/b`, `/de/blog/a`, `/de/blog/b`. Cardinality compounds (by design); `ssg.concurrency` bounds in-flight renders independent of route count.
- Locale strings are validated (rejects empty, whitespace, `/`, `\`, `..`, `.`, NUL, leading-dot) before they reach URL emission or filesystem writes — a bad locale throws an actionable `[Pyreon]` error.

:::warning{title="Under prefix-except-default the root layout is NOT duplicated"}
The unprefixed default-locale root `_layout.tsx` (urlPath `/`) is the parent of every path's matched chain, including locale-prefixed ones — the route tree wraps `/de/about` under it via hierarchical matching. Producing a duplicate `/de/_layout` would mount the layout **twice** (two navbars, two `PyreonUI` providers), so the root layout is skipped during duplication. **Non-root** layouts (e.g. `/dashboard/_layout`) **are** duplicated — `/de/dashboard/users` is not a child of the unprefixed `/dashboard/_layout`. Under `'prefix'` strategy there is no unprefixed default to inherit from, so every locale gets its own root layout.
:::

### Per-locale 404

When i18n is configured, the SSG plugin emits a 404 page per locale subtree that has its own `_404`:

- default / no-i18n → `dist/404.html`
- locale `de` → `dist/de/404.html` (mirrors how Netlify / Cloudflare Pages serve per-prefix 404s)

So search engines and users see a 404 in the right language with the right navigation chrome. (Like the root 404, per-prefix serving still requires [host routing](#deployment-per-platform).)

### Hreflang sitemap

`seoPlugin({ sitemap: { useSsgPaths: true, hreflang: true } })` emits `<xhtml:link rel="alternate" hreflang="...">` cross-references between locale variants of each page (plus an `x-default` pointing at the default-locale URL). URLs are clustered by their un-prefixed form — `/about`, `/de/about`, `/cs/about` collapse into **one** `<url>` with three `xhtml:link` siblings:

```xml
<url>
  <loc>https://example.com/about</loc>
  <changefreq>weekly</changefreq>
  <priority>0.7</priority>
  <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>
  <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>
  <xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>
</url>
```

`hreflang` accepts three forms: `true` reads the i18n config from the SSG paths manifest (zero-config — declare `zero({ i18n })` once and the sitemap picks it up); an explicit `I18nRoutingConfig` object (use this when the project doesn't run SSG but still wants hreflang); or `false` / omitted for plain `<url>` entries. See [Sitemap](#sitemap-from-resolved-paths).

## Sitemap from resolved paths

By default `seoPlugin`'s sitemap walks the file-system route tree and silently skips dynamic routes (their concrete values aren't knowable at scan time). In SSG mode, opt into the real prerendered path set:

```ts title="vite.config.ts"
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    pyreon(),
    zero({ mode: 'ssg' }),
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

:::note
`seoPlugin()` must come **after** `zero()` in the Vite plugins array (the canonical ordering) so its `closeBundle` fires after the SSG path manifest is written. `enforce: 'post'` pushes it to the tail regardless, but keep the order conventional.
:::

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

:::warning{title="Set 'always' for hosts that 301 /path → /path/"}
GitHub Pages, and Netlify / Cloudflare Pages with directory-style URLs, redirect `/resume` → `/resume/`. The default `'preserve'` emits `/resume`, so a crawler following the sitemap pays the redirect hop — and Lighthouse flags it ("Avoid multiple page redirects"). Match the directory-style output with `'always'` to remove the hop. The default stays `'preserve'` because not every host redirects (some serve `/resume` straight from the directory's `index.html`); pick the value that matches your host.
:::

## Build-time ISR (per-route `revalidate`)

Distinct from runtime ISR (`mode: 'isr'`, in-memory LRU cache — see [Zero → ISR](/docs/zero#isr-incremental-static-regeneration-runtime)). **Build-time ISR** is static prerender + platform-driven rebuild-on-stale. A route opts in by exporting a `revalidate` literal:

```tsx title="src/routes/posts/[id].tsx"
export const revalidate = 60 // seconds. Or `false` for never-revalidate.

export const getStaticPaths = () => [{ params: { id: '1' } }, { params: { id: '2' } }]
export default function Post({ params }) { /* … */ }
```

`revalidate` is a **build-time-only** concern — it never reaches the runtime router. At build, the SSG plugin scans for `export const revalidate = <number|false>` literals, matches each route's URL pattern against the rendered paths (static → exact, dynamic/catch-all → regex, **most-specific route wins** when a path matches more than one), and writes `dist/_pyreon-revalidate.json`:

```json
{ "revalidate": { "/posts/1": 60, "/posts/2": 60, "/about": 3600 } }
```

All enumerated children of a dynamic route inherit the route's value. The manifest is **only** written when at least one route has a revalidate literal (absence is a meaningful signal to adapters: "no per-route ISR — use platform defaults"). It's atomically written (temp file + rename) so an interrupted build never leaves a half-written manifest.

:::warning{title="revalidate must be a plain literal"}
Only `export const revalidate = 60` / `export const revalidate = false` are captured. A variable reference (`export const revalidate = TTL`), arithmetic (`30 * 60`), or any non-literal expression can't be read at build time — the route is silently absent from the manifest. Inline the literal.
:::

### Adapter `revalidate(path)`

Deployment adapters consume the manifest. `vercel` / `cloudflare` / `netlify` implement `Adapter.revalidate(path)` to trigger a platform rebuild-on-stale (called by your webhook handlers, cron jobs, CMS triggers); `static` / `node` / `bun` implement it as a no-op (they `console.warn` an actionable message — self-hosted Node/Bun has no platform-driven ISR, use `mode: 'isr'` for runtime caching). It returns `{ regenerated: boolean }`:

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

## Deployment (per platform)

In SSG mode the adapter's `build()` is invoked automatically by the SSG plugin's `closeBundle` with `{ kind: 'ssg', outDir, config, assetsDir }` (vs `{ kind: 'ssr', … }` for SSR). It runs **after** the per-page HTML, redirect, sitemap, and error manifests are written — so a buggy adapter (its throw is recorded as a `(adapter:<name>)` error) can't take down the rest of the build. Cache rules are scoped to `<base><assetsDir>` so a custom `assetsDir` or subpath deploy keeps its hashed chunks immutable.

| Adapter      | SSG `build()` writes                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `node`       | no-op (it's an SSR runner)                                                                         |
| `bun`        | no-op (it's an SSR runner)                                                                         |
| `static`     | no-op (`dist/` is already the publishable output)                                                 |
| `vercel`     | `.vercel/output/config.json` (Build Output API v3 static variant — immutable cache on hashed assets, no functions) |
| `cloudflare` | `_routes.json` (`include: [], exclude: ['/*']` — never invoke a Pages Function) + `_headers` (asset immutable cache) |
| `netlify`    | `netlify.toml` (`publish = "."` + `[[headers]]` asset immutable cache)                             |

```ts
import { vercelAdapter } from '@pyreon/zero/server'

defineConfig({ mode: 'ssg', adapter: 'vercel' })          // by name
defineConfig({ mode: 'ssg', adapter: vercelAdapter() })   // by instance
```

The recurring deploy concern across hosts is **unmatched-URL routing** (so `404.html` / per-locale 404s and clean URLs work). Per platform:

:::code-group

```toml [Netlify]
# netlify.toml — the `static` adapter doesn't write this; the `netlify`
# adapter emits publish + asset cache. Add a catch-all 404 + per-locale 404:
[build]
  publish = "dist"

# Pretty URLs + 404 fallback are handled by Netlify's default static serving.
# For per-prefix 404, scope errors_404 per directory or use _redirects:
#   /de/*  /de/404.html  404
#   /*     /404.html     404
```

```toml [Cloudflare Pages]
# The `cloudflare` adapter writes _routes.json (no worker) + _headers.
# Cloudflare Pages serves /404.html for unmatched URLs automatically.
# For per-locale 404, add a _redirects file (or let SSG's _redirects ride):
#   /de/*  /de/404.html  404
#   /*     /404.html     404
```

```yaml [GitHub Pages]
# GitHub Pages serves /404.html for unmatched URLs automatically.
# It 301-redirects /path → /path/ for directory URLs — set the sitemap to match:
#   seoPlugin({ sitemap: { trailingSlash: 'always', ... } })
# Per-directory 404 is NOT supported — only the root 404.html is served.
```

```json [Vercel (static)]
// The `vercel` adapter writes .vercel/output/config.json (v3 static).
// Vercel serves 404.html / clean URLs by convention; no extra config needed
// for the common case. Use the vercelRevalidateHandler for build-time ISR.
```

```nginx [nginx / self-hosted]
server {
  root /var/www/dist;
  # Clean URLs: /about → /about/index.html
  location / {
    try_files $uri $uri/ $uri/index.html /404.html =404;
  }
  # Long-cache the hashed assets the build emits.
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  error_page 404 /404.html;
}
```

:::

For **S3 + CloudFront**, set the bucket's error document to `404.html` (or a CloudFront Function that rewrites `/path` → `/path/index.html`); CloudFront has no native per-directory 404, so per-locale 404s need a function. The build summary log surfaces what landed: page count, `+ 404.html` (or `+ N 404 pages`), redirect count, `+ N revalidate path(s)`, elapsed ms, `(concurrency: N)`, `[adapter: name]`, and a per-locale breakdown `[en: 100, de: 100, cs: 100]` when i18n is active.

## Build artifacts reference

Files the SSG plugin may write to `dist/`. All `_`-prefixed files are internal manifests (static hosts shouldn't publish them; `seoPlugin` reads + cleans `_pyreon-ssg-paths.json`):

| File                          | When                                         | Consumed by                                  |
| ----------------------------- | -------------------------------------------- | -------------------------------------------- |
| `<path>/index.html`           | Per successfully-rendered path               | The static host                              |
| `404.html`, `<locale>/404.html` | `_404.tsx` exists, `emit404 !== false`     | Static host (unmatched-URL fallback)         |
| `_redirects`                  | A loader threw `redirect()`, `emitRedirects` | Netlify / Cloudflare Pages                   |
| `_redirects.json`             | Same                                         | Vercel                                       |
| `_headers`                    | `earlyHints`, or CF/Netlify adapter cache rules | Cloudflare Pages / Netlify                 |
| `_pyreon-ssg-paths.json`      | Any page rendered                            | `seoPlugin({ sitemap: { useSsgPaths: true } })` |
| `_pyreon-revalidate.json`     | A route exported `revalidate`                | Deployment adapter / `vercelRevalidateHandler` |
| `_pyreon-ssg-errors.json`     | `errors.length > 0`, `errorArtifact !== 'none'` | CI gates                                  |
| `sitemap.xml`, `robots.txt`, `rss.xml` | `seoPlugin({ sitemap / robots / rss })` | Search engines                              |
| `assets/pyreon-ssg.<hash>.css` | `cssMode: 'asset'`                          | Every page (shared `<link>`)                 |
| `.vercel/output/config.json`, `_routes.json`, `netlify.toml` | The matching adapter in SSG mode | The deploy platform        |

Manifest writes (`_redirects*`, `_pyreon-*.json`) are atomic (temp file + `rename`) so an interrupted build never leaves a half-written manifest an adapter or CI might misparse. Per-page HTML writes are intentionally non-atomic (individually-readable, no cross-file invariant, and the rename cost on 10k-path sites would be significant).

## Delivery polish

Four opt-in options tune how the prerendered pages *ship*:

- **`speculationRules: 'prefetch' | 'prerender'`** — emits a `<script type="speculationrules">` document-rules block into every prerendered page (Chrome's Speculation Rules API: near-instant navigations by prefetching — or fully prerendering — likely same-origin links, at `moderate` eagerness). Progressive enhancement; unsupported browsers ignore the block.
- **`viewTransitions: true`** — opts prerendered pages into cross-document View Transitions (`@view-transition { navigation: auto }`): MPA navigations between prerendered pages animate with zero JS in supporting browsers.
- **`cssMode: 'asset'`** — ships the styler's collected CSS as ONE content-hashed shared file (`assets/pyreon-ssg.<hash>.css`) linked from every page, instead of the default `'inline'` per-page `<style>` tag. Pages share the browser-cached file; HTML shrinks by the full sheet per page (one extra request on first visit). No-op without `@pyreon/styler`.
- **`earlyHints: true`** — writes per-path `Link: <chunk>; rel=modulepreload` entries into `_headers` for each page's route-chunk closure (the same delta the [modulepreload head tags](#per-route-link-relmodulepreload-islands-safe) carry). Cloudflare Pages and Netlify turn `Link` headers into HTTP 103 Early Hints, so the browser starts fetching route chunks before the HTML arrives. Appends to an existing `_headers` rather than clobbering it.

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
| `concurrency`     | `number`                                                    | `4`      | Parallel render workers (clamped to `>= 1`)              |
| `onProgress`      | `({ completed, total, currentPath, elapsed }) => void \| …`  | —        | Per-path settle callback                                 |
| `splitChunks`     | `boolean`                                                   | `true`   | Route-level code splitting                               |
| `modulePreload`   | `boolean`                                                   | `true`   | Per-route `<link rel="modulepreload">` delta (islands-safe) |
| `speculationRules`| `'prefetch' \| 'prerender' \| false`                         | off      | Speculation Rules block per prerendered page             |
| `viewTransitions` | `boolean`                                                   | off      | Cross-document View Transitions opt-in                   |
| `cssMode`         | `'inline' \| 'asset'`                                        | `'inline'` | Styler CSS inlined per page or one shared hashed file  |
| `earlyHints`      | `boolean`                                                   | off      | Per-path `Link:` modulepreload entries in `_headers` (HTTP 103) |

Top-level `i18n` (`I18nRoutingConfig`) drives per-locale route duplication; per-route `export const renderMode` overrides the app mode; per-route `export const revalidate` drives the build-time ISR manifest.

### `GetStaticPaths` shape

```ts
type GetStaticPaths<TParams = Record<string, string>> = () =>
  | Array<{ params: TParams }>
  | Promise<Array<{ params: TParams }>>
```

### `I18nRoutingConfig` shape

| Field           | Type                                | Default                  | Notes                                  |
| --------------- | ----------------------------------- | ------------------------ | -------------------------------------- |
| `locales`       | `string[]`                          | —                        | Required, validated                    |
| `defaultLocale` | `string`                            | —                        | Required, validated                    |
| `strategy`      | `'prefix' \| 'prefix-except-default'` | `'prefix-except-default'` | URL strategy                          |
| `detectLocale`  | `boolean`                           | `true`                   | Request-time only (`i18nRouting()`)    |
| `cookieName`    | `string`                            | `'locale'`               | Request-time only (`i18nRouting()`)    |

## Diagnostics — `pyreon doctor --check-ssg`

`pyreon doctor --check-ssg` runs the `ssg-audit` gate (equivalent to `pyreon doctor --only ssg-audit`) — a programmatic doctor gate that checks the SSG configuration and route tree for common mistakes before you build (e.g. a dynamic route missing `getStaticPaths`).

```bash
pyreon doctor --check-ssg
# or, with the unified gate API:
pyreon doctor --only ssg-audit
```

## Next Steps

- **[Zero](/docs/zero)** — the full meta-framework overview (routing, components, middleware, theme, adapters).
- **[Router](/docs/router)** — `redirect()`, loaders, and the routing primitives SSG builds on.
- **[Create Zero](/docs/create-zero)** — scaffolding (templates include `getStaticPaths` examples).
