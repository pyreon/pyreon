# @pyreon/zero

Zero-config full-stack meta-framework — file-system routing, SSR/SSG/ISR/SPA, deploy adapters.

`@pyreon/zero` wraps `@pyreon/server` + `@pyreon/router` + `@pyreon/head` + `@pyreon/vite-plugin` into a single Vite plugin and a conventions-based project layout: `src/routes/` is the route tree (`[param]`, `[...catchAll]`, `_layout`, `_404`, `_loading`, `_error`, `(groups)`), per-file `export const { loader, meta, middleware, getStaticPaths, revalidate, renderMode }` opts into capabilities, and `mode: 'ssr' | 'ssg' | 'isr' | 'spa'` picks the rendering strategy. Production builds run through one of six deploy adapters (Vercel / Cloudflare Pages / Netlify / Node / Bun / static). The main entry is **client-safe**; server-only APIs live at `@pyreon/zero/server`.

Highlights:

- **Streaming by default** — `mode: 'ssr'` apps stream the shell + Suspense boundaries out of the box; `ssr: { mode: 'string' }` opts back to buffered.
- **Server islands** — `serverIsland()` puts per-request server-rendered holes inside a cacheable page (fragment endpoint + no-JS fallback + opt-in fragment caching).
- **Server loaders** — a `.server.{ts,tsx,js,jsx}` sibling next to a route file is a server-only data loader (never ships to the client; single-fetch on client navigations). Layouts can't have them — put per-request layout data in a page serverLoader or middleware locals.
- **Per-route `renderMode`** — any route opts out of the global mode (`export const renderMode = 'ssg'`).
- **SSG delivery polish** — `ssg: { speculationRules, viewTransitions, cssMode: 'asset', earlyHints }` tune how prerendered pages ship.
- **Runtime ISR with tags + persistence** — `isr.tagsForRequest` + `isrHandler.revalidateTag(tag)` for group invalidation; `createFsStore(dir)` persists the cache across restarts.

## Install

```bash
bun add @pyreon/zero
```

`sharp` is an optional peer dep — install it (`bun add -D sharp`) only if you use `imagePlugin` / `faviconPlugin` / `ogImagePlugin`.

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default defineConfig({
  plugins: [
    pyreon({ islands: true }),
    zero({
      mode: 'ssr',             // 'ssr' | 'ssg' | 'isr' | 'spa'
      ssr: { mode: 'stream' }, // 'stream' is the default for mode: 'ssr' (since the server-islands release); 'string' opts back to buffered
      adapter: 'node',         // 'vercel' | 'cloudflare' | 'netlify' | 'node' | 'bun' | 'static'
    }),
  ],
})
```

```tsx
// src/routes/index.tsx — the homepage
import { useLoaderData } from '@pyreon/router'

export const loader = async () => fetch('/api/hello').then((r) => r.json())

export default function Home() {
  const data = useLoaderData<{ message: string }>()
  return <h1>{data.message}</h1>
}
```

```tsx
// src/routes/_layout.tsx — wraps every route in this subtree
import { Link, Meta } from '@pyreon/zero'

export default function Layout({ children }) {
  return (
    <>
      <Meta title="My App" description="..." />
      <nav><Link to="/">Home</Link> <Link to="/posts">Posts</Link></nav>
      <main>{children}</main>
    </>
  )
}
```

## File-system routing

| File                       | Role                                                              |
|----------------------------|-------------------------------------------------------------------|
| `src/routes/index.tsx`     | `/` — homepage                                                    |
| `src/routes/about.tsx`     | `/about`                                                          |
| `src/routes/[id].tsx`      | `/:id` — dynamic param                                            |
| `src/routes/[...slug].tsx` | `/*` — catch-all                                                  |
| `src/routes/_layout.tsx`   | Wraps the whole subtree                                           |
| `src/routes/_404.tsx`      | Not-found page (auto-emitted as `dist/404.html` in SSG)           |
| `src/routes/_error.tsx`    | Route-level error boundary                                        |
| `src/routes/_loading.tsx`  | Loader-in-flight component                                        |
| `src/routes/(group)/x.tsx` | `/x` — group prefix is stripped from the URL                      |
| `src/routes/api/*.ts`      | API routes — `export function GET / POST / PUT / DELETE / …`      |

Each route file may also export `loader`, `meta`, `middleware`, `guard`, `getStaticPaths`, `revalidate`, and `renderMode`.

## Rendering modes

```ts
zero({ mode: 'ssr' })  // server-rendered per request (default)
zero({ mode: 'ssg' })  // prerender every static path at build time → dist/<path>/index.html
zero({ mode: 'isr' })  // SSR + in-memory LRU cache, on-demand revalidation
zero({ mode: 'spa' })  // client-only — single dist/index.html shell
```

Per-route override: `export const renderMode = 'ssg'`.

## SSG

```tsx
// src/routes/posts/[slug].tsx — enumerate static paths at build time
import type { GetStaticPaths } from '@pyreon/zero/server'

export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  const posts = await loadAllPosts()
  return posts.map((p) => ({ params: { slug: p.slug } }))
}

export const revalidate = 3600 // optional — build-time ISR (per platform adapter)

export const loader = ({ params }) => fetchPost(params.slug)
export default function Post() { /* ... */ }
```

SSG features (all on by default; opt out via `ssg: { ... }`):

- `_404.tsx` → `dist/404.html` (per-locale variants if i18n configured)
- Loader-thrown `redirect()` → `dist/_redirects` (Netlify/Cloudflare) + `_redirects.json` (Vercel)
- Sitemap auto-emit (via `seoPlugin({ sitemap: { useSsgPaths: true } })`)
- Concurrent rendering (`ssg.concurrency`, default 4) + per-path `onProgress` callbacks
- Render-error fallback via `ssg.onPathError`; structured `_pyreon-ssg-errors.json` artifact
- Path-collision detection (loud build failure on duplicate URLs)

## ISR

```ts
zero({ mode: 'isr', isr: { revalidate: 60, maxEntries: 1000 } })
```

In-memory LRU SSR cache with TTL revalidation. **Default keys cache by `url.pathname + url.search`** — cookies / auth headers are still excluded, so for auth-gated pages supply `cacheKey: (req) => …` that varies on session cookie / user-id header to avoid serving one user's HTML to another.

Tag-based invalidation + persistence: `isr.tagsForRequest(req) => string[]` records tags at cache-set time and `isrHandler.revalidateTag(tag)` drops every entry carrying the tag; `createFsStore(dir)` (from `@pyreon/zero/server`) persists entries + the tag index across restarts on single-box node/bun deploys (multi-instance still wants a Redis/KV `store`).

## Built-in components

```tsx
import { Image, OptimizedImage, NoOptimize, Link, Script, Meta, Icon, createIcon, createNamedIcon, ThemeToggle } from '@pyreon/zero'
import hero from './hero.jpg?optimize'

<Image src={hero} alt="Hero" priority />                  {/* bi-modal: ?optimize descriptor… */}
<Image src="/remote.jpg" alt="" width={1200} height={600} /> {/* …or a runtime URL (w+h required) */}
<OptimizedImage source={hero} alt="Hero" />               {/* whole descriptor in one prop */}
<NoOptimize><Image src={logo} alt="Logo" /></NoOptimize>  {/* subtree opt-out → bare <img> */}
<Link to="/about" prefetch="intent">About</Link>
<Script strategy="afterInteractive" src="https://analytics.example.com/script.js" />
<Meta title="..." description="..." />
<Icon as={MyIconSvgComponent} />          {/* loaded via `?component` */}
<ThemeToggle />                            {/* light/dark/system mode */}
```

`<Image>` is **bi-modal** — `src` takes a `?optimize` descriptor (dims/srcset/formats inferred) OR a runtime string URL (`width`+`height` then required, to prevent CLS); the `optimize` prop and `<NoOptimize>` boundary opt individual images / subtrees out. Built on `imagePlugin` (build-time WebP/AVIF + blur/color placeholders). `<Link>` is `@pyreon/router`'s `RouterLink` re-exported. `<Meta>` writes via `@pyreon/head`.

**Resource hints & fonts.** `usePreconnect` / `useDnsPrefetch` / `usePreload` emit typed `<link rel>` hints; `usePreloadFont(href)` preloads a critical font; the `?font` import (`import Inter from './Inter.woff2?font'`) auto-emits an `@font-face` + hashed-URL descriptor. See [docs/images-and-fonts](https://pyreon.dev/images-and-fonts).

## Vite plugins (server-only)

```ts
import { faviconPlugin, iconsPlugin, ogImagePlugin, seoPlugin, aiPlugin } from '@pyreon/zero/server'

// vite.config.ts
plugins: [
  zero({ /* ... */ }),
  iconsPlugin({
    sets: {
      ui: { dir: './src/icons/ui' },
      brand: { dir: './src/icons/brand', mode: 'image' },
    },
  }),
  faviconPlugin({ source: './src/favicon.svg' }),
  ogImagePlugin({ templates: { default: { /* ... */ } } }),
  seoPlugin({ sitemap: { useSsgPaths: true }, robots: true }),
  aiPlugin(), // generates llms.txt + JSON-LD inference + AI plugin manifest
]
```

## Deploy adapters

```ts
import { vercelAdapter, cloudflareAdapter, netlifyAdapter, nodeAdapter, bunAdapter, staticAdapter } from '@pyreon/zero/server'

zero({ adapter: vercelAdapter() })
// or by string id:
zero({ adapter: 'cloudflare' })
```

Each adapter writes its own platform config (`.vercel/output/config.json`, `_routes.json`, `netlify.toml`, etc.) during `closeBundle`. Adapters with revalidation support (`vercel` / `cloudflare` / `netlify`) implement `Adapter.revalidate(path)` — pair with `vercelRevalidateHandler` for the canonical webhook scaffold.

## Server middleware

```ts
import { compose } from '@pyreon/zero/server'
import { cspMiddleware, useNonce } from '@pyreon/zero/csp'
import { loggerMiddleware } from '@pyreon/zero/logger'
import { corsMiddleware } from '@pyreon/zero/cors'
import { rateLimitMiddleware } from '@pyreon/zero/rate-limit'
import { compressionMiddleware } from '@pyreon/zero/compression'

const handler = compose([
  loggerMiddleware(),
  corsMiddleware({ origin: 'https://app.example.com' }),
  rateLimitMiddleware({ windowMs: 60_000, max: 100 }),
  cspMiddleware({ directives: { 'script-src': ["'self'", "'nonce-{nonce}'"] } }),
  compressionMiddleware(),
])
```

## i18n routing

```ts
zero({
  i18n: { locales: ['en', 'de', 'cs'], defaultLocale: 'en', strategy: 'prefix-except-default' },
})
```

Routes are duplicated per locale at build time. `prefix-except-default` keeps the default locale unprefixed (`/about`) and prefixes others (`/de/about`); `prefix` prefixes every locale including the default. Loader context + sitemap hreflang siblings + per-locale `_404.tsx` all compose automatically.

## Subpath exports (server-only)

| Subpath                       | Notes                                                                                |
|-------------------------------|--------------------------------------------------------------------------------------|
| `@pyreon/zero/server`         | `createServer`, `createApp`, `createISRHandler`, adapters, plugins, `vercelRevalidateHandler` |
| `@pyreon/zero/client`         | `startClient`, `hydrateIslands*` re-exports                                          |
| `@pyreon/zero/config`         | `defineConfig`, `resolveConfig`                                                      |
| `@pyreon/zero/env`            | `validateEnv`, `publicEnv`, `schema`                                                 |
| `@pyreon/zero/middleware`     | Generic `Middleware` helpers                                                         |
| `@pyreon/zero/testing`        | `createTestContext`, `testMiddleware`, `createTestApiServer`                         |

The main entry (`@pyreon/zero`) re-exports browser-safe pieces only — components, theme, i18n helpers. Server APIs are **not exported from the main entry at all** — import each from its subpath. Importing one from `@pyreon/zero` is a structural compile error (`TS2305: '@pyreon/zero' has no exported member '<name>'`), and no server-only code reaches the client bundle.

## Gotchas

- `@pyreon/zero` ≠ `@pyreon/zero/server` — the main entry is client-safe. Server plugins (`faviconPlugin`, `seoPlugin`, `createServer`) MUST be imported from `/server` (or `/favicon`, `/config`, …). They are not exported from the main entry, so importing one from `@pyreon/zero` is a structural compile error (`TS2305`).
- ISR with auth-gated pages needs `cacheKey: (req) => …` that varies on session — the default keys by `url.pathname + url.search` (cookies/auth excluded) and will serve one user's HTML to another.
- `_404.tsx` rendered HTML is emitted by SSG, but **static hosts must be configured to serve it** for unmatched URLs (most managed hosts do this by convention; bare S3 / nginx / Caddy need explicit per-locale `try_files` / `[[redirects]]`).
- `getStaticPaths` / `revalidate` literal-extraction skips re-exports + non-literal expressions. Inline the value (`export const revalidate = 60`), don't reference a const.
- `sharp` is optional. Without it, `imagePlugin` falls back to a soft warning in dev and a HARD `vite build` error in prod (never silently ships an image-broken site).
- Never pass `layout` to `startClient` when using fs-router's `_layout.tsx` convention — the route tree already wraps every page in the layout, and the explicit option double-mounts.

## Documentation

Full docs: [pyreon.dev/docs/zero](https://pyreon.dev/docs/zero) (or `docs/src/content/docs/zero.md` in this repo).

SSG-specific guide: [pyreon.dev/docs/ssg](https://pyreon.dev/docs/ssg).

## License

MIT
