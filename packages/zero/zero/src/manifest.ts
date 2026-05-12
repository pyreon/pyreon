import { defineManifest } from '@pyreon/manifest'

/**
 * @pyreon/zero manifest — feeds llms.txt / llms-full.txt / MCP
 * api-reference.ts via `bun run gen-docs`. Scope: the SSG roadmap
 * surface (zero(), i18n, ISR, adapters, getStaticPaths,
 * expandRoutesForLocales, plus the core plugin APIs that compose with
 * them). Other zero subpath exports (`/image`, `/font`, `/cache`, etc.)
 * stay in CLAUDE.md until a real consumer-side foot-gun surfaces — the
 * manifest is for the surface AI agents need to discover, not an
 * exhaustive enumeration.
 */
export default defineManifest({
  name: '@pyreon/zero',
  title: 'Zero — Full-Stack Meta-Framework',
  tagline:
    'Full-stack meta-framework: fs-routing, SSR/SSG/ISR/SPA, API routes, server actions, adapters, i18n',
  description:
    "Pyreon's full-stack meta-framework. Single `zero({ mode, base, ssg, i18n })` plugin chooses rendering mode (`ssg` / `ssr` / `isr` / `spa`), wires file-system routing under `src/routes/`, and composes with seo / favicon / og-image / ai / i18n-routing / csp plugins. Per-route exports for `meta`, `getStaticPaths`, `revalidate`, `validateSearch`, `loader`. Deployment via per-platform adapters (Vercel / Cloudflare Pages / Netlify / Node / Bun / static).",
  category: 'server',
  longExample: `import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { vercelAdapter, seoPlugin, aiPlugin } from '@pyreon/zero/server'

// SSG + i18n + dynamic-route × locale cross-product + hreflang sitemap.
// Single zero() call wires routing, mode, base, locales, adapter; the
// composed plugins (seoPlugin/aiPlugin) auto-detect i18n config from the
// SSG manifest, so consumers configure locales once.
export default defineConfig({
  plugins: [
    pyreon(),
    zero({
      mode: 'ssg',
      i18n: {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',  // default-locale unprefixed for SEO
      },
      ssg: {
        concurrency: 8,                     // PR D — parallel render workers
        onProgress: ({ completed, total }) => console.log(\`\${completed}/\${total}\`),
      },
      adapter: vercelAdapter(),             // PR J — emits .vercel/output/config.json
    }),
    seoPlugin({ sitemap: { useSsgPaths: true, hreflang: true } }),
    aiPlugin(),
  ],
})

// src/routes/posts/[id].tsx — dynamic route with getStaticPaths
// produces 3 IDs × 3 locales = 9 prerendered HTML files under SSG+i18n.
import type { GetStaticPaths } from '@pyreon/zero/server'

export const getStaticPaths: GetStaticPaths<{ id: string }> = () =>
  POSTS.map((p) => ({ params: { id: String(p.id) } }))

export const revalidate = 60  // PR I — wires platform ISR per-route (Vercel/Cloudflare/Netlify)

export default function PostPage() { /* component body */ }`,
  features: [
    'mode: ssg / ssr / isr / spa — single config field',
    'i18n route duplication (prefix / prefix-except-default strategies)',
    'getStaticPaths per route — dynamic-route × locale compounds at SSG',
    'Per-route revalidate — wires platform ISR via Adapter.revalidate',
    'Concurrent SSG render loop with onProgress callback',
    'Adapter.build() auto-invoked in SSG closeBundle — emits platform routing config',
    'Per-locale 404 + hreflang sitemap (auto-detects i18n config)',
    'Loader-thrown redirect → _redirects manifest (Netlify/Cloudflare/Vercel)',
    'Subpath / base-path single source of truth — zero({ base }) propagates to Vite + router',
  ],
  // MCP-density entries: dense summary + 6+ mistakes per flagship API.
  // Scope: the SSG roadmap surface (i18n, ISR, adapter, getStaticPaths,
  // expandRoutesForLocales) + core zero() entry. Subpath plugins
  // (seoPlugin, aiPlugin, faviconPlugin, ogImagePlugin) get smaller
  // entries — they compose with zero but aren't the i18n/SSG primary
  // discovery surface.
  api: [
    {
      name: 'zero',
      kind: 'function',
      signature:
        'function zero(config?: ZeroConfig): Plugin[] // default export of @pyreon/zero/server',
      summary:
        "Top-level Vite plugin chain for @pyreon/zero. Single config object selects rendering mode (`'ssr' | 'ssg' | 'isr' | 'spa'`), subpath base (`base: '/blog/'`), SSG settings (paths, concurrency, onProgress, emit404, emitRedirects), i18n config (locales / defaultLocale / strategy), and deployment adapter. Returns `Plugin[]` because the SSG mode adds a companion `ssgPlugin()` automatically — Vite's plugins array natively flattens nested arrays so `plugins: [pyreon(), zero()]` works without spread.",
      example: `import zero from '@pyreon/zero/server'

// SPA (default) — no special config needed
plugins: [pyreon(), zero()]

// SSG with auto-detected paths + i18n + adapter
plugins: [pyreon(), zero({
  mode: 'ssg',
  i18n: { locales: ['en','de','cs'], defaultLocale: 'en' },
  adapter: vercelAdapter(),
})]

// Subpath deploy (e.g. served at /blog/)
plugins: [pyreon(), zero({ base: '/blog/', mode: 'ssg' })]`,
      mistakes: [
        "Setting `base` in BOTH `vite.config.base` AND `zero({ base })` and expecting them to merge — user's explicit `vite.config.base` overrides the plugin-returned base. Set base ONCE via `zero({ base })`; let it propagate to Vite + router automatically",
        "Passing `layout` to `createApp` / `startClient` when fs-router already emits `_layout.tsx` as a parent route — double-mounts the layout. Drop the explicit option; `_layout.tsx` is the canonical layout registration",
        "Mixing `mode: 'ssg'` with a runtime adapter that has no SSG branch (e.g. expecting `nodeAdapter` to write platform routing config under SSG) — node/bun/static adapters no-op for SSG; use vercel/cloudflare/netlify if you need platform routing emission",
        "Configuring `ssg.paths` AND per-route `getStaticPaths` together for the same dynamic route — both produce the same path list and the SSG plugin renders each path TWICE (the second pass overwrites). Pick one: `ssg.paths` for top-down explicit lists, `getStaticPaths` for per-route enumerators",
        'Forgetting that `mode: \'ssg\'` returns `Plugin[]` (not a single Plugin) — any downstream test code that does `plugins: [zeroPlugin().name]` instead of `plugins: zeroPlugin()` breaks',
        "Setting `ssg.concurrency` higher than the data layer's connection ceiling — loaders running concurrently overwhelm the upstream (db pool, external API rate limit). Default `4` is safe; raise after profiling, lower to `1` for serial-required loaders",
      ],
      seeAlso: ['I18nRoutingConfig', 'GetStaticPaths', 'Adapter', 'createISRHandler'],
    },
    {
      name: 'I18nRoutingConfig',
      kind: 'type',
      signature:
        "interface I18nRoutingConfig { locales: string[]; defaultLocale: string; strategy?: 'prefix' | 'prefix-except-default' }",
      summary:
        "Configuration shape for `zero({ i18n })`. `locales` is the supported BCP-47 list (validated against path-traversal — `..`, `/`, backslash, `.`, leading-dot, NUL chars rejected). `defaultLocale` is the canonical / SEO-primary locale. `strategy` selects URL shape — `'prefix-except-default'` (default) keeps `/about` unprefixed for the default locale + emits `/de/about` etc. for non-defaults (best for SEO-on-default-locale apps); `'prefix'` prefixes every locale including default (`/en/about`, `/de/about`) for apps with no primary locale.",
      example: `// Prefix-except-default (canonical SEO shape — default unprefixed)
zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })
// Emits: /about, /de/about, /cs/about
// Default locale's index.html: dist/about/index.html (NOT dist/en/about/...)

// Prefix (every locale prefixed)
zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en', strategy: 'prefix' } })
// Emits: /en/about, /de/about, /cs/about
// NO unprefixed /about exists`,
      mistakes: [
        "Configuring locale strings with `.`, `..`, `/`, backslash, or NUL — rejected by `validateLocale` (PR L2 guard). Common BCP-47 shapes pass: `en`, `de-AT`, `en-US`, `zh-Hans`, `pt-BR`",
        "Expecting `<RouterLink to='/posts/1'>` rendered inside `/de/posts` to emit `/de/posts/1` automatically — RouterLinks emit LITERAL hrefs; cross-locale navigation falls through to the default-locale route. Locale-aware navigation is a separate API (not yet shipped)",
        "Assuming the framework runtime-detects locale from URL prefix — it doesn't. The router matches `/de/about` to the duplicated route record; consumer code reads locale from URL parsing OR from `i18nRouting()` middleware (request-time Accept-Language detection)",
        "Using `prefix-except-default` and then duplicating the root `_layout.tsx` per locale — `expandRoutesForLocales` deliberately SKIPS root-layout duplication under this strategy because the unprefixed root layout already wraps locale-prefixed children via hierarchical match. Under `prefix` strategy the skip does NOT apply (no unprefixed default to inherit from)",
        "Single-locale `locales: ['en']` + `prefix-except-default` — short-circuits to a no-op (no other locales to prefix). Use `prefix` strategy if you want `/en/about` for SEO consistency with future multi-locale expansion",
        "Hand-writing per-locale routes (`src/routes/de/about.tsx`) instead of letting `expandRoutesForLocales` duplicate from a single source file — the framework's duplication wires hierarchical layouts + loader-data hydration + hreflang sitemap clustering correctly; hand-written variants miss the cross-cuts",
      ],
      seeAlso: ['zero', 'expandRoutesForLocales', 'i18nRouting'],
    },
    {
      name: 'expandRoutesForLocales',
      kind: 'function',
      signature:
        'function expandRoutesForLocales(routes: FileRoute[], config: I18nRoutingConfig): FileRoute[] // server-only',
      summary:
        "Fans a flat route list into per-locale variants based on `I18nRoutingConfig`. Each non-default locale gets a full subtree duplicate — layouts, error boundaries, loading components, 404 pages, dynamic params (`[id]` → `:id`), catch-all routes (`[...slug]` → `:slug*`) all compose naturally with the locale prefix. Source `filePath` is preserved so the duplicated routes share the same component module; only `urlPath` / `dirPath` / `depth` change. `getStaticPaths` inherits across duplicates so dynamic-route × locale cross-products work automatically (3 IDs × 3 locales = 9 SSG outputs). Root-layout skip under `prefix-except-default` prevents double-mount.",
      example: `import { expandRoutesForLocales } from '@pyreon/zero/server'
import { parseFileRoutes, scanRouteFiles } from '@pyreon/zero/server'

const files = await scanRouteFiles('./src/routes')
const baseRoutes = parseFileRoutes(files)
const fileRoutes = expandRoutesForLocales(baseRoutes, {
  locales: ['en', 'de', 'cs'],
  defaultLocale: 'en',
  strategy: 'prefix-except-default',
})
// fileRoutes now contains: original routes + /de/* + /cs/* subtrees`,
      mistakes: [
        "Calling this from CLIENT code — server-only export from `@pyreon/zero/server`. Importing from `@pyreon/zero` (the client entry) gives a clear server-only error stub",
        "Expecting hand-written `src/routes/de/about.tsx` to compose with duplicated `/de/about` from `/about` — the helper does NOT detect collisions today; a user-defined route at `/de/profile` + locale `de` produces two records at the same urlPath (router matches first)",
        "Modifying the returned `FileRoute[]` and expecting `getStaticPaths` inheritance to update — the duplicates carry frozen `exports` references at duplication time; later mutations don't propagate to the SSG enumerator",
        "Setting `strategy: 'prefix'` and expecting `/about` (unprefixed) to ALSO render — under `prefix` every locale is prefixed; the default-locale unprefixed URL does NOT exist as a dist file. Use `prefix-except-default` if you need both",
        "Passing user-controlled strings as locales without validation — the helper validates against path-traversal (`..`, `/`, backslash, `.`, NUL) but does NOT validate BCP-47 shape; an invalid locale silently produces oddly-shaped URLs",
      ],
      seeAlso: ['I18nRoutingConfig', 'zero', 'parseFileRoutes'],
    },
    {
      name: 'GetStaticPaths',
      kind: 'type',
      signature:
        'type GetStaticPaths<TParams> = () => Array<{ params: TParams }> | Promise<Array<{ params: TParams }>>',
      summary:
        'Per-route export type for dynamic-route enumeration at SSG build time (PR A of the SSG roadmap). Route files at `src/routes/posts/[id].tsx` export `getStaticPaths` returning the concrete param values; the SSG plugin expands the URL pattern (`/posts/:id` × `[1, 2, 3]` → `/posts/1`, `/posts/2`, `/posts/3`). Sync or async return; errors during enumeration land in `PrerenderResult.errors` without aborting other routes. Catch-all routes (`[...slug].tsx`) work via `{ params: { slug: "a/b" } }` → `/blog/a/b`.',
      example: `import type { GetStaticPaths } from '@pyreon/zero/server'

// src/routes/posts/[id].tsx
export const getStaticPaths: GetStaticPaths<{ id: string }> = () =>
  POSTS.map((p) => ({ params: { id: String(p.id) } }))

// Async loader-driven enumeration
export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  const posts = await db.query('SELECT slug FROM posts WHERE published = true')
  return posts.map((p) => ({ params: { slug: p.slug } }))
}`,
      mistakes: [
        "Returning param values as numbers instead of strings (`{ id: 1 }` instead of `{ id: '1' }`) — URL segments are always strings; the type enforces this but a runtime cast (`as any`) silently produces wrong paths",
        "Forgetting to handle the no-i18n vs i18n cardinality — with `zero({ i18n })` the cross-product is `paths × locales`; a 100-path enumerator with 3 locales produces 300 dist files. Pair with `ssg.concurrency` to avoid serial-render blowup",
        "Throwing in `getStaticPaths` and expecting the build to abort — errors are CAPTURED into `PrerenderResult.errors` and the build continues for other routes. Check `dist/_pyreon-ssg-errors.json` after the build (PR G)",
        "Mixing `getStaticPaths` and `ssg.paths` for the same dynamic route — both produce paths and the SSG plugin renders each twice",
        'Reading external state in `getStaticPaths` without await — the function is async-aware; missing await produces "[object Promise]" segments in the URL',
      ],
      seeAlso: ['zero', 'I18nRoutingConfig'],
    },
    {
      name: 'Adapter',
      kind: 'type',
      signature:
        'interface Adapter { name: string; build?(options: AdapterBuildOptions): Promise<void>; revalidate?(path: string): Promise<AdapterRevalidateResult> }',
      summary:
        "Deployment adapter contract. `build()` is auto-invoked by SSG's `closeBundle` AFTER the path render loop (PR J) and writes platform-specific routing config: Vercel emits `.vercel/output/config.json`; Cloudflare emits `_routes.json` with zero-function `exclude: ['/*']`; Netlify emits `netlify.toml` with `publish = '.'` + asset cache headers. `revalidate(path)` is the runtime hook for build-time ISR (PR I) — Vercel POSTs to a revalidation webhook, Cloudflare purges the edge cache, Netlify triggers a Build Hook. Static / node / bun adapters no-op for SSG.",
      example: `import { vercelAdapter, cloudflareAdapter, netlifyAdapter, staticAdapter } from '@pyreon/zero/server'

// Vercel — emits .vercel/output/config.json v3 STATIC variant
plugins: [pyreon(), zero({ mode: 'ssg', adapter: vercelAdapter() })]

// Cloudflare — emits _routes.json (zero-function deploy)
plugins: [pyreon(), zero({ mode: 'ssg', adapter: cloudflareAdapter() })]

// Netlify — emits netlify.toml with publish="." + cache headers
plugins: [pyreon(), zero({ mode: 'ssg', adapter: netlifyAdapter() })]

// ISR revalidation webhook handler (Vercel-side)
await vercelAdapter().revalidate?.('/posts/123')
// → { regenerated: true } on success`,
      mistakes: [
        "Calling `adapter.revalidate(path)` without the platform's env vars set (e.g. `VERCEL_DEPLOYMENT_URL` + `VERCEL_REVALIDATE_TOKEN`) — returns `{ regenerated: false }` with a dev-mode warning. The webhook is a no-op without credentials",
        'Expecting `nodeAdapter` / `bunAdapter` to emit platform routing config under SSG — they no-op (no platform routing to configure). Use vercel/cloudflare/netlify if you need a routing config emitted',
        "Setting `mode: 'ssg'` + `adapter: vercelAdapter()` and ALSO writing `.vercel/output/config.json` manually — the adapter overwrites it. Pick one source of truth",
        'Calling adapter methods from CLIENT code — server-only. Import from `@pyreon/zero/server`',
        "Forgetting that Netlify's revalidate triggers a FULL-SITE rebuild (Build Hook semantics) — Netlify doesn't expose per-page ISR. The `path` arg flows into `trigger_title` for audit logs but doesn't scope the rebuild",
      ],
      seeAlso: ['zero', 'createISRHandler', 'vercelAdapter'],
    },
    {
      name: 'createISRHandler',
      kind: 'function',
      signature:
        'function createISRHandler(options: { handler: Handler; cacheTtl?: number; ... }): Handler',
      summary:
        "Runtime ISR — on-demand SSR caching with TTL. Wraps an SSR handler so pages are rendered on the FIRST request, cached for `cacheTtl` ms (default 60s), and served stale until expiry. Distinct from build-time ISR (per-route `revalidate` export + `Adapter.revalidate`): runtime ISR caches at request time; build-time ISR triggers platform rebuilds. They can coexist: a `mode: 'isr'` app with per-route `revalidate` exports gets BOTH.",
      example: `import { createISRHandler, createServer } from '@pyreon/zero/server'

// Wrap createServer's handler with ISR cache
const ssrHandler = createServer({ routes })
const isrHandler = createISRHandler({
  handler: ssrHandler,
  cacheTtl: 60_000,  // serve cached HTML for 60s
})

export default isrHandler`,
      mistakes: [
        'Setting `cacheTtl: 0` and expecting "never cache" — pass-through is the explicit handler call (no `createISRHandler` wrapper). `cacheTtl: 0` is a degenerate state',
        "Sharing the ISR handler across server instances without external cache — each server's in-memory cache diverges. For multi-instance deploys, swap to a shared cache layer (Redis adapter not built in; user-side concern)",
      ],
      seeAlso: ['zero', 'Adapter'],
    },
    {
      name: 'vercelAdapter',
      kind: 'function',
      signature: 'function vercelAdapter(): Adapter',
      summary:
        'Vercel deployment adapter. SSG branch emits `.vercel/output/config.json` v3 STATIC variant (no functions, asset cache headers). Does NOT copy files into `.vercel/output/static/` — Vercel CLI auto-detects dist. ISR `revalidate(path)` POSTs to `<VERCEL_DEPLOYMENT_URL>/api/_pyreon-revalidate?path=…&secret=<token>`; user-side webhook validates secret + calls `res.revalidate()`.',
      example: 'plugins: [pyreon(), zero({ mode: \'ssg\', adapter: vercelAdapter() })]',
      seeAlso: ['Adapter', 'zero'],
    },
    {
      name: 'cloudflareAdapter',
      kind: 'function',
      signature: 'function cloudflareAdapter(): Adapter',
      summary:
        "Cloudflare Pages adapter. SSG branch emits `_routes.json` with `{ version: 1, include: [], exclude: ['/*'] }` — i.e. \"every URL is static, never invoke a Pages Function\" (zero-function deploy). Without this file Pages defaults to running the worker on every request, wasting paid-plan compute. ISR `revalidate(path)` POSTs to Cloudflare's zone purge_cache API.",
      example: 'plugins: [pyreon(), zero({ mode: \'ssg\', adapter: cloudflareAdapter() })]',
      seeAlso: ['Adapter', 'zero'],
    },
    {
      name: 'netlifyAdapter',
      kind: 'function',
      signature: 'function netlifyAdapter(): Adapter',
      summary:
        'Netlify adapter. SSG branch emits `netlify.toml` with `publish = "."` + `Cache-Control` headers for `/assets/*`. PR B\'s `dist/_redirects` covers loader-thrown redirects (Netlify reads the file natively). ISR `revalidate(path)` POSTs to a Build Hook URL with `trigger_title=revalidate:<path>` for audit-log traceability (Netlify queues a full-site partial rebuild — no per-page ISR API).',
      example: 'plugins: [pyreon(), zero({ mode: \'ssg\', adapter: netlifyAdapter() })]',
      seeAlso: ['Adapter', 'zero'],
    },
    {
      name: 'seoPlugin',
      kind: 'function',
      signature:
        'function seoPlugin(config: SeoPluginConfig): Plugin // server-only',
      summary:
        "SEO plugin — emits `sitemap.xml`, `robots.txt`, JSON-LD, and hreflang cross-references. `sitemap.useSsgPaths: true` auto-detects from SSG output manifest (paths from `getStaticPaths` × locale variants flow in automatically). `sitemap.hreflang: true` auto-detects i18n config from the SSG manifest → clusters per-locale URLs into ONE `<url>` with `<xhtml:link rel='alternate' hreflang>` siblings + `x-default` entry. Falls back to fs-router walk when SSG manifest is absent.",
      example: `seoPlugin({
  sitemap: {
    baseUrl: 'https://example.com',
    useSsgPaths: true,      // PR F — auto-detect SSG paths
    hreflang: true,         // PR K — auto-detect i18n + emit cross-refs
  },
  robots: { sitemap: 'https://example.com/sitemap.xml' },
})`,
      mistakes: [
        "Setting `useSsgPaths: true` in non-SSG mode — silently falls back to fs-router walk (no SSG manifest to read). Same effect as omitting the flag",
        "Setting `hreflang: true` without `zero({ i18n })` — emits a plain single-URL sitemap (no clustering). Configure i18n on zero() to activate hreflang",
        "Expecting `hreflang: I18nRoutingConfig` (explicit form) to override the SSG manifest's i18n config — explicit wins, but typically the auto-detect is the right shape. Use explicit only if you want a different locale set in the sitemap than in routing",
      ],
      seeAlso: ['aiPlugin', 'zero'],
    },
    {
      name: 'aiPlugin',
      kind: 'function',
      signature: 'function aiPlugin(config?: AiPluginConfig): Plugin // server-only',
      summary:
        'AI integration plugin — generates `llms.txt`, `llms-full.txt`, and JSON-LD inference metadata at build time. Designed for sites that want to be AI-readable (search engines, model trainers, agentic crawlers). The generated files are themselves Pyreon\'s on-publish artifacts; the plugin runs `inferJsonLd` per route to extract structured data from `meta` exports.',
      example: 'plugins: [pyreon(), zero(), seoPlugin({ ... }), aiPlugin()]',
      seeAlso: ['seoPlugin', 'zero'],
    },
    {
      name: 'i18nRouting',
      kind: 'function',
      signature:
        'function i18nRouting(config: I18nRoutingConfig): Plugin // server-only',
      summary:
        'Vite plugin for REQUEST-TIME locale detection — Accept-Language header, cookie, root-path redirect to detected locale. Orthogonal to BUILD-TIME route duplication (`expandRoutesForLocales`); both can be used together. The plugin sets a request-context locale that components read via `createLocaleContext`.',
      example: `import { i18nRouting } from '@pyreon/zero/server'

plugins: [pyreon(), zero({ i18n: { locales, defaultLocale } }), i18nRouting({ locales, defaultLocale })]
// Same config object shape — accepts the i18n already passed to zero() if you keep one source of truth`,
      mistakes: [
        "Confusing this plugin with route duplication — they're separate concerns. `zero({ i18n })` controls BUILD-TIME duplication; `i18nRouting()` plugin controls REQUEST-TIME detection",
        'Using `i18nRouting()` under SSG mode without a server runtime — request-time middleware needs a live request handler. SSG only emits static files. Use `mode: \'ssr\'` for request-time locale detection',
      ],
      seeAlso: ['zero', 'I18nRoutingConfig', 'createLocaleContext'],
    },
    {
      name: 'validateEnv',
      kind: 'function',
      signature:
        'function validateEnv<T>(schema: T, env?: ProcessEnv): ValidatedEnv<T> // server-only',
      summary:
        "Env-variable validation with type coercion. Schema accepts primitives (`String`, `Number`, `Boolean`) for default coercion + `schema()` for custom parsers. `publicEnv()` returns a client-safe subset (no secrets). Catches missing-required-env errors at startup instead of mid-request runtime crashes.",
      example: `import { validateEnv, publicEnv, schema } from '@pyreon/zero/server'

const env = validateEnv({
  PORT: 3000,
  DEBUG: false,
  API_KEY: String,        // required string
  API_URL: schema((v) => new URL(v)),
})
// env.PORT → number; env.API_KEY → string; env.API_URL → URL

const pub = publicEnv(env, ['API_URL'])  // omit secrets`,
      seeAlso: ['zero'],
    },
    {
      name: 'cspMiddleware',
      kind: 'function',
      signature:
        'function cspMiddleware(config: { directives: CspDirectives }): Middleware // server-only',
      summary:
        'CSP (Content Security Policy) middleware — emits `Content-Security-Policy` header per request with configurable directives. Pair with `useNonce()` for inline scripts (nonce is generated per-request and embedded in CSP `script-src \'nonce-XXX\'`). Server-only; SPA mode without a request handler can\'t emit per-request nonces.',
      example: `import { cspMiddleware } from '@pyreon/zero/server'

plugins: [pyreon(), zero({
  middleware: [cspMiddleware({
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'nonce-{{nonce}}'"],
    },
  })],
})]`,
      seeAlso: ['useRequestLocals'],
    },
    {
      name: 'useRequestLocals',
      kind: 'hook',
      signature: 'function useRequestLocals<T = unknown>(): T',
      summary:
        'Bridge middleware-attached request locals into the component tree. Middleware sets `ctx.locals.user = currentUser`; components call `useRequestLocals()` to read. Reactive context — locale-aware re-reads work inside `effect()` / JSX thunks.',
      example: `// middleware
async function authMiddleware(ctx, next) {
  ctx.locals.user = await verifyToken(ctx.req.headers.get('authorization'))
  return next()
}

// component
const { user } = useRequestLocals<{ user: User | null }>()`,
      seeAlso: ['cspMiddleware'],
    },

    // ─── Three-layer extensibility: Link / Image / Script ──────────────
    // Each component ships THREE layers: a `useX(props)` hook for full
    // control, a `createX(Component)` HOC for wrapping any component
    // with the optimization behavior, and a default `X` component that
    // covers the 90% case. Same pattern across all three so consumers
    // build mental model once. Reference: link.tsx, image.tsx, script.tsx.

    {
      name: 'Link',
      kind: 'component',
      signature:
        '<Link href={path} prefetch="hover" activeClass={cls}>{children}</Link>',
      summary:
        "Default navigation link built on an `<a>` tag — client-side push via `router.push()`, hover/viewport prefetch, `aria-current=\"page\"` on exact match, `activeClass` / `exactActiveClass` for nav-state styling. Built on `createLink` so consumers can swap the rendered element via `createLink(MyCustomLink)` without losing the prefetch + active-state behavior.",
      example: `import { Link } from '@pyreon/zero/link'

<Link href="/about" prefetch="viewport" activeClass="nav-active">About</Link>
<Link href="/external" external>External</Link>  // target="_blank" rel="noopener noreferrer"`,
      mistakes: [
        "Using `<a href={path} onClick={() => router.push(path)}>` instead of `<Link>` — manual approach skips prefetch, active-state class merging, and the keyboard-modifier guard (Cmd+click should open new tab, not navigate in-place)",
        "Setting `prefetch=\"hover\"` (default) and expecting prefetch on mobile — mobile devices don't fire mouseenter; use `prefetch=\"viewport\"` for IntersectionObserver-based prefetch (or accept that touchstart triggers prefetch too)",
        "Passing `class` AND `activeClass` — both are MERGED via `cx` (not overridden); the user-provided `class` always applies, `activeClass` is appended when `isActive()` is true",
        "`<Link to={...}>` — Link uses `href`, NOT `to` (RouterLink from `@pyreon/router` uses `to`; Link from `@pyreon/zero/link` uses `href` to match HTML anchor convention)",
        "Expecting `external: true` to skip prefetch — `external` controls click handling (opens in new tab via `target=\"_blank\"`), not prefetch. Use `prefetch=\"none\"` if you want to skip prefetch for an internal link",
        "Building a custom anchor wrapper from scratch instead of using `createLink` or `useLink` — the prefetch cache, keyboard-modifier guard, active-state class composition, and SSR-safe document.head injection are non-trivial",
      ],
      seeAlso: ['useLink', 'createLink', 'prefetchRoute'],
    },
    {
      name: 'useLink',
      kind: 'hook',
      signature: 'function useLink(props: LinkProps): UseLinkReturn',
      summary:
        'Composable that returns all link behavior — `{ ref, handleClick, handleMouseEnter, handleTouchStart, isActive, isExactActive, classes }`. Use when `createLink` is too opinionated (e.g. you need a `<button>` link, a card-shaped link, or want to compose with another framework primitive). Internals: hover/viewport prefetch via IntersectionObserver, keyboard-modifier guard (Cmd+click opens new tab), active/exact-active path matching, class-string composition.',
      example: `import { useLink } from '@pyreon/zero/link'

function CardLink(props: LinkProps) {
  const link = useLink(props)
  return (
    <div
      ref={link.ref}
      class={() => \`card \${link.classes()}\`}
      onClick={link.handleClick}
      onMouseEnter={link.handleMouseEnter}
      onTouchStart={link.handleTouchStart}
    >
      {props.children}
    </div>
  )
}`,
      mistakes: [
        "Reading `link.classes` as a plain string — it's a `() => string` accessor. Call it inside reactive scopes (JSX expression thunks, `class={link.classes}`) so the active class updates on route change",
        "Forgetting to wire `link.ref` to the root element under `prefetch=\"viewport\"` — without the ref the IntersectionObserver has nothing to observe; viewport-based prefetch never fires",
        "Calling `link.handleClick(e)` synchronously in the component body — handlers are meant to be JSX event props (`onClick={link.handleClick}`); synchronous invocation in the render body triggers `router.push` during render which the lint rule `no-imperative-navigate-in-render` flags",
        "Mixing `useLink` + a router instance from a different `RouterProvider` — `useLink` reads the nearest router context; multi-router apps need explicit context boundaries",
        "Treating `useLink` as setup-only (calling it conditionally inside an effect) — like all hooks, call it at the top of the component body. The ref / handlers are stable across re-renders",
        "Forgetting that `external: true` bypasses the click handler entirely — `useLink` still returns handlers but `handleClick`'s body short-circuits when `props.external` is true; the wrapped element should let the native anchor `target=\"_blank\"` semantics handle the rest",
      ],
      seeAlso: ['Link', 'createLink', 'UseLinkReturn'],
    },
    {
      name: 'createLink',
      kind: 'function',
      signature:
        'function createLink(Component: (p: LinkRenderProps) => any): (props: LinkProps) => any',
      summary:
        'HOC that wraps any component with link behavior. The wrapped component receives `LinkRenderProps` with all handlers + state pre-wired (`href`, `ref`, `onClick`, `onMouseEnter`, `onTouchStart`, `isActive`, `isExactActive`, `class`, `target`, `rel`). Use this to build styled link variants (button-links, card-links, design-system anchors) without re-implementing the prefetch + active-state machine.',
      example: `import { createLink } from '@pyreon/zero/link'

const ButtonLink = createLink((props) => (
  <button
    ref={props.ref}
    class={props.class}
    onClick={props.onClick}
    onMouseEnter={props.onMouseEnter}
  >
    {props.children}
  </button>
))

<ButtonLink href="/dashboard" activeClass="active">Dashboard</ButtonLink>`,
      mistakes: [
        "Not forwarding `props.ref` to the rendered element — the prefetch IntersectionObserver and active-state observer both need a real DOM ref to attach to",
        "Calling the user-provided `props.class` as a function in JSX (`class={props.class()}`) — `class` is a string-or-accessor union; pass it directly (`class={props.class}`) and let the renderer call it if needed",
        "Forgetting `onTouchStart` — mobile devices don't fire mouseenter; without `onTouchStart` mobile users get no prefetch benefit",
        "Re-rendering the wrapped component on every router event — the HOC calls `useLink` ONCE per component instance, returns stable handlers, and the route signal is reactive at the granularity of `isActive` / `classes`. Don't memoize the wrapper output manually",
        "Building separate wrappers for `<button>` vs `<a>` vs `<div>` instead of having ONE styled wrapper that accepts a `tag` prop — `createLink` only handles the link logic; the rendered tag choice is the consumer's structural decision",
        "Expecting `createLink` to handle `external: true` semantics on a non-anchor component — `target` and `rel` are forwarded as RenderProps but `<button target=\"_blank\">` does nothing; for external links rendered as buttons, the consumer must handle `window.open()` explicitly",
      ],
      seeAlso: ['Link', 'useLink', 'LinkRenderProps'],
    },
    {
      name: 'prefetchRoute',
      kind: 'function',
      signature: 'function prefetchRoute(href: string): void',
      summary:
        'Imperatively prefetch a route\'s JS chunk by injecting `<link rel="prefetch">` + `<link rel="modulepreload">` into `document.head`. Deduplicates — calling twice with the same `href` is a no-op. Backed by an LRU cache (MAX 200 entries) that evicts oldest entries AND removes their DOM nodes to prevent head-bloat across long SPA sessions.',
      example: `import { prefetchRoute } from '@pyreon/zero/link'

// On user hovering a card, prefetch the linked route's chunk
<Card onMouseEnter={() => prefetchRoute('/posts/' + post.id)}>...</Card>`,
      seeAlso: ['Link', 'useLink'],
    },

    {
      name: 'Image',
      kind: 'component',
      signature:
        '<Image src={url} alt={alt} width={w} height={h} priority={false} loading="lazy" placeholder={blurUrl} />',
      summary:
        "Default optimized image — lazy loading via IntersectionObserver, automatic width/height for CLS prevention, responsive srcset, multi-format via `<picture>`, blur-up placeholder, `fetchPriority=\"high\"` for LCP images. Built on `createImage` so consumers can layer rocketstyle / custom wrappers on top via `createImage(MyStyledImage)` without losing the optimization pipeline. The `raw: true` escape hatch returns a bare `<img>` (no container, no lazy load, no aspect-ratio enforcement).",
      example: `import { Image } from '@pyreon/zero/image'
import hero from './hero.jpg?optimize'

// With imagePlugin — spreads optimized srcset + formats + dimensions
<Image {...hero} alt="Hero" priority />

// Manual
<Image src="/hero.jpg" alt="Hero" width={1200} height={630} />

// Raw mode — skip all optimization wrappers (custom layout)
<Image src="/bg.jpg" alt="" width={400} height={300} raw />`,
      mistakes: [
        "Forgetting `width` + `height` — both are REQUIRED for CLS prevention. The `aspect-ratio` CSS is computed from these; omitting them produces layout shift when the image loads",
        "Setting `priority` on below-the-fold images — `priority` disables lazy loading AND adds `fetchPriority=\"high\"`. Reserve it for the LCP image only (typically the hero)",
        "Setting `loading=\"eager\"` AND `priority` — they're redundant; `priority` already implies eager. Pick one (`priority` is the LCP-marker; `loading=\"eager\"` is the no-priority eager hint)",
        "Using `placeholder` as a full-resolution image — it should be a tiny base64 data URI or a /placeholder.jpg (~1-2 KB). Large placeholders defeat the purpose by blocking initial paint",
        "Spreading `imagePlugin` output (`{...hero}`) WITHOUT `alt` — `alt` is required for accessibility AND not auto-derived by the plugin. The TypeScript type enforces this",
        "Wrapping `<Image>` in a `<picture>` manually for WebP/AVIF — `formats` already does this via `imagePlugin`. Manual `<picture>` defeats the optimization",
      ],
      seeAlso: ['useImage', 'createImage', 'ImageProps', 'ImageRenderProps'],
    },
    {
      name: 'useImage',
      kind: 'hook',
      signature: 'function useImage(props: ImageProps): UseImageReturn',
      summary:
        "Composable that returns resolved image attributes + signals — `{ containerRef, inView, loaded, src, srcSet, sizes, aspectRatio, containerStyle, imageStyle, placeholderStyle, loading, fetchPriority, handleLoad, formats, hasFormats }`. Use for full control when `createImage`'s default `<div><img/></div>` structure is wrong (e.g. `<figure>` + `<figcaption>`, custom container layouts, overlay elements). Reactive accessors (`src`, `srcSet`, `imageStyle`, `placeholderStyle`) re-evaluate on `inView()` flip — wire them as JSX expressions for fine-grained updates.",
      example: `import { useImage } from '@pyreon/zero/image'

function FigureImage(props: ImageProps) {
  const img = useImage(props)
  return (
    <figure ref={img.containerRef} style={img.containerStyle}>
      <img
        src={img.src}
        srcSet={img.srcSet}
        sizes={img.sizes}
        alt={props.alt}
        width={props.width}
        height={props.height}
        loading={img.loading}
        onLoad={img.handleLoad}
        style={img.imageStyle}
      />
      <figcaption>{props.alt}</figcaption>
    </figure>
  )
}`,
      mistakes: [
        "Reading `img.src` as a plain string — it's a `() => string` accessor that returns empty string until `inView()` triggers. Pass it as a JSX attribute (`src={img.src}`) so the renderer wraps it in a reactive binding",
        "Forgetting to wire `img.containerRef` — without the ref, IntersectionObserver has nothing to observe; lazy images never enter view, never load",
        "Calling `img.handleLoad()` from your own code — `handleLoad` is the `<img>`'s `onLoad` handler. Wire it as `onLoad={img.handleLoad}`; calling it manually marks the image as loaded prematurely (placeholder fades out before the image arrives)",
        "Spreading `useImage` return on the `<img>` directly (`<img {...img}/>`) — most fields aren't `<img>` attributes (`containerRef`, `aspectRatio`, `imageStyle`, `placeholderStyle`, `hasFormats`). Pick the fields you need",
        "Ignoring `img.hasFormats` — if `formats` is set, you should render a `<picture>` with per-format `<source>` elements; `img.srcSet()` returns empty string under formats mode (the format-specific srcsets live on `<source>`)",
        "Treating `useImage` as setup-only — like all Pyreon hooks, call it at the top of the component body. The container ref + signals are stable across re-renders",
      ],
      seeAlso: ['Image', 'createImage', 'UseImageReturn'],
    },
    {
      name: 'createImage',
      kind: 'function',
      signature:
        'function createImage(Component: (p: ImageRenderProps) => any): (props: ImageProps) => any',
      summary:
        'HOC that wraps any component with image optimization. The wrapped component receives `ImageRenderProps` with pre-rendered `placeholder` JSX (null when no placeholder set) + pre-rendered `image` JSX (bare `<img>` OR `<picture>` tree depending on formats), the container ref, container styles, and class. Consumer composes those pieces with whatever wrapper element / extra layout (overlay, badge, caption).',
      example: `import { createImage } from '@pyreon/zero/image'

const FigureImage = createImage((props) => (
  <figure ref={props.containerRef} class={props.class} style={props.containerStyle}>
    {props.placeholder}
    {props.image}
    <figcaption>Caption</figcaption>
  </figure>
))

<FigureImage src="/hero.jpg" alt="Hero" width={1200} height={630} placeholder="/blur.jpg" />`,
      mistakes: [
        "Forgetting to render `props.image` — without it, the actual `<img>` never appears in the DOM. The HOC pre-renders the bare `<img>` or `<picture>` tree; the consumer just needs to place it",
        "Conditionally rendering `props.placeholder` — it's already conditional (null when no `placeholder` prop set). Always render it; React/Pyreon ignore null children",
        "Forwarding `props.containerStyle` to a child instead of the container — the styles (aspect-ratio, position: relative, overflow: hidden) MUST apply to the element holding `props.containerRef`. Otherwise CLS prevention breaks AND IntersectionObserver observes the wrong element",
        "Building `placeholder` JSX from scratch — `createImage` already constructs the blur-up `<img>` with the right styles. Just render `{props.placeholder}`; don't reach into `useImage().placeholderStyle()` manually",
        "Passing `raw: true` to a `createImage`-wrapped component — `raw` short-circuits BEFORE `createImage`'s wrapped component runs (returns bare `<img>`). The wrapped component never receives `ImageRenderProps` in raw mode. Documented as the no-optimization escape hatch",
        "Re-implementing the `<picture>` switch — `props.image` already handles the formats branch. Wrapping `props.image` in another `<picture>` produces nested `<picture>` which browsers ignore (the outer wins)",
      ],
      seeAlso: ['Image', 'useImage', 'ImageRenderProps'],
    },

    {
      name: 'Script',
      kind: 'component',
      signature:
        '<Script src={url} strategy="afterHydration" id={uniqueId} async={true} onLoad={cb} onError={cb} />',
      summary:
        "Default optimized third-party script loader. Strategies: `beforeHydration` (in HTML already), `afterHydration` (inject on mount — default), `onIdle` (via `requestIdleCallback`), `onInteraction` (on first click/scroll/keydown/touchstart), `onViewport` (when sentinel enters viewport). Built on `createScript` — consumers can render loading indicators, retry buttons, or analytics-readiness gates via `createScript(MyCustom)` without re-implementing the strategy machine. Returns a 0×0 sentinel `<div>` for `onViewport` strategy, `null` otherwise.",
      example: `import { Script } from '@pyreon/zero/script'

// Load analytics after page is interactive
<Script src="https://analytics.example.com/script.js" strategy="onIdle" id="analytics" />

// Load chat widget when scrolled into view
<Script src="/chat-widget.js" strategy="onViewport" />

// Inline script with deferred execution
<Script strategy="afterHydration">{\`console.log("App hydrated!")\`}</Script>`,
      mistakes: [
        "Setting `strategy=\"onInteraction\"` for analytics that needs first-paint metrics — by definition, onInteraction loads AFTER the first user interaction; first-paint metrics from such a script are useless. Use `onIdle` for analytics that needs LCP / FCP capture",
        "Forgetting `id` for scripts that might mount in multiple places — without `id`, dedup doesn't fire and the script loads twice. Always provide `id` for analytics / tracking / third-party widgets",
        "Mixing `src` + `children` — `children` is the inline script body; `src` is the URL. If BOTH are set, `src` wins and `children` is ignored (the dom script.src takes precedence). Use one or the other",
        "`strategy=\"beforeHydration\"` without actually putting the `<script>` in the HTML — beforeHydration is a NO-OP marker; the script must already exist in the SSR-emitted HTML. Use SSR `<script>` tag injection in your entry-server, not `<Script>`",
        "Setting `async={false}` for non-critical scripts — `async={false}` blocks parser; reserve for scripts that MUST execute in order (rare for third-party). Default is true",
        "Expecting `onError` to fire for inline scripts — only `src`-based scripts trigger onerror via the browser. Inline scripts (`children`) execute synchronously; runtime exceptions don't propagate to `onError`",
      ],
      seeAlso: ['useScript', 'createScript', 'ScriptProps', 'ScriptStrategy'],
    },
    {
      name: 'useScript',
      kind: 'hook',
      signature: 'function useScript(props: ScriptProps): UseScriptReturn',
      summary:
        "Composable returning script load-state signals + sentinel ref — `{ sentinelRef, loaded, errored, pending, needsSentinel, load }`. Reactive signals (`loaded`, `errored`, `pending`) let consumers render loading indicators, retry buttons, or analytics-readiness gates without re-implementing the strategy machine. `needsSentinel` is true ONLY for `onViewport` strategy. `load()` is the imperative escape hatch (strategy normally triggers it; rarely needed).",
      example: `import { useScript } from '@pyreon/zero/script'

function TrackedScript(props: ScriptProps) {
  const s = useScript(props)
  return (
    <>
      {() => s.pending() && <Spinner />}
      {() => s.errored() && <button onClick={() => location.reload()}>Retry</button>}
      {s.needsSentinel && <div ref={s.sentinelRef} style="width:0;height:0" />}
    </>
  )
}`,
      mistakes: [
        "Reading `s.loaded` / `s.errored` / `s.pending` as booleans — they're `() => boolean` accessors. Call them inside reactive scopes (JSX thunks, `effect()`) so the UI updates when state changes",
        "Forgetting `s.needsSentinel` and always rendering a sentinel — non-onViewport strategies don't need one; rendering a div anyway is harmless but reads as wrong",
        "Calling `s.load()` in the component body — the strategy already calls it (afterHydration runs it on mount, onInteraction on first interaction, etc.). Manual `load()` typically duplicates the request (unless `id` is set for dedup)",
        "Wiring `s.sentinelRef` to a non-DOM element — IntersectionObserver needs a real Element. A `null` or detached ref means viewport-based load never fires",
        "Expecting `s.pending()` to start true for `afterHydration` — it doesn't. `afterHydration` is the synchronous-load strategy; pending only starts true for `onIdle` / `onInteraction` / `onViewport` (where the load is deferred)",
        "Using `s.errored()` to suppress retry-on-mount — `errored` is set when the script's onerror fires, NOT when a previous mount errored. Multi-mount apps need their own retry budget tracking",
      ],
      seeAlso: ['Script', 'createScript', 'UseScriptReturn'],
    },
    {
      name: 'createScript',
      kind: 'function',
      signature:
        'function createScript(Component: (p: ScriptRenderProps) => any): (props: ScriptProps) => any',
      summary:
        "HOC that wraps any component with script load behavior. The wrapped component receives `ScriptRenderProps` with the sentinel ref, load-state signals (`loaded`, `errored`, `pending`), and `needsSentinel` flag. Use this to render loading indicators, retry UI, or analytics-readiness gates around the script load lifecycle.",
      example: `import { createScript } from '@pyreon/zero/script'

const StatusScript = createScript((props) => (
  <div>
    {() => props.pending() && <span>Loading analytics...</span>}
    {() => props.errored() && <span>Analytics failed to load</span>}
    {props.needsSentinel && <div ref={props.sentinelRef} style="width:0;height:0" />}
  </div>
))

<StatusScript src="/analytics.js" strategy="onIdle" id="analytics" />`,
      mistakes: [
        "Always rendering `<div ref={props.sentinelRef} .../>` regardless of `needsSentinel` — for non-onViewport strategies the ref is `undefined`. Gate the sentinel render on `props.needsSentinel`",
        "Calling `props.loaded()` / `props.errored()` / `props.pending()` outside reactive scopes — they're accessors; outside JSX thunks they capture the value at setup time and never update",
        "Forgetting that the wrapped component's render output doesn't affect script loading — the script load fires in `useScript`'s `onMount` regardless of what the wrapped component returns (null, div, fragment). The wrapper is purely a UI surface",
        "Building a custom strategy machine in the wrapped component — the strategy is already resolved by `useScript`. The wrapped component just observes the resulting signals",
        "Forwarding `props.sentinelRef` to multiple elements — `useIntersectionObserver` observes ONE element. Multi-ref forwarding produces undefined behavior (the last-attached element wins)",
        "Expecting the wrapped component to fire `onLoad` / `onError` — those callbacks are on the `ScriptProps` (passed to the OUTER component), not on the wrapped component. The wrapped component reads `props.loaded()` / `props.errored()` signals to react to the same events",
      ],
      seeAlso: ['Script', 'useScript', 'ScriptRenderProps'],
    },
  ],
  gotchas: [
    'mode: \'ssg\' returns Plugin[] (the SSG plugin auto-attaches a companion `ssgPlugin()`); Vite\'s plugins array flattens nested arrays so `plugins: [pyreon(), zero()]` works as-is.',
    {
      label: 'i18n strategies',
      note: '`prefix-except-default` (default) keeps the default locale unprefixed (SEO-canonical for primary-locale apps). `prefix` prefixes every locale including default (best when no locale is primary). Switching strategies changes the dist filesystem layout — plan migration paths if you flip mid-product.',
    },
    {
      label: 'getStaticPaths × i18n cardinality',
      note: '3 IDs × 3 locales × 2 strategies of accidents = bigger SSG output than you expected. Use `ssg.concurrency` to parallelize the render; use `ssg.onProgress` to surface heartbeat lines on long builds (CI silent-stretches look hung otherwise).',
    },
    {
      label: 'Adapter.build invocation',
      note: 'Auto-invoked in SSG `closeBundle` AFTER path render. SSR-mode auto-invoke is NOT yet wired — SSR consumers handle their own server bundle.',
    },
    {
      label: 'Locale-aware RouterLink — not yet shipped',
      note: 'RouterLinks under i18n duplication emit LITERAL hrefs from their `to` prop. Cross-locale navigation falls through to the default-locale route. A locale-aware-link feature is a future PR; for now, write per-locale hrefs explicitly or use the router\'s programmatic navigation in handlers.',
    },
  ],
})
