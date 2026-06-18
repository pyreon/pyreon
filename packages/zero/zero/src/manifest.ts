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
    "Pyreon's full-stack meta-framework. Single `zero({ mode, base, ssg, i18n })` plugin chooses rendering mode (`ssg` / `ssr` / `isr` / `spa`), wires file-system routing under `src/routes/`, and composes with seo / favicon / og-image / ai / i18n-routing / csp plugins. Per-route exports for `meta`, `getStaticPaths`, `revalidate`, `validateSearch`, `loader`, `renderMode` (per-route 'ssr' | 'ssg' | 'spa' | 'isr' hybrid rendering), plus `.server.{ts,tsx,js,jsx}` SIBLINGS exporting `serverLoader(ctx)` — server-only data loaders structurally excluded from the client bundle (client navigations fetch the whole chain's data in ONE request from `GET /_pyreon/data`; layouts cannot carry server loaders). `mode: 'ssr'` STREAMS by default (`ssr: { mode: 'string' }` opts back). Re-exports `island` + `serverIsland` (per-request server-rendered holes in cacheable pages). SSG delivery polish: `ssg.speculationRules`, `ssg.viewTransitions`, `ssg.cssMode: 'asset'`, `ssg.earlyHints`. ISR: tag-based invalidation (`isr.tagsForRequest` + `revalidateTag(tag)`) and a restart-surviving `createFsStore(dir)`. Deployment via per-platform adapters (Vercel / Cloudflare Pages / Netlify / Node / Bun / static). Built-in image / font / resource-hint primitives: bi-modal `<Image>` (a `?optimize` descriptor OR a runtime URL with required `width`+`height`) plus `<OptimizedImage>`, the `<NoOptimize>` subtree opt-out boundary, and `createImageRegistry()`; font preload via `usePreloadFont()` + the `?font` import (auto `@font-face` + hashed-URL descriptor); and `usePreconnect` / `useDnsPrefetch` / `usePreload` typed resource hints — all auto-wired through `zero({ image, font })`.",
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
    '<Image src={descriptor | URL}> — bi-modal optimized image (dims inferred from ?optimize, or w+h required for a runtime URL)',
    '<OptimizedImage source={descriptor}> one-prop form; <NoOptimize> / useNoOptimize() subtree opt-out boundary; optimize prop per-image',
    'createImageRegistry(map) — typed name → ?optimize descriptor registry (autocomplete over imported assets)',
    'usePreconnect / useDnsPrefetch / usePreload — typed resource-hint primitives (each emits the right <link rel>)',
    'usePreloadFont(href) + ?font import — font preload + auto @font-face / hashed-URL FontDescriptor',
    'zero({ image, font }) — auto-wires imagePlugin / fontPlugin into the Vite plugin chain',
    'SSG injects per-route <link rel=modulepreload> — islands-safe (follows static imports, never dynamicImports)',
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
        'function createISRHandler(handler: (req: Request) => Promise<Response>, config: ISRConfig): ISRHandler',
      summary:
        "Runtime ISR — on-demand SSR caching with stale-while-revalidate. Wraps an SSR handler so pages are rendered on the FIRST request, cached per-URL (or per-`cacheKey`-derived key), and served stale until expiry while a background revalidate fires. The returned `ISRHandler` is still a callable `(req) => Promise<Response>` for `Bun.serve({ fetch: ... })`, but ALSO exposes imperative invalidation: `.revalidateNow(key)` drops one entry (returns `{ dropped: boolean }`), `.revalidateAll()` drops everything (when the store implements `clear()`), and `.revalidateTag(tag)` drops every entry recorded under a tag (returns `{ dropped: number }`) — pair with `config.tagsForRequest(req) => string[]`, which records tags at cache-SET time, for CMS-webhook group invalidation without path enumeration. `config.store` swaps the backing (`createMemoryStore` default; `createFsStore(dir)` survives restarts on a single box; Redis/KV for multi-instance). Pair with webhooks for CMS-driven cache busting — no stale window between content update and propagation. Distinct from build-time ISR (per-route `revalidate` export + `Adapter.revalidate`): runtime ISR caches at request time; build-time ISR triggers platform rebuilds. They can coexist: a `mode: 'isr'` app with per-route `revalidate` exports gets BOTH.",
      example: `import { createISRHandler, createServer } from '@pyreon/zero/server'

const ssrHandler = createServer({ routes })
const isr = createISRHandler(ssrHandler, { revalidate: 60 })

// Use as the request handler
Bun.serve({ fetch: isr })

// CMS webhook: drop one entry
app.post('/api/webhooks/post-updated', async (req) => {
  const { postId } = await req.json()
  const result = await isr.revalidateNow(\`/posts/\${postId}\`)
  return Response.json(result) // { dropped: true | false }
})

// Admin "purge cache" endpoint
app.post('/admin/purge', async () => {
  await isr.revalidateAll()
  return new Response('ok')
})

// Tag-based group invalidation — record tags at cache-set time…
const tagged = createISRHandler(ssrHandler, {
  revalidate: 60,
  tagsForRequest: (req) => {
    const p = new URL(req.url).pathname
    return p.startsWith('/posts/') ? ['posts', \`post:\${p.split('/')[2]}\`] : []
  },
})
// …then drop every page that rendered posts, no path enumeration:
app.post('/api/webhooks/posts-changed', async () => {
  const { dropped } = await tagged.revalidateTag('posts')
  return Response.json({ dropped })
})`,
      mistakes: [
        'Treating the returned handler as a plain function — it ALSO carries `.revalidateNow(key)` and `.revalidateAll()` methods. Webhook-driven invalidation is the canonical way to bust the cache; waiting for the TTL is the fallback',
        'Calling `.revalidateAll()` against a store that does not implement `clear()` — throws a clear error. External stores (Redis with TTL-only) must opt in by implementing the method',
        'Expecting `revalidateNow(key)` against a store without `delete?()` to physically drop the entry — returns `{ dropped: false }` honestly; such stores rely on TTL for eviction',
        'Sharing the ISR handler across server instances without external cache — each server\'s in-memory cache diverges. For multi-instance deploys, swap `config.store` to a shared cache layer (Redis / Vercel KV / Cloudflare KV)',
        'Setting `revalidate: 0` and expecting "never cache" — pass-through is the explicit handler call (no `createISRHandler` wrapper). Use `revalidate: Number.MAX_SAFE_INTEGER` for "cache forever, invalidate only via `revalidateNow`"',
        'Calling `.revalidateTag()` against a custom store without `setTags`/`keysByTag` — throws a clear error naming the missing methods; both shipped stores implement them',
        'A throwing `tagsForRequest` never breaks caching — the entry is cached UNTAGGED (dev-mode warns)',
      ],
      seeAlso: ['zero', 'Adapter', 'ISRStore', 'createMemoryStore'],
    },
    {
      name: 'ISRStore',
      kind: 'type',
      signature:
        'interface ISRStore<E = ISRCacheEntry> { get(key): E | Promise<E | undefined> | undefined; set(key, entry): void | Promise<void>; delete?(key): void | Promise<void>; clear?(): void | Promise<void>; setTags?(key, tags: readonly string[]): void | Promise<void>; keysByTag?(tag): string[] | Promise<string[]> }',
      summary:
        'The pluggable ISR cache backing. All methods may return sync OR async — the handler awaits every call (a same-tick microtask for the in-memory default; real network promises for Redis / Vercel KV / Cloudflare KV adapters). `delete`/`clear` are optional (stores without them degrade `revalidateNow`/`revalidateAll` honestly); `setTags`/`keysByTag` are the tag-invalidation surface consumed by `revalidateTag`. When a custom store is supplied, `config.maxEntries` is ignored — the store owns its eviction/TTL policy.',
      example: `import type { ISRStore } from '@pyreon/zero/server'

const redisStore: ISRStore = {
  get: (key) => redis.get(key).then((s) => (s ? JSON.parse(s) : undefined)),
  set: (key, entry) => redis.set(key, JSON.stringify(entry), { EX: 3600 }),
  delete: (key) => redis.del(key),
}
createISRHandler(handler, { revalidate: 60, store: redisStore })`,
      seeAlso: ['createISRHandler', 'createMemoryStore', 'createFsStore'],
    },
    {
      name: 'createMemoryStore',
      kind: 'function',
      signature: 'function createMemoryStore<E = ISRCacheEntry>(opts?: { maxEntries?: number }): ISRStore<E>',
      summary:
        'The default in-memory ISR store: insertion-order LRU capped at `maxEntries` (default 1000), with `get` bumping recency so hot paths survive eviction. Implements the full optional surface (`delete`/`clear`/`setTags`/`keysByTag` — the tag index prunes evicted keys lazily). Per-process — fine for single-instance deploys; multi-instance wants a shared external store.',
      example: `createISRHandler(handler, { revalidate: 60, store: createMemoryStore({ maxEntries: 5000 }) })`,
      seeAlso: ['createISRHandler', 'ISRStore', 'createFsStore'],
    },
    {
      name: 'createFsStore',
      kind: 'function',
      signature: 'function createFsStore<E = ISRCacheEntry>(dir: string): ISRStore<E>',
      summary:
        "Filesystem-backed ISR store for self-hosted node/bun: cache entries (and the tag index) persist as JSON files under `dir`, so a server restart does NOT cold-start the cache (no thundering herd on the origin). One file per key (fs-safe encoded; over-length keys hash to a fixed name so long query strings can't silently ENAMETOOLONG-drop), `_tags.json` sidecar written atomically (tmp+rename). EVERY fs error degrades to cache-miss behavior — never a request-path throw. Per-BOX — multi-instance deploys still want Redis/KV.",
      mistakes: [
        'Using it across multiple instances — each box has its own directory; tag invalidation on one box does not reach the others',
        'Pointing `dir` at a tmpfs that clears on reboot — defeats the restart-survival purpose',
      ],
      example: `import { createFsStore } from '@pyreon/zero/server'

createISRHandler(handler, {
  revalidate: 60,
  store: createFsStore('./.isr-cache'),
  tagsForRequest: (req) => (new URL(req.url).pathname.startsWith('/posts/') ? ['posts'] : []),
})`,
      seeAlso: ['createISRHandler', 'ISRStore', 'createMemoryStore'],
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
        "SEO plugin — emits `sitemap.xml`, `robots.txt`, JSON-LD, and hreflang cross-references. `sitemap.useSsgPaths: true` auto-detects from SSG output manifest (paths from `getStaticPaths` × locale variants flow in automatically). `sitemap.hreflang: true` auto-detects i18n config from the SSG manifest → clusters per-locale URLs into ONE `<url>` with `<xhtml:link rel='alternate' hreflang>` siblings + `x-default` entry. `sitemap.trailingSlash: 'always' | 'never' | 'preserve'` (default `'preserve'`) controls non-root `<loc>` slashes — set `'always'` for hosts that 301 `/path` → `/path/` (GitHub Pages, directory-style Netlify/Cloudflare Pages) so the sitemap doesn't emit redirect-triggering URLs. Falls back to fs-router walk when SSG manifest is absent.",
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
      signature: 'function useRequestLocals(): Record<string, unknown>',
      summary:
        'Bridge middleware-attached request locals into the component tree. Middleware sets `ctx.locals.user = currentUser`; components call `useRequestLocals()` to read during SSR (also works inside server-island fragments and server loaders). IMPORT IT FROM `@pyreon/server` — zero does not re-export it from any entry. Non-generic: cast the fields you read. Returns an empty record outside a request context.',
      mistakes: [
        'Importing from `@pyreon/zero` or `@pyreon/zero/server` — the only home is `@pyreon/server`',
        'Calling with a type argument — the API is non-generic; cast the read instead',
      ],
      example: `// middleware
async function authMiddleware(ctx, next) {
  ctx.locals.user = await verifyToken(ctx.req.headers.get('authorization'))
  return next()
}

// component
import { useRequestLocals } from '@pyreon/server'
const user = useRequestLocals().user as User | null`,
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
      class={\`card \${link.classes()}\`}
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
      name: 'Icon',
      kind: 'component',
      signature: '<Icon as={ImportedSvgComponent} | svg={rawSvgMarkupString} {...hostProps} />',
      summary:
        "Renders a FULL loaded SVG — it does NOT synthesize its own `<svg>` around hand-authored `<path>` children. You load an svg (it already contains the `<svg>` root) and Icon makes it container-sizable + theme-aware. Two source props: `as` — an imported SVG *component* (`import X from './x.svg?component'`), rendered DIRECTLY with no host wrapper (recommended; it's a real `<svg>` so container-fill is reliable); `svg` — the raw `<svg>…</svg>` *markup string* (`import x from './x.svg?raw'`), inlined via a single `<span>` host (a markup string needs a parent to mount — this one host is unavoidable for the string form). Defaults (`fill=\"currentColor\"`, `display:block;width:100%;height:100%`) are overridable — consumer props spread through and win. No fixed size → fills its container; `fill=\"currentColor\"` themes via CSS `color`. Intentionally no `useIcon` hook (an icon has no composable behaviour); two layers: `createIcon` (one component per loaded glyph) + `Icon` (one-off).",
      example: `import { Icon } from '@pyreon/zero'
import Check from './check.svg?component'
import checkRaw from './check.svg?raw'

// Component form — rendered directly, no wrapper, reliable fill:
<span style="width:2rem"><Icon as={Check} /></span>

// Raw-markup form — inlined inside one <span> host:
<span style="width:2rem"><Icon svg={checkRaw} /></span>`,
      mistakes: [
        "Expecting `<Icon>` to synthesize an `<svg>` from `<path>` children — it does NOT. Pass a loaded svg via `as` (imported `?component`) or `svg` (imported `?raw` string). Children are not the API",
        "Expecting `<Icon>` to size itself — it has NO intrinsic size; it fills its container. Wrap + size it (`<span style=\"width:1.5rem\">`) or use a sized flex/grid cell",
        "Hardcoding `fill=\"#000\"` — breaks theming. Leave the `currentColor` default; drive colour with CSS `color` so dark mode + hover work for free. Only the `as` form forwards `fill` to the real svg — the `svg`-string form's markup is opaque, so colour it via `currentColor` inside the asset",
        "Expecting svg-only props (`viewBox`, `fill`) to apply in the `svg`-string form — they can't reach the opaque inlined markup; only host attrs (`class`, `style`, `aria-*`, events) forward. Use the `as` form when you need to drive svg attributes",
        "Reaching for a `useIcon` hook — there isn't one, by design. Use `createIcon` or inline `<Icon>`; an icon has no behaviour worth a hook layer",
        "Preferring `svg` (raw string) for the wrapper-free guarantee — it's the opposite: `svg` ALWAYS adds a `<span>` host (unavoidable for string inlining); `as` is the zero-wrapper form",
      ],
      seeAlso: ['createIcon', 'IconProps', 'Image'],
    },
    {
      name: 'createIcon',
      kind: 'function',
      signature: 'function createIcon(source: string | SvgComponent): (props: SvgAttributes) => VNodeChild',
      summary:
        "Builds a reusable icon component from a LOADED svg — a raw `<svg>…</svg>` markup string (`?raw`) OR an imported SVG component (`?component`). The result is still just `<Icon>` (string → `svg` prop, component → `as` prop), so it's container-sizable + theme-aware with every prop passed through. A generated icon set is `createIcon`-per-glyph with zero per-icon boilerplate. Mirrors the `createLink`/`createImage` factory layer, minus a hook (icons have no composable behaviour).",
      example: `import { createIcon } from '@pyreon/zero'
import StarSvg from './star.svg?component'
import checkRaw from './check.svg?raw'

export const Star = createIcon(StarSvg)     // component → rendered directly
export const Check = createIcon(checkRaw)   // raw string → inlined via <span>

// Sized + themed entirely by the consumer:
<span style="width:48px"><Check class="text-green-600" aria-label="done" /></span>`,
      mistakes: [
        "Calling `createIcon` inside a component body — define icon components at module scope (like `createLink`/`createImage`). Re-creating the component every render defeats identity-based reconciliation",
        "Passing hand-built `<path>` JSX as `source` — `source` is a full loaded svg: a `?raw` markup string OR a `?component` import. It does NOT take individual shapes; the loaded asset already contains its own `<svg>` root",
        "Assuming the `?raw` form has no wrapper — the string form ALWAYS adds one `<span>` host (unavoidable for inlining markup). Use the `?component` form for the zero-wrapper, attribute-forwarding path",
      ],
      seeAlso: ['Icon', 'IconProps', 'createNamedIcon', 'iconsPlugin'],
    },
    {
      name: 'iconsPlugin',
      kind: 'function',
      signature: "iconsPlugin({ dir | sets, out?, mode?: 'inline' | 'image' }): Plugin",
      summary:
        "Vite plugin (from `@pyreon/zero/server`): point it at a folder of `*.svg` files and it writes a strictly-typed generated `icons.gen.tsx` exporting `<Icon name=\"…\" />`. Add an svg → the `name` union widens; remove one → an invalid `name` fails typecheck. The generated file calls `createNamedIcon(REGISTRY)`, so `keyof typeof REGISTRY` IS the type surface (autocomplete + real go-to-definition, zero per-app wiring — same one-touch shape as fs-router / islands auto-registry). Regenerates on add/unlink in dev (idempotent write — never rewrites identical content). **Named multi-set form** (`sets: { ui: { dir }, brand: { dir, mode } }`, mutually exclusive with `dir`): one generated file exports a strictly-typed component PER set with NAMESPACED types so they never clash — `ui` → `<UiIcon name=\"…\" />` + `type UiIconName`, `brand` → `<BrandIcon name=\"…\" />` + `type BrandIconName`; per-set binding prefixes mean two sets sharing a glyph filename don't collide. Two render modes per the colorful-vs-system split (settable per-set): `mode: 'inline'` (default — system icons; each svg inlined as raw `?raw` markup, `currentColor`-themeable, recolor via CSS `color`) and `mode: 'image'` (colorful / brand icons; each svg emitted as a static asset, rendered `<img>`, NO mutation, original colors preserved). Default `out` is `icons.gen.tsx` next to `dir` for the single-set form (`src/icons` → `src/icons.gen.tsx`) or `src/icons.gen.tsx` for the multi-set form — recommend gitignoring it (build artifact). It writes a real file (NOT a virtual module) deliberately: the published `@pyreon/zero` package can't `import` a plugin virtual module — Rolldown resolves static imports before plugin `resolveId` (the same constraint that makes islands need `hydrateIslandsAuto(registry)` with an explicit import). **In inline mode the generated file exports TWO shapes: (1) per-icon PascalCase components (`export const CheckCircle = /*#__PURE__*/ createIcon(...)`) — the PREFERRED surface, tree-shakeable by standard ESM dead-code elimination, so `import { CheckCircle } from './icons.gen'` drops every unused icon AND the runtime registry from the bundle; (2) `<Icon name=\"…\" />` — the runtime `registry[name]` lookup, kept as the escape hatch for DYNAMIC / data-driven names (`<Icon name={cmsKey} />`), which necessarily retains the whole set. Bounded, statically-named sets should import the per-icon bindings; image-mode sets stay registry-only (`createIcon` renders raw `?raw` markup, not an `<img>`).**",
      example: `// vite.config.ts — single set:
import { iconsPlugin } from '@pyreon/zero/server'
iconsPlugin({ dir: './src/icons' })
// app (PREFERRED — tree-shakeable, unused icons dropped):
import { CheckCircle } from './icons.gen'
<span style="width:2rem"><CheckCircle /></span>
// dynamic / data-driven name (escape hatch — retains the whole set):
import { Icon } from './icons.gen'; <Icon name={iconKey()} />

// Named multi-set — per-set typed components, no IconName clash:
iconsPlugin({ sets: {
  ui:    { dir: './src/icons/ui' },
  brand: { dir: './src/icons/brand', mode: 'image' },
}})
// app: per-icon bindings are namespaced by set (UiArrowLeft / BrandLogoMark):
import { UiArrowLeft, BrandIcon } from './icons.gen'`,
      mistakes: [
        "Reaching for `<Icon name=\"close\" />` for a bounded, statically-known set — that's the dynamic escape hatch and a `registry[name]` lookup retains EVERY icon. Import the per-icon binding (`import { Close } from './icons.gen'; <Close />`) so unused icons tree-shake out",
        "Passing BOTH `dir` and `sets` (or neither) — exactly one is required; the plugin throws `[Pyreon] iconsPlugin: provide EXACTLY ONE of dir or sets` at config time",
        "Using `mode: 'inline'` (default) for multicolor / brand SVGs — inline mode is for monochrome system icons you recolor via `currentColor`. A multicolor logo's hardcoded fills survive but you lose nothing by using `mode: 'image'`, which is the correct choice for no-mutation colorful assets",
        "Using `mode: 'image'` for icons you need to recolor — `<img>` can't be themed via CSS `color`; the svg is opaque. Recolorable system icons need `mode: 'inline'`",
        "Editing the generated `icons.gen.tsx` by hand — it's regenerated on every add/unlink. Add/remove `.svg` files in the set folder(s) instead; commit the gitignore entry, not the file",
        "Expecting a virtual `import 'virtual:zero/icons'` — there isn't one (Rolldown import-ordering constraint). The plugin writes a REAL file you import by path; that's what gives go-to-definition + zero wiring",
        "Pointing a set `dir` at a folder that doesn't exist yet — `scanIconDir` returns empty and the generated `*IconName` is `never` (every `name` fails typecheck). Create the folder + drop at least one `.svg` first",
        "Forgetting `vite/client` types — the generated file's `?raw` imports rely on Vite's ambient `*.svg?raw` module declaration; the generated file emits `/// <reference types=\"vite/client\" />` but the consuming tsconfig must still resolve `vite/client`",
      ],
      seeAlso: ['createNamedIcon', 'Icon', 'IconProps'],
    },
    {
      name: 'createNamedIcon',
      kind: 'function',
      signature:
        "function createNamedIcon<R extends Record<string, string>>(registry: R, options?: { mode?: 'inline' | 'image' }): (props: { name: keyof R & string } & …) => VNodeChild",
      summary:
        "Runtime half of `iconsPlugin` — builds a strictly-typed `<Icon name=\"…\" />` from a name→source registry. `keyof R` makes `name` a precise string union (the generated file passes a literal registry so the union infers there → autocomplete + go-to-definition). `mode: 'inline'` (default) treats each `source` as raw `<svg>` markup rendered via `Icon` (`currentColor`-themeable system icons); `mode: 'image'` treats each `source` as an asset URL rendered `<img>` with NO mutation (colorful / brand icons). Either way it stays container-filling + props-transparent. **This is the DYNAMIC-name surface — a `registry[name]` lookup necessarily retains the WHOLE icon set in the bundle (it can't tree-shake an unknown runtime key). Use it for data-driven names (`<Icon name={cmsKey} />`); for a bounded, statically-named set prefer the per-icon `createIcon`-backed bindings the generated file also exports (`import { CheckCircle } from './icons.gen'`), which tree-shake.** Not normally hand-called — `iconsPlugin` emits the generated file that calls it; call it directly only for a hand-maintained set.",
      example: `// icons.gen.tsx (auto-generated by iconsPlugin):
import { createNamedIcon } from '@pyreon/zero'
export const Icon = createNamedIcon({ 'check-circle': '<svg…>…</svg>' })

// image mode (hand-maintained colorful set):
import logo from './logo.svg' // Vite → URL
export const Brand = createNamedIcon({ logo }, { mode: 'image' })
<Brand name="logo" alt="Company" />`,
      mistakes: [
        "Passing a `Record<string, string>` typed loosely (e.g. `: Record<string, string>`) — that widens `keyof R` to `string` and you lose the typed `name`. Pass the object literal directly (or `as const`) so the keys infer",
        "Using `mode: 'image'` then expecting `fill` / svg props to apply — the `<img>` is opaque; only host attrs (`class`, `style`, `alt`, events) forward. Use `mode: 'inline'` for svg-attribute control",
        "Omitting `alt` in `mode: 'image'` — it defaults to `\"\"` (decorative). Pass a real `alt` for meaningful icons; screen readers skip empty-alt images",
        "Calling `createNamedIcon` inside a component body — define the set once at module scope (the generated file does). Re-creating it per render defeats identity-based reconciliation",
      ],
      seeAlso: ['iconsPlugin', 'Icon', 'IconProps'],
    },
    {
      name: 'Image',
      kind: 'component',
      signature:
        '<Image src={descriptor | url} alt={alt} width? height? optimize? priority loading="lazy" placeholder={blurUrl} /> — bi-modal `src`: a `?optimize` ProcessedImage descriptor (Shape A, dims inferred) OR a runtime string URL (Shape B, width+height then REQUIRED)',
      summary:
        "Default optimized image. **Bi-modal `src` (post-0.28)**: pass a `?optimize` descriptor as `src` (Shape A — width / height / srcset / formats / placeholder all carried by the descriptor, you supply only display props) OR a runtime string URL (Shape B — `width` + `height` are REQUIRED at the type level so a remote / signal-driven URL can't silently cause CLS). Optimization = lazy loading via IntersectionObserver, automatic aspect-ratio for CLS prevention, responsive srcset, multi-format `<picture>`, blur-up placeholder, `fetchPriority=\"high\"` for LCP images. The `optimize` prop opts out / back in: `false` bypasses the pipeline and renders a bare `<img>`; `true` forces optimization ON even inside an outer `<NoOptimize>` boundary (caller intent wins); omitted respects the surrounding `<NoOptimize>` if present, else full optimization. Built on `createImage` so consumers layer rocketstyle / custom wrappers via `createImage(MyStyledImage)` without losing the pipeline. `raw: true` is the hard escape hatch — a bare `<img>` with no container, no lazy load, no aspect-ratio enforcement.",
      example: `import { Image } from '@pyreon/zero/image'
import hero from './hero.jpg?optimize'

// Shape A — descriptor as src (dims + srcset + formats inferred)
<Image src={hero} alt="Hero" priority />
// (legacy spread form still works: <Image {...hero} alt="Hero" />)

// Shape B — runtime string URL: width + height REQUIRED
<Image src="/hero.jpg" alt="Hero" width={1200} height={630} />

// Opt out of optimization for one image (bare <img>)
<Image src={logo} alt="Logo" optimize={false} />

// Force optimization back ON inside a <NoOptimize> boundary
<NoOptimize>
  <Image src={hero} alt="Hero" optimize />
</NoOptimize>

// Raw mode — skip ALL wrappers (custom layout)
<Image src="/bg.jpg" alt="" width={400} height={300} raw />`,
      mistakes: [
        "Passing a runtime string URL (Shape B) without `width` + `height` — both are REQUIRED at the type level for that shape (CLS prevention). Only the `?optimize` descriptor form (Shape A) infers them",
        "Setting `priority` on below-the-fold images — `priority` disables lazy loading AND adds `fetchPriority=\"high\"`. Reserve it for the LCP image only (typically the hero)",
        "Setting `loading=\"eager\"` AND `priority` — they're redundant; `priority` already implies eager. Pick one (`priority` is the LCP-marker; `loading=\"eager\"` is the no-priority eager hint)",
        "Using `placeholder` as a full-resolution image — it should be a tiny base64 data URI or a /placeholder.jpg (~1-2 KB). Large placeholders defeat the purpose by blocking initial paint",
        "Expecting `optimize={false}` to still emit a srcset — `false` bypasses the WHOLE pipeline (bare `<img>`). It's for opting a single image OUT; use `<NoOptimize>` for a subtree and `optimize` (true) to opt one image back in",
        "Reaching for the legacy spread (`<Image {...hero} />`) when the descriptor-as-`src` form (`<Image src={hero} />`) is now canonical and keeps `alt` a required, separate prop the type system enforces",
        "Wrapping `<Image>` in a `<picture>` manually for WebP/AVIF — `formats` already does this via `imagePlugin`. Manual `<picture>` defeats the optimization",
      ],
      seeAlso: ['useImage', 'createImage', 'OptimizedImage', 'NoOptimize', 'ImageProps', 'ImageRenderProps'],
    },
    {
      name: 'OptimizedImage',
      kind: 'component',
      signature: '<OptimizedImage source={img} alt={alt} priority={false} />',
      summary:
        "One-prop form of `<Image>` for `?optimize` imports. `<Image {...hero} alt=\"…\" />` already works, but spreading by hand makes it easy to drop a field — the #1 real-world CLS cause is pulling just `hero.src` onto a raw `<img>` and losing width / height / srcset / placeholder. `<OptimizedImage source={hero} alt=\"…\" />` takes the whole descriptor as a single prop, so every optimization field reaches `<Image>` by construction. Display props (`alt`, `sizes`, `priority`, `loading`, `class`, `style`, `fit`, `decoding`, `raw`) pass through alongside `source`. The companion opt-in lint rule `pyreon/no-discarded-optimize-fields` flags the discard shape (`<img src={hero.src}>`) and points here.",
      example: `import { OptimizedImage } from '@pyreon/zero/image'
import hero from './hero.jpg?optimize'

<OptimizedImage source={hero} alt="Hero" priority />`,
      mistakes: [
        'Pulling just `hero.src` onto a raw `<img src={hero.src}>` — that discards width / height / srcset / placeholder / formats (CLS + no responsive images). Pass the whole descriptor: `<OptimizedImage source={hero} />`',
        'Forgetting `alt` — it is required for accessibility and is NOT part of the `?optimize` descriptor, so `source` alone never supplies it',
      ],
      seeAlso: ['Image', 'ProcessedImage', 'useImage'],
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
    {
      name: 'createImageRegistry',
      kind: 'function',
      signature: '(entries: GlobRecord | Record<K, GlobEntry>, options?: ImageRegistryOptions): ImageRegistry<K>',
      summary: 'Collapses N hand-written image imports into one typed accessor. Takes Vite\'s `import.meta.glob` output (or a `Record<string, ProcessedImage>`) and returns a function that resolves a name to its full descriptor — width, height, srcset, placeholder, formats preserved end-to-end. Enables the icon-set / logo-list pattern: render the right image from a lookup, composing with the full optimization pipeline for free. By default aliases both `basename.ext` and `basename` (no extension) so you have multiple lookup styles; pass `keyBy: \'path\'` to disable aliases when you have filename collisions across directories.',
      example: `const logos = createImageRegistry(
  import.meta.glob('../assets/partners/*.png', { eager: true })
)

function PartnerLogos({ partners }: { partners: string[] }) {
  return partners.map((name) => (
    <Image src={logos(name)} alt={name + ' logo'} />
  ))
}`,
      mistakes: [
        'Forgetting `{ eager: true }` on the glob — lazy imports return Promises, not descriptors, and the registry can\'t use them synchronously',
        'Calling `logos(name)` without a fallback when the name might not exist throws in dev and crashes in prod — use `logos(name, defaultDesc)` instead',
        'Relying on basename aliases when you have collisions (e.g., `logos/strv.png` and `icons/strv.png` both named `strv.png`) — use `keyBy: \'path\'` to disambiguate',
        'Assuming the registry preserves the full glob path — it aliases to basename by default, so `r(\'strv\')` and `r(\'logos/strv.png\')` both work',
        'Not calling `.has(name)` before `.get(name)` when the name is user-supplied, leaving yourself vulnerable to throwing errors',
      ],
      seeAlso: ['Image', 'OptimizedImage', 'ProcessedImage'],
    },
    {
      name: 'NoOptimize',
      kind: 'component',
      signature: '(props: { disabled?: boolean, children?: VNodeChild }): VNodeChild',
      summary: 'Subtree boundary that disables `<Image>` optimization for every descendant — drops them all to bare `<img>` elements (no IntersectionObserver wrapper, no aspect-ratio container, no lazy loading). Useful for icon-heavy routes, server-rendered cached HTML (emails, PDFs, OG cards), or hand-crafted `<picture>` markup. Set `disabled: true` to re-enable optimization for a specific inner subtree (nested override pattern). Per-call `optimize={true}` on an `<Image>` also overrides a parent boundary — caller intent wins.',
      example: `// Disable optimization for an entire icon library
export default function IconLibraryRoute() {
  return (
    <NoOptimize>
      <Image src={icon1} alt="Heart" width={24} height={24} />
      <Image src={icon2} alt="Star"  width={24} height={24} />
    </NoOptimize>
  )
}

// Mixed: outer disables, inner re-enables
<NoOptimize>
  <Icons />
  <NoOptimize disabled>
    <Image src={hero} alt="Hero" /> {/* still optimized */}
  </NoOptimize>
</NoOptimize>`,
      mistakes: [
        'Wrapping `<NoOptimize>` around non-Image components expects them to respect the context — they don\'t, only `<Image>` reads it',
        'Using `disabled={false}` (or omitting it) on a nested `<NoOptimize>` is a no-op — pass `disabled={true}` to override a parent boundary',
        'Relying on `<NoOptimize>` when you actually need `zero({ image: false })` for a global opt-out — boundaries are subtree-scoped only',
        'Combining `<NoOptimize>` with `optimize={false}` on the same `<Image>` is redundant (both disable, but double-disabling is confusing to readers)',
        'Expecting `<NoOptimize>` to affect external third-party image components — it only works with Pyreon\'s `<Image>`',
      ],
      seeAlso: ['Image', 'useNoOptimize'],
    },
    {
      name: 'imagePlugin',
      kind: 'function',
      signature: '(config?: ImagePluginConfig): Plugin',
      summary: 'Vite plugin that transforms image imports with `?optimize` / `?component` / `?raw` query params into optimized responsive images at build time. Generates multiple widths, modern formats (WebP, AVIF), tiny blur placeholders (base64 inline), and outputs optimized images to the build directory. Automatically wired by `zero({ image: {} })` — you typically don\'t need to add it manually to vite.config. In dev, uses `/@fs/` URLs; in build, emits assets and bakes the descriptor (src, srcset, width, height, placeholder, formats) into the JS module.',
      example: `// vite.config.ts — explicit wiring (optional if using zero plugin)
import { imagePlugin } from '@pyreon/zero/image-plugin'

export default {
  plugins: [
    pyreon(),
    zero(),
    imagePlugin({ 
      widths: [480, 960, 1440], 
      quality: 85,
      placeholder: 'blur' 
    }),
  ],
}

// In a component — import with ?optimize
import hero from './images/hero.jpg?optimize'
<Image src={hero} alt="Hero" priority />`,
      mistakes: [
        'Forgetting `{ eager: true }` on glob-based image registries — async imports return Promises, not descriptors',
        'Misconfiguring widths (e.g., widths larger than the source) — plugin still generates them, wasting build time and space',
        'Not installing sharp (bun add -D sharp) — the plugin warns and falls back to copying unoptimized images, silently losing srcset/formats',
        'Tuning per-format quality without understanding codec tolerances — AVIF tolerates 55 where WebP needs 75 for the same perceived quality',
        'Mixing CDN mode (`cdn` provider set) with local processing expectations — CDN mode rewrites URLs, doesn\'t generate local assets',
      ],
      seeAlso: ['Image', 'ProcessedImage', 'ImagePluginConfig'],
    },
    {
      name: 'usePreloadFont',
      kind: 'function',
      signature: 'function usePreloadFont(href: string, opts?: PreloadFontOptions): void',
      summary: 'Runtime hook to emit `<link rel="preload" as="font">` tags for fonts not declared in the global config (per-route hero fonts, conditional loads, or CDN-hosted faces). Auto-infers MIME type from file extension and enforces the `crossorigin="anonymous"` attribute required by the CSS Fonts CORS spec — without it, browsers preload then refuse to use the file and re-fetch it, causing a double-fetch penalty.',
      example: `export default function HeroRoute() {
  usePreloadFont('/fonts/display-bold.woff2')
  return <h1 style="font-family: 'Display Bold'">Hero</h1>
}

// With explicit type override (rare):
usePreloadFont('https://cdn.example.com/brand.woff2', {
  type: 'font/woff2',
  crossorigin: 'anonymous'
})`,
      mistakes: [
        'Forgetting that `usePreloadFont` must be called at component render time (during SSR), not in loaders or global code — it relies on `@pyreon/head`\'s render-time collection',
        'Omitting the MIME type for non-standard extensions (e.g. `.custom`) — the auto-infer defaults to `font/woff2`, which silently breaks the preload if the extension is actually a different format; pass `type` explicitly',
        'Thinking the `crossorigin` attribute is optional for same-origin fonts — the CSS Fonts spec requires CORS for all font loads, even local files; the default `\'anonymous\'` is required',
        'Calling `usePreloadFont` multiple times with the same href expecting multiple preload tags — `@pyreon/head` deduplicates by href, so only one tag is emitted (the correct behavior)',
        'Using `usePreloadFont` for fonts already declared in `zero({ font: { google, local } })` — the global fontPlugin emits preload tags at build time; runtime preloads are for per-route or conditional fonts only',
      ],
      seeAlso: ['inferFontMimeType', 'PreloadFontOptions', 'fontPlugin'],
    },
    {
      name: 'inferFontMimeType',
      kind: 'function',
      signature: 'function inferFontMimeType(href: string): string',
      summary: 'Pure function that maps file extensions to IANA-registry MIME types for use in font preload `<link type=...>` tags. Handles `.woff2` → `font/woff2`, `.woff` → `font/woff`, `.ttf` → `font/ttf`, `.otf` → `font/otf`, `.eot` → `application/vnd.ms-fontobject`, and defaults unknown extensions to `font/woff2` (wrong type is less harmful than missing type, which the preload-scanner silently ignores).',
      example: `import { inferFontMimeType } from '@pyreon/zero'

const mimeType = inferFontMimeType('/fonts/inter.woff2')
console.log(mimeType) // 'font/woff2'

// Handles query strings and fragments:
inferFontMimeType('/fonts/x.woff2?v=123') // 'font/woff2'
inferFontMimeType('/fonts/x.ttf#variant=bold') // 'font/ttf'`,
      mistakes: [
        'Relying on the MIME type for formats outside the five standard types (.woff2, .woff, .ttf, .otf, .eot) — the fallback is always `font/woff2`, which may not match your format',
        'Assuming the function parses the full URL — it does, but only to strip query strings and fragments before extension matching; pass only the file extension if you have a non-standard URL shape',
        'Using the result for purposes other than preload `type` attributes — MIME type inference is specifically for the CSS preload-scanner contract, not for Content-Type headers or browser format detection',
        'Not stripping the extension yourself if you have a custom URL parser — the function expects a path/URL with a recognizable extension, not a bare format name',
      ],
      seeAlso: ['usePreloadFont', 'fontImportPlugin'],
    },
    {
      name: 'PreloadFontOptions',
      kind: 'type',
      signature: 'interface PreloadFontOptions { type?: string crossorigin?: \'anonymous\' | \'use-credentials\' }',
      summary: 'Options for `usePreloadFont`. Both fields are optional — `type` is auto-inferred from the file extension, and `crossorigin` defaults to `\'anonymous\'` (required by the CSS Fonts CORS spec). Override `type` for unknown extensions; use `\'use-credentials\'` for rare credential-bearing same-origin fonts only.',
      example: `usePreloadFont('/fonts/inter.woff2')
// Emits: <link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin="anonymous">

usePreloadFont('/fonts/custom', { type: 'font/woff2' })
// Emits with explicit type override for unknown extension

usePreloadFont('/fonts/auth-required.woff2', { crossorigin: 'use-credentials' })
// For credential-bearing same-origin fonts (uncommon)`,
      mistakes: [
        'Setting `crossorigin: \'anonymous\'` explicitly when it\'s the default — unnecessary but harmless; rely on the default unless you have a specific reason to use `\'use-credentials\'`',
        'Using `\'use-credentials\'` for cross-origin fonts — the CSS Fonts spec only allows this for same-origin loads; cross-origin fonts must use `\'anonymous\'`',
        'Passing a MIME type with `charset` (e.g. `\'font/woff2; charset=utf-8\'`) — font MIME types do not accept charset; preload-scanner will fail to match',
      ],
      seeAlso: ['usePreloadFont'],
    },
    {
      name: 'fontPlugin',
      kind: 'function',
      signature: 'function fontPlugin(config: FontConfig = {}): Plugin',
      summary: 'Vite plugin that auto-optimizes Google Fonts and local fonts declared in `zero({ font: { google, local } })`. In dev mode, injects CDN links for fast startup; in build mode, downloads fonts at build time, self-hosts them from `/assets/fonts/` with hashed filenames, injects preload + preconnect hints into the HTML, applies `font-display: swap` to prevent FOIT (Flash of Invisible Text), and optionally generates size-adjusted fallback `@font-face` rules to reduce CLS. Auto-wired by the zero plugin unless disabled via `zero({ font: false })`.',
      example: `// In vite.config.ts with the zero plugin:
import { zeroPlugin } from '@pyreon/zero/vite-plugin'

export default {
  plugins: [
    zeroPlugin({
      font: {
        google: ['Inter:wght@400;500;700', 'JetBrains Mono:wght@400'],
        local: [
          { family: 'Display', src: '/fonts/display-bold.woff2', weight: 700 }
        ],
        display: 'swap',
        fallbacks: {
          'Inter': { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 90 }
        }
      }
    })
  ]
}`,
      mistakes: [
        'Declaring fonts in both `google` and `local` with the same family name — the plugin applies all CSS at once; duplicate families cause cascade conflicts',
        'Using `display: \'block\'` for all fonts — this causes FOIT (Flash of Invisible Text); `\'swap\'` is the default for a reason and avoids invisible text during font load',
        'Forgetting to add fallback metrics when using variable-weight fonts — without CLS-reduction fallback overrides, layout shift occurs when the custom font replaces the system fallback',
        'Declaring heavy fonts (e.g. all weights 100-900 of a variable font) without assessing the build-time download penalty — Google Fonts self-hosting downloads at build time; monitor your build duration',
        'Setting `selfHost: false` in dev mode thinking it skips the download — `selfHost` controls the BUILD mode behavior; dev always uses CDN for speed',
      ],
      seeAlso: ['fontImportPlugin', 'FontConfig', 'usePreloadFont'],
    },
    {
      name: 'fontImportPlugin',
      kind: 'function',
      signature: 'function fontImportPlugin(config: FontImportPluginConfig = {}): Plugin',
      summary: 'Vite plugin that transforms `import x from \'./path.woff2?font\'` into typed `FontDescriptor` modules with auto-generated `@font-face` CSS and hashed font URLs. Auto-extracts family/weight/style from the filename (e.g. `inter-700.woff2` → family=\'inter\', weight=700), generates the `@font-face` rule as a side-effect CSS import, emits the font file with a content-addressed hash to `/assets/fonts/` in production, and serves it via `/@fs/` in dev. Auto-wired by the zero plugin alongside `fontPlugin` unless `zero({ font: false })` is set.',
      example: `// In a component:
import display from './fonts/display-bold.woff2?font'
import inter700 from './fonts/inter.woff2?font&family=Inter&weight=700'

export default function Hero() {
  return (
    <>
      <h1 style={{ fontFamily: display.family }}>Display Font</h1>
      <p style={{ fontFamily: inter700.family, fontWeight: 700 }}>Body</p>
    </>
  )
}

// Or with usePreloadFont:
usePreloadFont(display)
// Emits preload + uses auto-generated @font-face`,
      mistakes: [
        'Forgetting to include font-types ambient declarations in tsconfig — without `/// <reference types="@pyreon/zero/font-types" />` or `"types": ["@pyreon/zero/font-types"]`, the `?font` import returns `unknown` instead of a typed `FontDescriptor`',
        'Assuming filename inference applies to all tokens — weight keywords like `bold`, `semibold`, etc. are recognized, but `inter-bold-italic.woff2` extracts `family=\'inter\'`, `weight=700`, `style=\'italic\'`, NOT `family=\'inter-bold\'`',
        'Overriding `family` in the query without matching the CSS rule — the plugin generates `@font-face { font-family: \'...\' }` with the FAMILY from your override, so `?font&family=Custom` must match the CSS you reference',
        'Using the descriptor\'s `src` directly in custom CSS without the `?font` query context — the src changes per mode (dev=`/@fs/...`, build=Vite asset placeholder); always use the descriptor object to stay synchronized',
        'Stacking multiple query parameters in the wrong order — the plugin parses `?font&family=X&weight=700`, so always put `?font` first',
      ],
      seeAlso: ['usePreloadFont', 'FontDescriptor', 'fontPlugin'],
    },
    {
      name: 'FontDescriptor',
      kind: 'type',
      signature: 'interface FontDescriptor { family: string src: string weight: number style: \'normal\' | \'italic\' | \'oblique\' display: \'auto\' | \'block\' | \'swap\' | \'fallback\' | \'optional\' type: string fontFace: string }',
      summary: 'Descriptor object returned by `import x from \'./path.woff2?font\'`. Contains the CSS family name, hashed src URL (auto-updated per build), font-weight/style/display values inferred from or overridden via query params, MIME type for preload contracts, and the auto-generated `@font-face` CSS rule string. The descriptor\'s `toString()` returns the family name, so it interpolates directly in template literals: `font-family: ${descriptor}`. The object is frozen to prevent accidental mutations.',
      example: `import display from './fonts/display-bold.woff2?font'

// Display is typed as FontDescriptor:
console.log(display.family)    // 'display'
console.log(display.weight)    // 700
console.log(display.style)     // 'normal'
console.log(display.type)      // 'font/woff2'
console.log(display.src)       // '/assets/fonts/display-abc123.woff2' (build) or '/@fs/...' (dev)

// toString() for interpolation:
const style = \`font-family: \${display};\` // 'font-family: display;'

// Use with usePreloadFont:
usePreloadFont(display)
// Preload href matches display.src perfectly (no drift)`,
      mistakes: [
        'Calling `JSON.stringify(descriptor)` and expecting it to be safe — the descriptor contains a `fontFace` string with user-facing CSS; for logging, use a property selector instead',
        'Attempting to mutate descriptor properties (e.g. `descriptor.weight = 500`) — the object is frozen; reassign to a new variable or create a new import with query overrides',
        'Assuming `descriptor.src` is stable across dev/build — in dev it\'s `/@fs/...`; in build it\'s a Vite asset hash like `/assets/fonts/...`; always reference the descriptor, never hardcode the src',
        'Using `descriptor.fontFace` directly instead of relying on Vite\'s CSS pipeline — the `?font` import side-effects a CSS module; if you want the rule in a stylesheet, use the descriptor\'s family/weight/style to build a fresh `@font-face`',
      ],
      seeAlso: ['fontImportPlugin', 'usePreloadFont'],
    },
    {
      name: 'usePreconnect',
      kind: 'hook',
      signature: 'function usePreconnect(origin: string, opts?: { credentials?: boolean }): void',
      summary: 'Emit a `<link rel="preconnect" href="..." crossorigin>` into the head. Opens the connection (DNS + TCP + TLS) to a remote origin before any resource is requested, saving ~100-300ms on the first fetch from that origin. Use `credentials: true` only for credentialed cross-origin fetches (rare); the default `crossorigin="anonymous"` is correct for 99% of cases. Avoid preconnecting to more than 3-4 origins — the marginal benefit drops fast past ~4.',
      example: `usePreconnect('https://fonts.gstatic.com')
usePreconnect('https://api.example.com', { credentials: true })`,
      mistakes: [
        'Preconnecting to more than 3-4 origins — each connection costs memory + battery; the benefit plateaus quickly, and too many preconnects slow down the entire request queue',
        'Forgetting that `credentials: false` (default) emits `crossorigin="anonymous"` — this is the correct value for fonts, cross-origin images, and anonymous fetches; without it the credentialed fetch doesn\'t reuse the connection',
        'Expecting `usePreconnect` alone to warm up the connection under SSG — it only emits the tag; the browser must visit the page to open the connection. During SSG prerender, no connection is made',
        'Mixing preconnect for an origin that will never be used on this page — you\'re paying the connection cost for zero benefit; reserve it for the 1-3 most-critical external origins',
        'Using `credentials: true` for a cross-origin API that doesn\'t require CORS — `crossorigin="use-credentials"` is an unnecessary hint; the default `anonymous` works fine',
      ],
      seeAlso: ['useDnsPrefetch', 'usePreload', 'PreloadOptions'],
    },
    {
      name: 'useDnsPrefetch',
      kind: 'hook',
      signature: 'function useDnsPrefetch(origin: string): void',
      summary: 'Emit a `<link rel="dns-prefetch" href="...">` into the head. A cheaper but weaker hint than `preconnect` — only resolves the DNS, doesn\'t open the TCP/TLS connection. Use for origins that are LIKELY but not certain to be hit (analytics endpoints that may not fire, third-party widgets that may not render). Does NOT take `crossorigin` (DNS resolution is scheme-agnostic). Pair with `preconnect` for browser fallback — preconnect-capable browsers ignore the dns-prefetch, while older browsers without preconnect support still get the DNS hint.',
      example: `useDnsPrefetch('https://analytics.example.com')
// Fallback pair:
usePreconnect('https://api.example.com')
useDnsPrefetch('https://api.example.com')`,
      mistakes: [
        'Using dns-prefetch for a resource you\'re CERTAIN will be hit — use `preconnect` instead; the full connection pre-open is worth the extra cost',
        'Expecting dns-prefetch to work on very old browsers — it\'s only a fallback hint; modern browsers prefer preconnect. If you need deep browser coverage, pair both',
        'Adding `crossorigin` to a dns-prefetch tag — DNS resolution doesn\'t use CORS; the attribute is ignored. Only `preconnect` uses `crossorigin`',
        'Dns-prefetching 20+ third-party domains — DNS lookups still have latency and memory cost; reserve it for the most-likely fallback origins, not every possible dependency',
        'Forgetting that dns-prefetch, like all resource hints, is advisory — the browser may ignore it due to network conditions, Save-Data preference, or memory pressure; it\'s never a guarantee',
      ],
      seeAlso: ['usePreconnect', 'usePreload', 'PreloadOptions'],
    },
    {
      name: 'usePreload',
      kind: 'hook',
      signature: 'function usePreload(href: string, opts: PreloadOptions): void',
      summary: 'Emit a `<link rel="preload" as="..." href="..." crossorigin>` for a specific resource that the page will hit in the critical path. Unlike generic preload markup, this hook enforces the `as` parameter (required — the preload scanner ignores `<link rel="preload">` without it). Use for LCP images (when not using `<Image priority>`), CSS/fonts loaded at runtime, JSON responses the critical path needs, and web worker scripts. Deduplicates via `@pyreon/head`\'s href-keying — two `usePreload(h)` calls with the same href emit ONE preload tag.',
      example: `// LCP image not using <Image priority>:
usePreload('/hero.jpg', { as: 'image' })

// Style sheet loaded at runtime:
usePreload('/extra.css', { as: 'style' })

// Responsive image with srcset:
usePreload('/hero.jpg', { as: 'image', imagesrcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w', imagesizes: '100vw' })

// Font (requires type):
usePreload('/font.woff2', { as: 'font', type: 'font/woff2', crossorigin: 'anonymous' })`,
      mistakes: [
        'Forgetting `as` — it is REQUIRED; the preload scanner ignores `<link rel="preload">` without it, defeating the entire hint',
        'Using `as: \'font\'` without `type` — the browser\'s preload scanner ignores font preloads without a matching MIME type. Always pair with `type: \'font/woff2\'` (or the actual format)',
        'Preloading a cross-origin resource without `crossorigin: \'anonymous\'` — the browser preload-fetches it early, but then the actual fetch with CORS headers is a second fetch (double-fetch penalty). Add `crossorigin` to reuse the preloaded response',
        'Preloading too many resources — each preload competes for bandwidth with the critical path. Reserve preload for the 2-5 most-critical resources (fonts, LCP images, critical JSON)',
        'Not using `imagesrcset` + `imagesizes` for responsive image preloads — without them the preload scanner picks a fixed size; responsive images should provide both to let the scanner choose the right variant for the viewport',
      ],
      seeAlso: ['usePreconnect', 'useDnsPrefetch', 'PreloadOptions'],
    },
    {
      name: 'PreloadOptions',
      kind: 'type',
      signature: 'interface PreloadOptions { as: \'script\' | \'style\' | \'image\' | \'font\' | \'fetch\' | \'document\' | \'audio\' | \'video\' | \'track\' | \'object\' | \'embed\' | \'worker\'; type?: string; crossorigin?: \'anonymous\' | \'use-credentials\'; media?: string; imagesrcset?: string; imagesizes?: string; fetchpriority?: \'high\' | \'low\' | \'auto\'; }',
      summary: 'Configuration shape for `usePreload(href, opts)`. `as` is REQUIRED and tells the browser what kind of resource is being preloaded (affects Accept header, priority bucket, download size budget). `type` is required for `as: \'font\'` (preload scanner ignores font preloads without matching MIME type) and for `as: \'fetch\'` with a specific response shape. `crossorigin` is required for fonts (\'anonymous\') and for cross-origin `fetch`/`image` preloads that will be read with CORS (prevents double-fetch). `media` enables conditional preloads (e.g. mobile-only). `imagesrcset` + `imagesizes` let the preload scanner pick the right responsive variant. `fetchpriority` hints the browser\'s fetch scheduler.',
      example: `// Image with responsive variants:
{ as: 'image', imagesrcset: '/hero-sm.jpg 640w, /hero-lg.jpg 1920w', imagesizes: '100vw' }

// Font (requires type + crossorigin):
{ as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }

// Fetch with type and CORS:
{ as: 'fetch', type: 'application/json', crossorigin: 'anonymous' }

// Mobile-only preload:
{ as: 'style', media: '(max-width: 600px)' }

// High-priority script:
{ as: 'script', fetchpriority: 'high' }`,
      mistakes: [
        'Omitting `type` for `as: \'font\'` — the preload scanner requires a matching MIME type to recognize font preloads; without it the hint is silently ignored',
        'Using `type: \'application/json\'` for a fetch preload that will be parsed as JSON — while not strictly required, the browser uses the type to set the Accept header correctly; always include it for specificity',
        'Specifying `crossorigin: \'use-credentials\'` when `\'anonymous\'` is sufficient — use-credentials adds cookie/header overhead; only use it for credentialed cross-origin requests',
        'Providing `imagesrcset` without `imagesizes` — the scanner can\'t make a sizing decision without the media-relative size; both must be present for responsive image preloads',
        'Setting `fetchpriority: \'high\'` for non-critical resources — the browser\'s fetch scheduler is already smart about prioritization; high priority is reserved for true LCP/critical-path resources',
      ],
      seeAlso: ['usePreload', 'usePreconnect', 'useDnsPrefetch'],
    },
    {
      name: 'useNoOptimize',
      kind: 'hook',
      signature: 'function useNoOptimize(): boolean',
      summary: 'Reads the current `<NoOptimize>` boundary state. Returns `true` if the render scope is within a `<NoOptimize>` boundary (optimization disabled), `false` otherwise. Primarily used internally by `<Image>` to decide whether to bypass optimization; not intended for public application code.',
      example: `// Inside Image component (internal usage pattern)
const noOptimizeBoundary = useNoOptimize()
const isBypass =
  local.optimize === false || (noOptimizeBoundary && local.optimize !== true)

if (isBypass) {
  return renderBareImg(props)
}`,
      mistakes: [
        'Calling `useNoOptimize()` outside the component tree where `<NoOptimize>` is mounted — returns `false` (falsy but valid; the contract is non-router-aware)',
        'Relying on `useNoOptimize()` to enforce optimization boundaries in custom code — the hook is read-only; use `<NoOptimize>` to set the boundary',
        'Assuming the hook\'s value is stable across re-renders — it responds dynamically to boundary mount/unmount, so guards/memoization may be needed',
      ],
      seeAlso: ['NoOptimize', 'NoOptimizeContext'],
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
      note: 'Auto-invoked at the end of every mode-specific build companion. SSG mode (`ssgPlugin`) calls `adapter.build({ kind: \'ssg\', outDir, config })` after every path renders. SSR/ISR modes (`ssrPlugin`) bundle the SSR handler to `dist/server/entry-server.js` and call `adapter.build({ kind: \'ssr\', serverEntry, clientOutDir, outDir, config })`. The SSR plugin prefers a user-authored `src/entry-server.ts` when present; otherwise it synthesizes the canonical `createServer({ routes, routeMiddleware, apiRoutes })` entry. SPA mode ships only a client bundle (no adapter.build call).',
    },
    {
      label: 'Locale-aware RouterLink — not yet shipped',
      note: 'RouterLinks under i18n duplication emit LITERAL hrefs from their `to` prop. Cross-locale navigation falls through to the default-locale route. A locale-aware-link feature is a future PR; for now, write per-locale hrefs explicitly or use the router\'s programmatic navigation in handlers.',
    },
  ],
})
