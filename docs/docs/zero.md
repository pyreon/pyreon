---
title: Zero
description: Full-stack meta-framework for Pyreon applications.
---

`@pyreon/zero` is a batteries-included meta-framework for Pyreon, similar to Next.js for React or Nuxt for Vue. It provides file-system routing, SSR/SSG/ISR rendering modes, optimized components, a theme system, SEO utilities, font optimization, and production deployment adapters — everything you need to ship a full-stack Pyreon application.

<PackageBadge name="@pyreon/zero" href="/docs/zero" status="beta" />

## Installation

::: code-group

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

This gives you a working application with file-system routing, SSR, and hot module replacement out of the box.

## Configuration

Zero is configured as a set of Vite plugins in your `vite.config.ts`:

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero'
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

You can also use the `defineConfig` helper for type-safe configuration:

```ts
import { defineConfig } from '@pyreon/zero/config'

const config = defineConfig({
  mode: 'ssr',
  adapter: 'node',
  port: 3000,
})
```

### ZeroConfig Options

| Option           | Type                                                | Default        | Description                               |
| ---------------- | --------------------------------------------------- | -------------- | ----------------------------------------- |
| `mode`           | `"ssr" \| "ssg" \| "spa" \| "isr"`                  | `"ssr"`        | Global rendering mode                     |
| `vite`           | `Record<string, unknown>`                           | `&#123;&#125;` | Vite configuration overrides              |
| `ssr.mode`       | `"stream" \| "string"`                              | `"string"`     | SSR output mode                           |
| `ssg.paths`      | `string[] \| (() => string[] \| Promise<string[]>)` | `[]`           | Paths to prerender during build           |
| `isr.revalidate` | `number`                                            | `60`           | Seconds before revalidation for ISR pages |
| `adapter`        | `"node" \| "bun" \| "static"`                       | `"node"`       | Deployment adapter                        |
| `base`           | `string`                                            | `"/"`          | Base URL path                             |
| `middleware`     | `Middleware[]`                                      | `[]`           | Global server middleware                  |
| `port`           | `number`                                            | `3000`         | Dev/production server port                |

## File-System Routing

Routes live in `src/routes/`. The file path maps directly to the URL:

| File                            | URL          |
| ------------------------------- | ------------ |
| `src/routes/index.tsx`          | `/`          |
| `src/routes/about.tsx`          | `/about`     |
| `src/routes/users/[id].tsx`     | `/users/:id` |
| `src/routes/blog/[...slug].tsx` | `/blog/*`    |

### Special Files

| File           | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `_layout.tsx`  | Wraps all routes in the same directory and subdirectories |
| `_error.tsx`   | Error boundary for the route segment                      |
| `_loading.tsx` | Loading/suspense fallback for the route segment           |

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

### Virtual Module

Import the generated route table at runtime:

```ts
import { routes } from 'virtual:zero/routes'
```

This provides a fully typed route array ready to pass to the router.

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

// Optional: wrap the page in a layout
export function layout({ children }) {
  return <div class="user-layout">{children}</div>
}

// Optional: suspense fallback
export function loading() {
  return <div>Loading user...</div>
}

// Optional: error boundary
export function error({ error, reset }) {
  return (
    <div>
      Error: {error.message} <button on:click={reset}>Retry</button>
    </div>
  )
}

// Optional: server-side data loading
export async function loader({ params, query, request, signal }) {
  const user = await db.users.findById(params.id)
  return { name: user.name }
}

// Optional: middleware for this route
export function middleware(ctx) {
  // Return a Response to short-circuit, or undefined/void to pass through
}

// Optional: navigation guard
export function guard({ params }) {
  if (!params.id) return '/404'
  return true
}

// Optional: head/meta tags
export const meta = {
  title: 'User Profile',
  description: 'View user profile details',
}

// Optional: per-route rendering mode override
export const renderMode = 'ssr' // "ssr" | "ssg" | "spa" | "isr"
```

### Loader Context

| Property  | Type                     | Description                   |
| --------- | ------------------------ | ----------------------------- |
| `params`  | `Record<string, string>` | Dynamic route parameters      |
| `query`   | `Record<string, string>` | URL search parameters         |
| `request` | `Request`                | The incoming HTTP request     |
| `signal`  | `AbortSignal`            | Abort signal for cancellation |

## Rendering Modes

### SSR (Server-Side Rendering)

The default mode. Pages are rendered on the server for every request and sent as HTML to the client, then hydrated.

```ts
defineConfig({
  mode: 'ssr',
  ssr: { mode: 'stream' }, // "stream" for chunked transfer, "string" for buffered
})
```

### SSG (Static Site Generation)

Pages are prerendered at build time. Ideal for content that rarely changes.

```ts
defineConfig({
  mode: 'ssg',
  ssg: {
    paths: ['/', '/about', '/blog/hello-world'],
  },
})
```

When `mode: "ssg"` is set, `vite build` runs the regular client build, then triggers a programmatic SSR sub-build, loads the resulting handler, and writes one HTML file per path:

- `'/'` → `dist/index.html`
- `'/about'` → `dist/about/index.html`
- `'/blog/hello-world'` → `dist/blog/hello-world/index.html`

The temporary `dist/.zero-ssg-server/` artifacts are cleaned up automatically after rendering.

`ssg.paths` accepts three shapes:

- `string[]` — explicit list (most common)
- `() => string[]` — sync function, useful for deriving paths from a glob or static config
- `() => Promise<string[]>` — async function, useful for fetching paths from a CMS or database

If `ssg.paths` is omitted, the plugin auto-detects static paths from the file-system route tree — every route without a `:param` or `*` catch-all segment is included. **Dynamic routes** can opt in to enumeration by exporting `getStaticPaths` from the route file (see below). When no static paths exist, a single `/` fallback is always produced so the static host has at least an `index.html`.

#### `getStaticPaths` per-route export

Dynamic routes (e.g. `/posts/[id].tsx`) can enumerate concrete values by exporting `getStaticPaths`:

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

Sync or async are both supported (`() => Array<{ params }>` or `() => Promise<...>`). Catch-all routes (`[...slug].tsx`) work via `{ params: { slug: 'a/b' } }` → `/blog/a/b`. Errors during enumeration (function throws, returns non-array, missing params) are captured into `PrerenderResult.errors` and the build continues for other routes — SSG never aborts on a single bad enumerator.

Mirrors Astro's per-route convention. Reference: `packages/zero/zero/src/fs-router.ts:detectRouteExports`.

#### `_404.tsx` convention

Drop a `_404.tsx` (or `_not-found.tsx`) anywhere in the routes tree and SSG auto-emits `dist/404.html` at build time. Static hosts (Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront) serve `404.html` automatically for unmatched URLs:

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

The 404 page is rendered through the same head/styler pipeline as every other path (`@pyreon/styler` tag, `@pyreon/head` meta, asset preload links all land correctly). Disable with `ssg.emit404: false`.

**404 pages are wrapped in their parent layout's chrome.** The SSG renderer navigates the router to a synthetic non-matching probe URL per locale. `resolveRoute` walks the route tree finding the deepest parent `_layout.tsx` that contains a `notFoundComponent` (the `_404.tsx` you dropped) AND has children. It builds a matched chain `[...ancestorLayouts, syntheticLeaf]` and renders through the normal pipeline. Result: parent `_layout.tsx` components (sticky headers, footers, navigation chrome, PyreonUI provider) wrap the 404 content automatically — your branded chrome appears on the 404 page exactly as on regular pages. Standard Next.js / Remix behavior.

**Caveat — `notFoundComponent` walking requires a parent layout with `children`.** If a route record IS a leaf page (no `children` array, no inner `<RouterView />`) and yet declares `notFoundComponent`, the resolver can't insert the synthetic leaf at depth 1 — there's no `<RouterView />` slot at that depth. Such records fall back to the standalone render path (no layout wrapping). The canonical pattern (`_404.tsx` inside a `_layout.tsx` directory) always works correctly.

**Caveat — layout loaders run during 404 render.** The probe-URL navigation runs `router.preload()` on the matched chain, so any parent layout `loader()` fires during 404 emission. Most layout loaders fetch public navigation data; if a layout loader requires authenticated context the build-time render doesn't have, the loader should handle `request: undefined` and return a safe fallback. Loader-thrown `redirect()` from a parent layout during 404 render is captured into the redirect manifest (existing PR B behavior).

**Limitation — host routing required for unmatched URLs.** SSG writes `dist/404.html` but the static host (or your own reverse proxy) is responsible for SERVING it when an incoming URL doesn't match a prerendered file. Pyreon does not bundle a server for SSG output. Most managed static hosts wire this automatically:

- **Netlify** — serves `dist/404.html` for any unmatched path by convention. No config needed.
- **Cloudflare Pages** — serves `dist/404.html` for unmatched paths by convention. No config needed.
- **GitHub Pages** — serves `dist/404.html` for unmatched paths under the user/project site by convention. No config needed.
- **Vercel** — serves `dist/404.html` for unmatched paths by convention when deploying a static build.
- **S3 + CloudFront** — set the CloudFront error response for HTTP 404 to point at `/404.html` with response status 404. (CloudFront has no "404 file" convention; the rule is explicit.)
- **nginx** — add `error_page 404 /404.html;` inside the `server` block. Combine with `try_files $uri $uri/ $uri.html =404;` for directory-style routing.
- **Caddy** — add `handle_errors { @404 expression {http.error.status_code} == 404; rewrite @404 /404.html; file_server }` to the site block.

If you self-host on Node/Bun (i.e. you ARE running zero's runtime in `mode: 'ssr' | 'isr'`), the 404 routing is handled in-process by the framework — `dist/404.html` is for static-deploy scenarios only.

#### Per-locale 404 (i18n)

When `zero({ i18n: { locales, defaultLocale, strategy } })` is configured, SSG emits a 404 file PER LOCALE under each locale's directory prefix:

```text
dist/
├── 404.html              # default locale (or no-i18n)
├── de/
│   └── 404.html          # German 404
└── cs/
    └── 404.html          # Czech 404
```

Drop `_404.tsx` files in the routes tree the same way you drop pages — i18n route duplication fans the not-found components into per-locale variants automatically. If you only ship one `_404.tsx` at the routes root, every locale renders the SAME component (byte-identical HTML); SSG still emits the per-locale files so the static host's per-prefix 404 routing works.

**Host config for per-locale 404 routing.** The challenge is that a managed host's "convention" usually only serves `dist/404.html` at the root — it doesn't know that `/de/unknown-page` should fall through to `dist/de/404.html`. You have to wire that explicitly:

- **Netlify** — add a `[[redirects]]` block per locale to `netlify.toml`:

  ```toml
  [[redirects]]
    from = "/de/*"
    to = "/de/404.html"
    status = 404

  [[redirects]]
    from = "/cs/*"
    to = "/cs/404.html"
    status = 404
  ```

  The unprefixed `/*` fallback to `dist/404.html` is automatic; the per-locale rules need explicit declarations.

- **Cloudflare Pages** — extend `_routes.json` and add a custom `errorPage` per locale via the `_redirects` shape:

  ```text
  /de/* /de/404.html 404
  /cs/* /cs/404.html 404
  ```

  This is the same `_redirects` syntax Pyreon emits for loader-thrown redirects (PR B). The 404 entries can be appended after the loader-redirects (last-matching-rule wins, so put specific routes BEFORE the catch-all locale 404s).

- **GitHub Pages** — does NOT support per-directory 404 customization out of the box. All unmatched URLs serve the root `dist/404.html`. If per-locale 404 is required, deploy via a different host or use a build-time redirect generator.

- **nginx** — split locations per locale:

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

- **Caddy** — same pattern, per-locale matcher:

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

Without per-locale host routing the framework emits the right files, but unmatched URLs under `/de/...` serve the DEFAULT-locale 404 (or whatever the host's convention is for unmatched paths) — the per-locale variants exist on disk but the host never reaches them.

**Why no built-in solution.** Static hosts vary widely in their routing primitives; Pyreon would either need to ship a manifest each host consumes (and stay in sync as host APIs evolve) or run its own request-time router (defeating the static-deploy model). Documenting the explicit host snippets keeps the deploy contract honest. If you want runtime per-locale 404 routing without host config, run zero in `mode: 'ssr'` instead — the framework's request handler walks the matched chain and renders the locale-aware 404 in-process.

#### Redirect handling during SSG

Throw `redirect(url, status?)` inside a route loader and SSG catches it during prerender:

```tsx
import { redirect } from '@pyreon/router'

export const loader = ({ params }) => {
  if (params.slug === 'old-name') throw redirect('/blog/new-name', 301)
  return loadPost(params.slug)
}
```

During SSG, redirects are written to a `_redirects` manifest file at the build root (Netlify-compatible format). The path is skipped from prerender output. CSR (client navigation) catches the same `redirect()` and routes through `router.replace()` automatically.

#### Sitemap auto-emit

`dist/sitemap.xml` is generated automatically from the resolved SSG path set (post-`getStaticPaths` expansion). Configure via `seo.sitemap`:

```ts
defineConfig({
  mode: 'ssg',
  seo: {
    siteUrl: 'https://example.com',
    sitemap: { changefreq: 'weekly', priority: 0.8 },
  },
})
```

#### `onPathError` callback + error artifact

When SSG hits a per-path render error, it captures it into `PrerenderResult.errors` and continues. Inspect or fail the build via `onPathError`:

```ts
defineConfig({
  mode: 'ssg',
  ssg: {
    onPathError: ({ path, error }) => {
      console.error(`[ssg] ${path}: ${error.message}`)
      // throw to fail the build, or return to continue
    },
  },
})
```

The full error set is also written to `dist/_pyreon-ssg-errors.json` (path, error message, stack) so CI gates can post-process it. Successful builds with zero errors omit the file.

#### `zeroPlugin()` returns `Plugin[]`

Since the SSG runtime landed, `zeroPlugin()` returns `Plugin[]` (`[mainPlugin]` for non-SSG modes, `[mainPlugin, ssgPlugin]` for SSG). Vite's plugins array natively accepts nested arrays, so `plugins: [pyreon(), zero()]` keeps working unchanged. Only downstream test code that asserted `zeroPlugin()` returns a single Plugin needs `[0]` or array-aware access.

### SPA (Single-Page Application)

Client-only rendering. The server sends a minimal HTML shell and all rendering happens in the browser.

```ts
defineConfig({
  mode: 'spa',
})
```

### ISR (Incremental Static Regeneration)

Pyreon ships ISR in **two complementary layers**: a runtime in-memory cache (when you self-host on Node/Bun) and a build-time manifest that drives platform ISR on managed hosts (Vercel / Cloudflare / Netlify). They can coexist or you can use either alone.

#### Runtime ISR — `mode: 'isr'`

In-memory LRU cache with stale-while-revalidate semantics. The handler renders on first request, caches the response, serves stale + revalidates in the background after the revalidation window.

```ts
defineConfig({
  mode: 'isr',
  isr: {
    revalidate: 60, // seconds
    maxEntries: 1000, // LRU cap (default)
  },
})
```

The cache is **bounded by `maxEntries`** (default 1000) with oldest-first LRU eviction so unbounded URL spaces like `/user/:id` don't grow memory without limit.

##### ⚠️ Auth-gated routes need a custom `cacheKey`

The default cache key is `url.pathname` ONLY — query strings, cookies, and request headers are stripped. **This is unsafe for personalized content.** A loader that reads `request.headers.get('cookie')` to gate auth will render ONCE with the first user's cookie, then serve that same HTML to every subsequent user.

Use `cacheKey` to vary by cookies / query / headers:

```ts
defineConfig({
  mode: 'isr',
  isr: {
    revalidate: 60,
    // Vary cache by session cookie — each user gets their own cache entry
    cacheKey: (req) => {
      const url = new URL(req.url)
      const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
      return `${url.pathname}::${session}`
    },
  },
})
```

```ts
// Or vary by a query parameter:
isr: {
  revalidate: 60,
  cacheKey: (req) => {
    const url = new URL(req.url)
    return `${url.pathname}?sort=${url.searchParams.get('sort') ?? ''}`
  },
}
```

If you can't safely derive a cache key for personalized content, use `mode: 'ssr'` for those routes instead.

#### Build-time ISR — per-route `revalidate` exports

For managed static hosts (Vercel / Cloudflare Pages / Netlify), declare per-route revalidation intervals via the `revalidate` export. The SSG plugin emits `dist/_pyreon-revalidate.json` mapping `{ concretePath: revalidateSeconds }` for every prerendered path:

```ts
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

Or disable revalidation explicitly:

```ts
export const revalidate = false // never revalidate
```

The literal value (`60` or `false`) is captured at build time. **Non-literal expressions are silently omitted** — `export const revalidate = TTL` (where `TTL` is a const elsewhere) won't reach the manifest. Always export inline literals.

The manifest produced at `dist/_pyreon-revalidate.json` looks like:

```json
{
  "/posts/1": 60,
  "/posts/2": 60,
  "/posts/3": 60
}
```

#### `Adapter.revalidate(path)` — platform integration

Deploy adapters consume the manifest and integrate with each platform's ISR API:

| Adapter | Mechanism | Env vars |
| --- | --- | --- |
| `vercelAdapter` | POST to `<deployment>/api/_pyreon-revalidate?path=…&secret=…` | `VERCEL_DEPLOYMENT_URL`, `VERCEL_REVALIDATE_TOKEN` |
| `cloudflareAdapter` | POST to `zones/{id}/purge_cache` (edge cache invalidation) | `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_SITE_URL` |
| `netlifyAdapter` | POST to Build Hook URL (full-site rebuild, path in audit log) | `NETLIFY_BUILD_HOOK_URL` |
| `staticAdapter` / `nodeAdapter` / `bunAdapter` | no-op (use runtime ISR for self-hosted) | — |

**Vercel** requires a user-side webhook handler at `/api/_pyreon-revalidate`. You write that endpoint, validate the secret, and call Vercel's `res.revalidate()` API. (A future `@pyreon/zero/vercel-revalidate-handler` helper will scaffold this — track in the roadmap.)

**Cloudflare** has a rate limit: ~1000 purges per 24h per zone. High-volume revalidation can hit the cap; the adapter returns `{ regenerated: false }` on 429 responses but doesn't surface the underlying reason — monitor your CMS publish frequency.

**Netlify's** build hook triggers a FULL site rebuild, not per-page ISR. The `path` argument flows into the `trigger_title` field for audit-log traceability only.

If required env vars are missing, the adapter returns `{ regenerated: false }` and warns in dev mode. **Production deployments do not currently warn on missing env vars** — verify your env config before deploying.

#### Combining the two layers

You can use BOTH runtime ISR (`mode: 'isr'`) AND per-route `revalidate` exports on the same app. The runtime layer caches in-memory; the build-time layer drives platform ISR rebuilds. Both layers can coexist correctly:

- **Self-hosted (Node / Bun)** → `mode: 'isr'` for in-process caching; `revalidate` exports unused (no platform to call)
- **Vercel / Cloudflare / Netlify (static)** → per-route `revalidate` + adapter; runtime cache typically not needed
- **Hybrid SSR + ISR** → `mode: 'isr'` runtime cache + per-route `revalidate` for platform rebuild signals when a CMS publishes

## Components

### Image

Optimized image component with lazy loading, responsive srcset generation, blur-up placeholders, and priority loading.

```tsx
import { Image } from "@pyreon/zero"

<Image
  src="/photos/hero.jpg"
  alt="Hero image"
  width={1200}
  height={600}
  priority          // skip lazy loading for above-the-fold images
  placeholder="blur" // blur-up placeholder while loading
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// Responsive with automatic srcset
<Image
  src="/photos/product.jpg"
  alt="Product"
  width={800}
  height={800}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
/>
```

### Link

Client-side navigation link with prefetching and active state tracking.

```tsx
import { Link } from "@pyreon/zero"

<Link href="/about">About</Link>

// Prefetch strategies
<Link href="/dashboard" prefetch="hover">Dashboard</Link>
<Link href="/settings" prefetch="viewport">Settings</Link>
<Link href="/admin" prefetch="none">Admin</Link>
```

| Prop               | Type                              | Default          | Description                                               |
| ------------------ | --------------------------------- | ---------------- | --------------------------------------------------------- |
| `href`             | `string`                          | required         | Navigation target                                         |
| `prefetch`         | `"hover" \| "viewport" \| "none"` | `"hover"`        | When to prefetch the route                                |
| `activeClass`      | `string`                          | `"active"`       | CSS class applied when the link matches the current route |
| `exactActiveClass` | `string`                          | `"exact-active"` | CSS class for exact route match                           |

### Link API (Three Levels)

Zero provides the `Link` system at three levels of abstraction:

**1. `useLink(props)` — Composable with full control**

```tsx
import { useLink } from '@pyreon/zero'

function CustomNav({ href, children }) {
  const { isActive, isExactActive, navigate, prefetch } = useLink({ href })

  return (
    <button class={isActive() ? 'active' : ''} on:click={navigate} on:mouseenter={prefetch}>
      {children}
    </button>
  )
}
```

**2. `createLink(Component)` — HOC wrapping any component**

```tsx
import { createLink } from "@pyreon/zero"

function FancyButton({ isActive, children, ...props }) {
  return (
    <button class={isActive ? "fancy-active" : "fancy"} {...props}>
      {children}
    </button>
  )
}

const FancyLink = createLink(FancyButton)

// Usage
<FancyLink href="/dashboard">Dashboard</FancyLink>
```

**3. `Link` — Default `<a>`-based link**

```tsx
import { Link } from '@pyreon/zero'

;<Link href="/about">About</Link>
```

### Script

Optimized third-party script loading with multiple strategies:

```tsx
import { Script } from "@pyreon/zero"

// Load before hydration (blocking)
<Script src="https://cdn.example.com/critical.js" strategy="beforeHydration" />

// Load after hydration (non-blocking)
<Script src="https://cdn.example.com/analytics.js" strategy="afterHydration" />

// Load when browser is idle
<Script src="https://cdn.example.com/widget.js" strategy="onIdle" />

// Load on user interaction
<Script src="https://cdn.example.com/chat.js" strategy="onInteraction" />

// Load when element enters viewport
<Script src="https://cdn.example.com/video.js" strategy="onViewport" />
```

| Strategy          | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `beforeHydration` | Loads synchronously before the app hydrates. Use sparingly.                     |
| `afterHydration`  | Loads asynchronously after hydration completes.                                 |
| `onIdle`          | Loads during `requestIdleCallback`. Good for non-critical scripts.              |
| `onInteraction`   | Loads when the user interacts with the page (click, scroll, keydown).           |
| `onViewport`      | Loads when the script's container enters the viewport via IntersectionObserver. |

## Theme System

Built-in dark/light theme support with FOUC prevention.

```tsx
import {
  theme,
  resolvedTheme,
  toggleTheme,
  setTheme,
  initTheme,
  ThemeToggle,
  themeScript,
} from '@pyreon/zero'
```

### Usage

```tsx
import { theme, resolvedTheme, toggleTheme, setTheme, ThemeToggle } from '@pyreon/zero'

function Header() {
  return (
    <header>
      <p>Current theme: {theme()}</p>
      <p>Resolved (system-aware): {resolvedTheme()}</p>
      <button on:click={toggleTheme}>Toggle</button>
      <button on:click={() => setTheme('dark')}>Force Dark</button>
      <button on:click={() => setTheme('light')}>Force Light</button>
      <button on:click={() => setTheme('system')}>System</button>

      {/* Or use the built-in toggle component */}
      <ThemeToggle />
    </header>
  )
}
```

### Preventing FOUC

Add `themeScript` to your HTML `<head>` to apply the theme before the first paint:

```tsx
import { themeScript } from '@pyreon/zero'

function Document() {
  return (
    <html>
      <head>
        <script>{themeScript}</script>
      </head>
      <body>{/* ... */}</body>
    </html>
  )
}
```

Call `initTheme()` during app startup to initialize the reactive theme state from `localStorage` and system preferences:

```tsx
import { initTheme } from '@pyreon/zero'

initTheme()
```

### Theme API

| Export          | Type                                         | Description                                                        |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `theme`         | `() => "light" \| "dark" \| "system"`        | Reactive signal returning the current theme preference             |
| `resolvedTheme` | `() => "light" \| "dark"`                    | Reactive signal returning the resolved theme (resolves `"system"`) |
| `toggleTheme`   | `() => void`                                 | Toggles between light and dark                                     |
| `setTheme`      | `(t: "light" \| "dark" \| "system") => void` | Sets theme explicitly                                              |
| `initTheme`     | `() => void`                                 | Initializes theme from storage/system preference                   |
| `ThemeToggle`   | Component                                    | Pre-built toggle button component                                  |
| `themeScript`   | `string`                                     | Inline script to prevent FOUC                                      |

## Middleware

Built-in server middleware for common tasks:

### cacheMiddleware

Applies `Cache-Control` headers based on asset type:

```ts
import { cacheMiddleware } from '@pyreon/zero'

cacheMiddleware({
  immutable: 31536000, // Hashed assets (1 year, default)
  static: 86400, // Static assets (1 day, default)
  pages: 0, // HTML pages (no cache, default)
  staleWhileRevalidate: 60, // SWR window in seconds (default)
  rules: [
    // Custom per-path overrides
    { match: '/api/*', control: 'no-store' },
  ],
})
```

| Option                 | Type          | Default    | Description                             |
| ---------------------- | ------------- | ---------- | --------------------------------------- |
| `immutable`            | `number`      | `31536000` | Max-age for hashed/fingerprinted assets |
| `static`               | `number`      | `86400`    | Max-age for static assets               |
| `pages`                | `number`      | `0`        | Max-age for HTML pages                  |
| `staleWhileRevalidate` | `number`      | `60`       | Stale-while-revalidate window           |
| `rules`                | `CacheRule[]` | `[]`       | Custom rules with glob pattern matching |

### securityHeaders

Adds security-related HTTP headers (Content-Security-Policy, X-Frame-Options, etc.):

```ts
import { securityHeaders } from '@pyreon/zero'

// Use in your server middleware
securityHeaders()
```

### varyEncoding

Adds `Vary: Accept-Encoding` header for proper CDN caching:

```ts
import { varyEncoding } from '@pyreon/zero'

varyEncoding()
```

## API Routes

API routes are `.ts` files in `src/routes/api/` that export HTTP method handlers. They run on the server and return `Response` objects directly.

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

### File path conventions

| File                            | URL                  |
| ------------------------------- | -------------------- |
| `src/routes/api/posts.ts`       | `/api/posts`         |
| `src/routes/api/posts/index.ts` | `/api/posts`         |
| `src/routes/api/posts/[id].ts`  | `/api/posts/:id`     |
| `src/routes/api/[...path].ts`   | `/api/*` (catch-all) |

### ApiContext

| Property  | Type                     | Description               |
| --------- | ------------------------ | ------------------------- |
| `request` | `Request`                | The incoming HTTP request |
| `url`     | `URL`                    | Parsed URL                |
| `path`    | `string`                 | URL path                  |
| `params`  | `Record<string, string>` | Dynamic route parameters  |
| `headers` | `Headers`                | Request headers           |

### Wiring API routes

```ts title="src/entry-server.ts"
import { apiRoutes } from "virtual:zero/api-routes"

export default createServer({
  routes,
  apiRoutes, // API routes run before SSR — matched by URL + HTTP method
  middleware: [...],
})
```

Unsupported methods automatically return `405 Method Not Allowed` with an `Allow` header.

### CORS Middleware

```ts
import { corsMiddleware } from '@pyreon/zero/cors'

// Allow any origin
corsMiddleware()

// Specific origins with credentials
corsMiddleware({
  origin: ['https://app.com', 'https://admin.com'],
  credentials: true,
  maxAge: 86400,
})

// Dynamic origin matching
corsMiddleware({
  origin: (o) => o.endsWith('.example.com'),
})
```

| Option           | Type                                                | Default                                           | Description               |
| ---------------- | --------------------------------------------------- | ------------------------------------------------- | ------------------------- |
| `origin`         | `string \| string[] \| (origin: string) => boolean` | `"*"`                                             | Allowed origins           |
| `methods`        | `string[]`                                          | `["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` | Allowed methods           |
| `allowedHeaders` | `string[]`                                          | `["Content-Type","Authorization"]`                | Allowed request headers   |
| `exposedHeaders` | `string[]`                                          | `[]`                                              | Headers exposed to client |
| `credentials`    | `boolean`                                           | `false`                                           | Allow credentials         |
| `maxAge`         | `number`                                            | `86400`                                           | Preflight cache (seconds) |

### Rate Limiting

```ts
import { rateLimitMiddleware } from '@pyreon/zero/rate-limit'

// 100 requests per minute (default)
rateLimitMiddleware()

// Strict API rate limiting
rateLimitMiddleware({
  max: 20,
  window: 60,
  include: ['/api/*'],
})
```

| Option    | Type              | Default   | Description                |
| --------- | ----------------- | --------- | -------------------------- |
| `max`     | `number`          | `100`     | Max requests per window    |
| `window`  | `number`          | `60`      | Window in seconds          |
| `keyFn`   | `(ctx) => string` | IP-based  | Client identifier function |
| `include` | `string[]`        | all paths | URL patterns to rate limit |
| `exclude` | `string[]`        | `[]`      | URL patterns to skip       |

Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers. Returns `429 Too Many Requests` with `Retry-After` when exceeded.

### Compression

```ts
import { compressionMiddleware } from '@pyreon/zero/compression'

compressionMiddleware({ threshold: 1024, encodings: ['gzip'] })
```

Compresses text-based responses (HTML, JSON, JS, CSS, XML, SVG) using the native `CompressionStream` API. Skips binary content and responses below the threshold.

## Server Actions

Define server-side mutations that are callable from the client. Actions receive parsed JSON or FormData and are mounted at `/_zero/actions/*`.

```ts title="src/features/posts.ts"
import { defineAction } from '@pyreon/zero/actions'

export const createPost = defineAction(async (ctx) => {
  const { title, body } = ctx.json as { title: string; body: string }
  const post = await db.posts.create({ title, body })
  return { success: true, id: post.id }
})

export const deletePost = defineAction(async (ctx) => {
  const { id } = ctx.json as { id: number }
  await db.posts.delete(id)
  return { success: true }
})
```

Call actions from components — they're just async functions:

```tsx
import { createPost } from '../features/posts'

function NewPostForm() {
  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const result = await createPost({ title: 'Hello', body: 'World' })
    if (result.success) window.location.href = `/posts/${result.id}`
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### ActionContext

| Property   | Type               | Description                                  |
| ---------- | ------------------ | -------------------------------------------- |
| `request`  | `Request`          | The original HTTP request                    |
| `json`     | `unknown`          | Parsed JSON body (for `application/json`)    |
| `formData` | `FormData \| null` | Parsed form data (for `multipart/form-data`) |
| `headers`  | `Headers`          | Request headers                              |

### Action Middleware

Mount the action handler in your server entry:

```ts title="src/entry-server.ts"
import { createActionMiddleware } from '@pyreon/zero/actions'

export default createServer({
  routes,
  middleware: [
    createActionMiddleware(), // handles /_zero/actions/* requests
    securityHeaders(),
    cacheMiddleware(),
  ],
})
```

## Per-Route Middleware

Route files can export a `middleware` function that runs on the server before rendering. Middleware uses `@pyreon/server`'s signature:

```tsx title="src/routes/(admin)/dashboard.tsx"
import type { MiddlewareContext } from '@pyreon/server'

// Runs on every request to /dashboard
export const middleware = (ctx: MiddlewareContext) => {
  const token = ctx.req.headers.get('authorization')
  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }
  // Return void to continue to rendering
}
```

Wire route middleware in your server entry:

```ts title="src/entry-server.ts"
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { createServer } from '@pyreon/zero'

export default createServer({
  routes,
  routeMiddleware, // per-route middleware dispatched before global middleware
  middleware: [securityHeaders(), cacheMiddleware()],
})
```

Add the virtual module type to your `env.d.ts`:

```ts title="env.d.ts"
declare module 'virtual:zero/route-middleware' {
  import type { RouteMiddlewareEntry } from '@pyreon/zero'
  export const routeMiddleware: RouteMiddlewareEntry[]
}
```

## SEO

### Sitemap Generation

```ts
import { generateSitemap } from '@pyreon/zero'

const sitemap = generateSitemap(['/', '/about', '/blog/hello-world'], {
  origin: 'https://example.com',
  changefreq: 'weekly',
  priority: 0.8,
})
```

| Option            | Type             | Default  | Description                              |
| ----------------- | ---------------- | -------- | ---------------------------------------- |
| `origin`          | `string`         | required | Base URL for the sitemap                 |
| `changefreq`      | `ChangeFreq`     | —        | Default change frequency for all entries |
| `priority`        | `number`         | `0.7`    | Default priority for all entries         |
| `exclude`         | `string[]`       | `[]`     | Paths to exclude from the sitemap        |
| `additionalPaths` | `SitemapEntry[]` | `[]`     | Extra entries to include                 |

### Robots.txt

```ts
import { generateRobots } from '@pyreon/zero'

const robots = generateRobots({
  rules: [
    {
      userAgent: '*',
      allow: ['/'],
      disallow: ['/admin', '/api'],
    },
  ],
  sitemap: 'https://example.com/sitemap.xml',
})
```

### JSON-LD

```tsx
import { jsonLd } from '@pyreon/zero'

function ProductPage({ product }) {
  return (
    <>
      {jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'USD',
        },
      })}
      <h1>{product.name}</h1>
    </>
  )
}
```

### SEO Vite Plugin

Auto-generates `sitemap.xml` and `robots.txt` at build time:

```ts title="vite.config.ts"
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    seoPlugin({
      sitemap: {
        origin: 'https://example.com',
        changefreq: 'weekly',
        priority: 0.8,
      },
      robots: {
        rules: [{ userAgent: '*', allow: ['/'] }],
        sitemap: 'https://example.com/sitemap.xml',
      },
    }),
  ],
}
```

### SEO Dev Middleware

Serves sitemap and robots in development:

```ts
import { seoMiddleware } from '@pyreon/zero'

seoMiddleware({
  sitemap: {
    origin: 'http://localhost:3000',
  },
})
```

## Font Optimization

The `fontPlugin` automatically downloads Google Fonts at build time and self-hosts them, eliminating external requests in production. In development, it falls back to the CDN.

```ts title="vite.config.ts"
import { fontPlugin } from '@pyreon/zero/font'

export default {
  plugins: [
    fontPlugin({
      google: [
        'Inter:wght@400;500;700', // String shorthand
        { family: 'Fira Code', weights: [400, 700] }, // Static font object
        { family: 'Roboto Flex', weightRange: [100, 900], variable: true }, // Variable font
      ],
      local: [{ family: 'Custom Font', src: './fonts/custom.woff2', weight: 400 }],
      display: 'swap', // font-display strategy (default: "swap")
      preload: true, // Preload fonts (default: true)
      selfHost: true, // Self-host at build time (default: true)
      fallbacks: {
        // CLS-reducing fallback metrics
        Inter: {
          fallback: 'Arial',
          sizeAdjust: 1.07,
          ascentOverride: 0.9,
        },
      },
    }),
  ],
}
```

### Font Config

| Option      | Type                              | Default        | Description                                       |
| ----------- | --------------------------------- | -------------- | ------------------------------------------------- |
| `google`    | `GoogleFontInput[]`               | `[]`           | Google Font families (string shorthand or object) |
| `local`     | `LocalFont[]`                     | `[]`           | Local font files                                  |
| `display`   | `FontDisplay`                     | `"swap"`       | `font-display` strategy                           |
| `preload`   | `boolean`                         | `true`         | Whether to preload fonts                          |
| `selfHost`  | `boolean`                         | `true`         | Download and self-host at build time              |
| `fallbacks` | `Record<string, FallbackMetrics>` | `&#123;&#125;` | CLS-reducing fallback font metrics                |

### Font CSS Variables

Generate CSS custom properties for font families:

```ts
import { fontVariables } from '@pyreon/zero'

const vars = fontVariables({ Inter: "'Inter', sans-serif", 'Fira Code': "'Fira Code', monospace" })
// Returns CSS like:
// --font-inter: 'Inter', sans-serif;
// --font-fira-code: 'Fira Code', monospace;
```

## Image Processing

The `imagePlugin` provides build-time image optimization. Import images with `?optimize` to generate responsive srcsets and modern formats automatically.

```ts title="vite.config.ts"
import { imagePlugin } from '@pyreon/zero/image-plugin'

export default {
  plugins: [
    imagePlugin({
      widths: [640, 1024, 1920], // Responsive breakpoints (default)
      formats: ['webp'], // Output formats (default). Options: "webp", "avif", "jpeg", "png"
      quality: 80, // Lossy format quality 1-100 (default: 80)
      placeholderSize: 16, // Blur placeholder size in px (default: 16)
      outDir: 'assets/img', // Output subdirectory (default: "assets/img")
      include: /\.(jpe?g|png|webp|avif)$/i, // File patterns to process (default)
    }),
  ],
}
```

### Usage in Components

```tsx
// Import with ?optimize to get a ProcessedImage object
import hero from './images/hero.jpg?optimize'
// hero = { src, srcset, width, height, placeholder, formats, sources }

import { Image } from '@pyreon/zero'

;<Image {...hero} alt="Hero" priority />
```

The plugin uses [sharp](https://sharp.pixelplumbing.com/) for image processing. If sharp is not installed, images are copied as-is with a build-time warning.

## ISR Handler

For custom ISR logic outside the config, use `createISRHandler` directly:

```ts
import { createISRHandler } from '@pyreon/zero'

const handler = createISRHandler(
  async (request) => {
    const html = await renderPage(request)
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  },
  {
    revalidate: 60, // seconds between revalidations
  },
)
```

The handler uses an in-memory cache with stale-while-revalidate semantics. Cached responses are served immediately while a background revalidation refreshes the entry.

## Adapters

Adapters tailor the build output for different deployment targets.

| Adapter  | Description                                    |
| -------- | ---------------------------------------------- |
| `node`   | Standard Node.js HTTP server output            |
| `bun`    | Optimized for Bun's HTTP server                |
| `static` | Outputs static HTML/CSS/JS files (for SSG/SPA) |

Set the adapter in your config:

```ts
defineConfig({
  adapter: 'bun',
})
```

Or use the adapter API directly:

```ts
import { resolveAdapter, nodeAdapter, bunAdapter, staticAdapter } from '@pyreon/zero'

const adapter = resolveAdapter(config) // Resolves based on config.adapter
```

Each adapter implements a `build()` method that receives the server entry, client output, and output directory paths.

## API Functions

### createApp

Assembles the full application shell with router, head provider, and root layout. Returns both the App component and the router instance:

```tsx
import { createApp } from '@pyreon/zero'

const { App, router } = createApp({
  routes, // from virtual:zero/routes or manual definition
  routerMode: 'history', // "history" (default) or "hash"
  url: '/', // Initial URL for SSR
  layout: RootLayout, // Optional root layout component
  errorComponent: GlobalError, // Optional global error boundary
})
```

### createServer

Creates a production SSR request handler:

```ts
import { createServer } from '@pyreon/zero'

const handler = createServer({
  routes,
  routeMiddleware, // Per-route middleware from virtual:zero/route-middleware
  config: { mode: 'ssr' },
  middleware: [securityHeaders(), cacheMiddleware()],
  template: indexHtml, // HTML template string
  clientEntry: '/src/main.tsx', // Client entry point path
})
```

### startClient

Client-side hydration or mounting, imported from `@pyreon/zero/client`:

```ts
import { startClient } from '@pyreon/zero/client'

startClient({
  routes,
  layout: RootLayout, // Optional root layout component
})
```

The client automatically detects whether to hydrate (if SSR-rendered HTML is present) or mount fresh (SPA mode).

## Testing Utilities

Test helpers for middleware and API routes, imported from `@pyreon/zero/testing`.

### Testing Middleware

```ts
import { testMiddleware } from '@pyreon/zero/testing'
import { corsMiddleware } from '@pyreon/zero/cors'

const { response, headers } = await testMiddleware(corsMiddleware({ origin: '*' }), '/api/posts')
expect(headers.get('Access-Control-Allow-Origin')).toBe('*')
```

### Testing API Routes

```ts
import { createTestApiServer } from '@pyreon/zero/testing'

const server = createTestApiServer([
  { pattern: '/api/posts', module: { GET: () => Response.json([]) } },
])

const res = await server.request('/api/posts')
expect(res.status).toBe(200)

const res2 = await server.request('/api/posts', {
  method: 'POST',
  body: { title: 'Hello' },
})
expect(res2.status).toBe(201)
```

### Mock Handlers

```ts
import { createMockHandler } from '@pyreon/zero/testing'

const handler = createMockHandler({ status: 200, body: { ok: true } })
// ... use in API route module
expect(handler.calls).toHaveLength(1)
expect(handler.calls[0].params).toEqual({ id: '123' })
```

| Export                              | Description                               |
| ----------------------------------- | ----------------------------------------- |
| `createTestContext(path, options)`  | Create mock `MiddlewareContext`           |
| `testMiddleware(mw, path, options)` | Run middleware, return response + headers |
| `createTestApiServer(routes)`       | Test API routes via `server.request()`    |
| `createMockHandler(config)`         | Mock handler that records calls           |

## Client-Safe Entry Points

`@pyreon/zero` is split into client-safe and server-only entry points:

- **`@pyreon/zero`** — Client-safe exports only: components (`Image`, `Link`, `Script`, `ThemeToggle`), theme system, middleware configuration, SEO helpers, font/image plugins, adapters
- **`@pyreon/zero/server`** — Server-only exports: `createServer`, `createSSRHandler`, env validation, request locals, CSP nonce generation

Importing server-only APIs from the main `@pyreon/zero` entry gives clear error messages:

```ts
// This works (client-safe):
import { Image, Link, theme } from '@pyreon/zero'

// This works (server-only):
import { createServer, validateEnv } from '@pyreon/zero/server'

// This throws a helpful error at import time:
// import { createServer } from '@pyreon/zero'
// Error: "createServer is server-only. Import from '@pyreon/zero/server' instead."
```

## Deployment Adapters

In addition to the Node, Bun, and static adapters, Zero now supports platform-specific deployment:

```ts
import { vercelAdapter } from '@pyreon/zero/adapter-vercel'
import { cloudflareAdapter } from '@pyreon/zero/adapter-cloudflare'
import { netlifyAdapter } from '@pyreon/zero/adapter-netlify'

defineConfig({
  adapter: vercelAdapter(),
})
```

| Adapter      | Description                                              |
| ------------ | -------------------------------------------------------- |
| `node`       | Standard Node.js HTTP server                             |
| `bun`        | Optimized for Bun's HTTP server                          |
| `static`     | Static HTML/CSS/JS output (for SSG/SPA)                  |
| `vercel`     | Vercel serverless functions with edge runtime support     |
| `cloudflare` | Cloudflare Pages with Workers runtime                    |
| `netlify`    | Netlify Functions with streaming response support        |

## CSP Middleware

Content Security Policy middleware with nonce support for inline scripts:

```ts
import { cspMiddleware } from '@pyreon/zero/server'

cspMiddleware({
  directives: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'nonce'"], // nonce auto-injected
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
  },
})
```

Use `useNonce()` in components to get the per-request nonce for inline scripts:

```tsx
import { useNonce } from '@pyreon/zero/server'

function InlineScript() {
  const nonce = useNonce()
  return <script nonce={nonce}>console.log('safe')</script>
}
```

## Environment Validation

Type-safe environment variable validation with automatic coercion:

```ts
import { validateEnv, schema, publicEnv } from '@pyreon/zero/server'

// Validate and coerce env vars at startup:
const env = validateEnv({
  PORT: 3000,           // number, defaults to 3000
  DEBUG: false,         // boolean, defaults to false
  API_KEY: String,      // required string (no default)
  DATABASE_URL: String, // required string
})

// Custom parser:
const env2 = validateEnv({
  ALLOWED_ORIGINS: schema((v) => v.split(',')),
})

// Client-safe subset (only PUBLIC_ prefixed vars):
const pub = publicEnv()
// pub.PUBLIC_API_URL — available in client bundles
```

## Request Logging

Structured request logging middleware:

```ts
import { loggerMiddleware } from '@pyreon/zero/server'

loggerMiddleware() // logs method, path, status, duration
```

## AI Integration

The `aiPlugin()` Vite plugin generates AI-friendly metadata:

```ts
import { aiPlugin } from '@pyreon/zero/server'

// In vite.config.ts plugins array:
aiPlugin()
```

This generates:
- `llms.txt` — concise framework reference for LLM context
- JSON-LD inference metadata in HTML output
- AI plugin manifest at `/.well-known/ai-plugin.json`

## useRequestLocals

Bridge middleware locals into the component tree:

```tsx
import { useRequestLocals } from '@pyreon/zero/server'

// In middleware: ctx.locals.user = authenticatedUser
// In component:
function Dashboard() {
  const locals = useRequestLocals<{ user: User }>()
  return <h1>Welcome, {locals.user.name}</h1>
}
```

## Locale-Aware Favicons

Generate per-locale favicons from source SVG/PNG files:

```ts
import { faviconPlugin } from '@pyreon/zero'

faviconPlugin({
  source: './icon.svg',
  locales: {
    de: { source: './icon-de.svg' },
    ja: { source: './icon-ja.svg' },
  },
})
```

## OG Image Generation

Build-time Open Graph image generation:

```ts
import { ogImagePlugin } from '@pyreon/zero'

ogImagePlugin({
  templates: {
    default: './og-template.tsx',
  },
  locales: {
    en: { title: 'My App' },
    de: { title: 'Meine App' },
  },
})
```

## Reactive Favicon

Theme-aware favicon switching with dual light/dark variants:

```tsx
// Dual PNG/ICO favicons that swap based on OS theme:
// light-mode users see icon-light.png, dark-mode users see icon-dark.png
// Implemented via media attribute on <link> elements:
// <link rel="icon" href="/icon-light.png" media="(prefers-color-scheme: light)">
// <link rel="icon" href="/icon-dark.png" media="(prefers-color-scheme: dark)">
```

## Enhanced Meta

The `Meta` component now supports additional Open Graph and SEO properties:

```tsx
import { Meta } from '@pyreon/zero'

<Meta
  title="My Page"
  description="Page description"
  ogImage={{ url: '/og.png', width: 1200, height: 630 }}
  ogVideo={{ url: '/video.mp4', type: 'video/mp4' }}
  ogAudio={{ url: '/audio.mp3', type: 'audio/mpeg' }}
  noIndex={true}
  ogTemplate="default"
  favicon="/custom-favicon.svg"
/>
```

New properties: `og:image:width`, `og:image:height`, `og:video`, `og:audio`, `noIndex`, `ogTemplate`, `favicon`.

## Exports Summary

| Export                   | Signature                                        | Description                                              |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------- |
| `defineConfig`           | `(config: ZeroConfig) => ZeroConfig`             | Type-safe configuration helper                           |
| `resolveConfig`          | `(config?: ZeroConfig) => ResolvedConfig`        | Merge user config with defaults                          |
| `createApp`              | `(options) => &#123; App, router &#125;`         | Assembles router + head + layout into an app shell       |
| `createServer`           | `(options) => RequestHandler`                    | Creates a production SSR request handler                 |
| `startClient`            | `(options) => void`                              | Client-side hydration/mount (from `@pyreon/zero/client`) |
| `Image`                  | `(props: ImageProps) => JSX.Element`             | Optimized image component                                |
| `Link`                   | `(props: LinkProps) => JSX.Element`              | Client navigation link component                         |
| `useLink`                | `(props: UseLinkProps) => LinkState`             | Low-level link composable                                |
| `createLink`             | `(Component) => LinkComponent`                   | HOC to add link behavior to any component                |
| `Script`                 | `(props: ScriptProps) => JSX.Element`            | Optimized script loading component                       |
| `theme`                  | `() => "light" \| "dark" \| "system"`            | Reactive theme signal                                    |
| `resolvedTheme`          | `() => "light" \| "dark"`                        | Resolved theme signal                                    |
| `toggleTheme`            | `() => void`                                     | Toggle between light and dark                            |
| `setTheme`               | `(t: Theme) => void`                             | Set theme explicitly                                     |
| `initTheme`              | `() => void`                                     | Initialize theme from storage/system                     |
| `ThemeToggle`            | `() => JSX.Element`                              | Pre-built theme toggle component                         |
| `themeScript`            | `string`                                         | Inline script to prevent FOUC                            |
| `cacheMiddleware`        | `(config?: CacheConfig) => Middleware`           | Cache-Control middleware                                 |
| `securityHeaders`        | `() => Middleware`                               | Security headers middleware                              |
| `varyEncoding`           | `() => Middleware`                               | Vary Accept-Encoding middleware                          |
| `generateSitemap`        | `(files, config: SitemapConfig) => string`       | Generate sitemap XML                                     |
| `generateRobots`         | `(config?: RobotsConfig) => string`              | Generate robots.txt                                      |
| `jsonLd`                 | `(data: Record<string, unknown>) => string`      | JSON-LD structured data                                  |
| `seoPlugin`              | `(config?: SeoPluginConfig) => VitePlugin`       | SEO Vite plugin                                          |
| `seoMiddleware`          | `(config?: SeoPluginConfig) => Middleware`       | SEO dev server middleware                                |
| `fontPlugin`             | `(config?: FontConfig) => VitePlugin`            | Font optimization Vite plugin                            |
| `fontVariables`          | `(families: Record<string, string>) => string`   | Generate CSS font variables                              |
| `imagePlugin`            | `(config?: ImagePluginConfig) => VitePlugin`     | Image optimization Vite plugin                           |
| `createISRHandler`       | `(handler, config: ISRConfig) => RequestHandler` | ISR handler with in-memory cache                         |
| `resolveAdapter`         | `(config: ZeroConfig) => Adapter`                | Resolve deployment adapter                               |
| `nodeAdapter`            | `() => Adapter`                                  | Node.js adapter                                          |
| `bunAdapter`             | `() => Adapter`                                  | Bun adapter                                              |
| `staticAdapter`          | `() => Adapter`                                  | Static output adapter                                    |
| `defineAction`           | `(handler: ActionHandler) => Action`             | Define a server action                                   |
| `createActionMiddleware` | `() => Middleware`                               | Mount action handler at `/_zero/actions/*`               |
| `createApiMiddleware`    | `(routes: ApiRouteEntry[]) => Middleware`        | Mount API route handler                                  |
| `corsMiddleware`         | `(config?: CorsConfig) => Middleware`            | CORS middleware                                          |
| `rateLimitMiddleware`    | `(config?: RateLimitConfig) => Middleware`       | Rate limiting middleware                                 |
| `compressionMiddleware`  | `(config?: CompressionConfig) => Middleware`     | Compression middleware                                   |

## Subpath Exports

| Import Path                 | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `@pyreon/zero`              | Core exports (components, middleware, adapters, theme, SEO, fonts)          |
| `@pyreon/zero/client`       | Client-side `startClient`                                                   |
| `@pyreon/zero/config`       | `defineConfig` and `resolveConfig`                                          |
| `@pyreon/zero/image`        | `Image` component                                                           |
| `@pyreon/zero/link`         | `Link`, `useLink`, `createLink`                                             |
| `@pyreon/zero/script`       | `Script` component                                                          |
| `@pyreon/zero/font`         | `fontPlugin`, `fontVariables`                                               |
| `@pyreon/zero/cache`        | `cacheMiddleware`, `securityHeaders`, `varyEncoding`                        |
| `@pyreon/zero/seo`          | `seoPlugin`, `seoMiddleware`, `generateSitemap`, `generateRobots`, `jsonLd` |
| `@pyreon/zero/theme`        | Theme signals and `ThemeToggle` component                                   |
| `@pyreon/zero/image-plugin` | `imagePlugin` Vite plugin                                                   |
| `@pyreon/zero/actions`      | `defineAction`, `createActionMiddleware`                                    |
| `@pyreon/zero/api-routes`   | API route utilities and `createApiMiddleware`                               |
| `@pyreon/zero/cors`         | `corsMiddleware`                                                            |
| `@pyreon/zero/rate-limit`   | `rateLimitMiddleware`                                                       |
| `@pyreon/zero/compression`  | `compressionMiddleware`, `compressResponse`                                 |
| `@pyreon/zero/testing`      | Test helpers for middleware and API routes                                  |
| `@pyreon/zero/server`       | Server-only: `createServer`, `validateEnv`, `useNonce`, `useRequestLocals` |
| `@pyreon/zero/adapter-vercel` | Vercel serverless deployment adapter                                      |
| `@pyreon/zero/adapter-cloudflare` | Cloudflare Pages deployment adapter                                  |
| `@pyreon/zero/adapter-netlify` | Netlify Functions deployment adapter                                    |

## Type Exports

| Type                   | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `ZeroConfig`           | Full configuration object                                                |
| `RenderMode`           | `"ssr" \| "ssg" \| "spa" \| "isr"`                                       |
| `RouteModule`          | Shape of a route file's exports                                          |
| `LoaderContext`        | Argument passed to `loader` functions                                    |
| `RouteMeta`            | Route meta tags object                                                   |
| `ISRConfig`            | Configuration for `createISRHandler`                                     |
| `Adapter`              | Deployment adapter interface                                             |
| `AdapterBuildOptions`  | Options passed to `adapter.build()`                                      |
| `CacheConfig`          | Configuration for `cacheMiddleware`                                      |
| `CacheRule`            | Per-path cache override rule                                             |
| `SitemapConfig`        | Configuration for `generateSitemap`                                      |
| `SitemapEntry`         | Individual sitemap entry                                                 |
| `ChangeFreq`           | Sitemap change frequency values                                          |
| `RobotsConfig`         | Configuration for `generateRobots`                                       |
| `RobotsRule`           | Individual robots.txt rule                                               |
| `SeoPluginConfig`      | Configuration for `seoPlugin` and `seoMiddleware`                        |
| `FontConfig`           | Configuration for `fontPlugin`                                           |
| `ImagePluginConfig`    | Configuration for `imagePlugin`                                          |
| `ProcessedImage`       | Result of `?optimize` image import                                       |
| `FormatSource`         | Per-format srcset in a `ProcessedImage`                                  |
| `ImageFormat`          | `"webp" \| "avif" \| "jpeg" \| "png"`                                    |
| `JsonLdType`           | JSON-LD structured data type                                             |
| `ActionContext`        | Context passed to server action handlers                                 |
| `Action`               | Client-callable action returned by `defineAction`                        |
| `ActionHandler`        | Server action handler function type                                      |
| `RouteMiddlewareEntry` | Maps URL pattern to route middleware                                     |
| `ApiContext`           | Context passed to API route handlers                                     |
| `ApiRouteEntry`        | Maps URL pattern to API route module                                     |
| `ApiRouteModule`       | API route module with HTTP method handlers                               |
| `HttpMethod`           | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE" \| "HEAD" \| "OPTIONS"` |
| `CorsConfig`           | Configuration for `corsMiddleware`                                       |
| `RateLimitConfig`      | Configuration for `rateLimitMiddleware`                                  |
| `CompressionConfig`    | Configuration for `compressionMiddleware`                                |
