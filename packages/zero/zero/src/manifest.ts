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
