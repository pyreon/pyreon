import type { ComponentFn } from '@pyreon/core'
import type { LoaderContext, NavigationGuard } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import type { I18nRoutingConfig } from './i18n-routing'

// Re-export router's `LoaderContext` so consumers importing it from
// `@pyreon/zero` keep working. The previous duplicate `interface
// LoaderContext` (with a `request: Request` field that was never
// populated by the actually-constructed runtime ctx) was a
// typed-but-unimplemented bug class — caught by `audit-types`. If
// SSR loaders need access to the request, plumb it through the
// router-level `LoaderContext` in a follow-up PR; do NOT add fields
// here that the runtime doesn't populate.
export type { LoaderContext }

// ─── Route module conventions ────────────────────────────────────────────────

/** What a route file (e.g. `src/routes/index.tsx`) can export. */
export interface RouteModule {
  /** Default export is the page component. */
  default?: ComponentFn
  /** Layout wrapper — wraps this route and all children. */
  layout?: ComponentFn
  /** Loading component shown while lazy-loading or during Suspense. */
  loading?: ComponentFn
  /** Error component shown when the route errors. */
  error?: ComponentFn
  /** Server-side data loader. */
  loader?: (ctx: LoaderContext) => Promise<unknown>
  /** Per-route middleware. */
  middleware?: Middleware | Middleware[]
  /** Navigation guard — can redirect or block navigation. */
  guard?: NavigationGuard
  /** Route metadata. */
  meta?: RouteMeta
  /** Rendering mode override for this route. */
  renderMode?: RenderMode
}

/** Per-route metadata. */
export interface RouteMeta {
  title?: string
  description?: string
  [key: string]: unknown
}

// ─── Rendering modes ─────────────────────────────────────────────────────────

export type RenderMode = 'ssr' | 'ssg' | 'spa' | 'isr'

export interface ISRConfig {
  /**
   * Phase 6 — tags an entry is cached under, evaluated at CACHE-SET time
   * from the request. Pair with `ISRHandler.revalidateTag(tag)` for
   * webhook-driven group invalidation ("a post changed → drop every page
   * that rendered posts") without enumerating concrete paths.
   *
   * @example
   * isr: { revalidate: 60, tagsForRequest: (req) => {
   *   const p = new URL(req.url).pathname
   *   return p.startsWith('/posts/') ? ['posts', `post:${p.split('/')[2]}`] : []
   * } }
   */
  tagsForRequest?: (req: Request) => string[] | Promise<string[]>
  /** Revalidation interval in seconds. */
  revalidate: number
  /**
   * Maximum number of distinct URL paths to keep in the in-memory cache.
   * Oldest-first LRU eviction once the cap is reached. Default: `1000`.
   * Set higher for SSG-heavy sites, lower for routes with unbounded URL
   * space (e.g. `/user/:id` where `:id` is free-form).
   */
  maxEntries?: number
  /**
   * Max wall-time (ms) for a single background revalidation before it is
   * abandoned. Without a bound, a handler that hangs leaves its key
   * pinned in the in-flight set forever — every later request for that
   * key short-circuits the de-dupe guard and the entry can never
   * recover from stale. Default: `30000` (matches the Suspense
   * streaming timeout).
   */
  revalidateTimeoutMs?: number
  /**
   * Cache-key derivation function. The default keys cache entries by
   * `url.pathname + url.search` — query strings carry session IDs,
   * pagination state, sort/filter selectors that all affect rendered
   * HTML, so they belong in the key by default. Cookies and headers
   * are NOT included by default (auth-bearing requests need an
   * explicit `cacheKey`).
   *
   * **Default changed from `url.pathname` to `url.pathname + url.search`
   * in v0.27.** Previously, `/posts?id=42` and `/posts?id=99` shared
   * the same cache entry — the first request's HTML served the second
   * user's content. The new default is safe for query-varied content;
   * see the two trade-offs below for tuning.
   *
   * **⚠️ Auth-gated incompatibility — still applies.** The default
   * does NOT include cookies / Authorization headers. A loader that
   * reads `request.headers.get('cookie')` to gate auth will render
   * ONCE with the first user's cookie, then serve that HTML to every
   * subsequent user (matched only by URL). To use ISR with personalized
   * / auth-gated pages, supply a `cacheKey` that varies on the auth
   * identifier (session cookie, user-id header, etc.), OR don't use
   * ISR for such routes — use SSR instead.
   *
   * **⚠️ High-cardinality query params.** Analytics tokens (`utm_*`,
   * `fbclid`, `gclid`, `mc_eid`) cause cache explosion under the new
   * default — one entry per click variant. For routes that ignore
   * query strings entirely, opt back to pathname-only:
   * `cacheKey: (req) => new URL(req.url).pathname`. A dev-mode warning
   * fires at handler init when no explicit `cacheKey` is configured
   * (once per handler instance, never in production).
   *
   * @example
   * // Vary cache by session cookie (auth-gated pages):
   * isr: {
   *   revalidate: 60,
   *   cacheKey: (req) => {
   *     const url = new URL(req.url)
   *     const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
   *     return `${url.pathname}::${session}`
   *   },
   * }
   *
   * @example
   * // Strip query string entirely (high-cardinality analytics params):
   * isr: {
   *   revalidate: 60,
   *   cacheKey: (req) => new URL(req.url).pathname,
   * }
   *
   * @example
   * // Vary by a single query parameter (drop the rest):
   * isr: {
   *   revalidate: 60,
   *   cacheKey: (req) => {
   *     const url = new URL(req.url)
   *     return `${url.pathname}?sort=${url.searchParams.get('sort') ?? ''}`
   *   },
   * }
   */
  cacheKey?: (req: Request) => string
  /**
   * Pluggable cache backing for multi-instance / horizontally-scaled
   * production. Default: in-memory `Map` per-process (capped by
   * `maxEntries`). Pass a Redis / Vercel KV / Cloudflare KV / Upstash
   * adapter (anything matching the `ISRStore` interface from
   * `@pyreon/zero/server`) for state shared across instances — a
   * revalidation in one pod is visible to all pods.
   *
   * The store interface accepts BOTH sync and async returns; the
   * handler `await`s the result either way, so an in-memory store
   * stays cheap (no Promise allocation per request) while a Redis
   * store can return its native promises directly.
   *
   * When set, `maxEntries` is ignored — the custom store owns its own
   * eviction / TTL policy.
   *
   * @example
   * // Redis adapter (uses `ioredis` or `@upstash/redis`):
   * const redis = new Redis(...)
   * const store: ISRStore = {
   *   async get(key) {
   *     const v = await redis.get(`isr:${key}`)
   *     return v ? JSON.parse(v) : undefined
   *   },
   *   async set(key, entry) {
   *     await redis.set(`isr:${key}`, JSON.stringify(entry), 'EX', 86400)
   *   },
   *   async delete(key) {
   *     await redis.del(`isr:${key}`)
   *   },
   * }
   *
   * isr: { revalidate: 60, store }
   */
  // The actual type lives in `./isr` to avoid `types.ts` pulling the
  // implementation file; we type it as `unknown` here and let consumers
  // pass an `ISRStore` directly — `createISRHandler`'s signature checks
  // the shape statically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store?: import('./isr').ISRStore<any>
  /**
   * Construct the `Request` used for background revalidation. Default:
   * the ORIGINAL user's request (headers, method, URL) — which means a
   * `cacheKey`-bearing entry triggered by user A is revalidated against
   * A's cookies / auth headers. For auth-gated `cacheKey` setups this
   * is risky: if A's session expires before the revalidation runs, the
   * new render may misbehave (auth-gate hits redirect path, or worse,
   * still emits A's personalized HTML because the server hasn't yet
   * invalidated the session token).
   *
   * Supply `revalidateRequest` to construct a request scoped to the
   * cache key — e.g. anonymous for anonymous entries, service-account
   * for shared entries. Returning `null` SKIPS revalidation entirely
   * for this entry (stale stays stale until the next live request).
   *
   * Compatible with `store`: the revalidate path still reads/writes
   * the configured store; this hook only controls what request the
   * re-render runs against.
   *
   * @example
   * isr: {
   *   revalidate: 60,
   *   cacheKey: (req) => {
   *     const session = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon'
   *     return `${new URL(req.url).pathname}::${session}`
   *   },
   *   revalidateRequest: (req) => {
   *     // Anonymous entries re-revalidate as anonymous (safe default).
   *     // Authenticated entries skip revalidation — the user's next
   *     // hit will re-render with their current cookies on cache miss.
   *     const hasAuth = /session=(?!anon)/.test(req.headers.get('cookie') ?? '')
   *     return hasAuth ? null : new Request(req.url, { method: 'GET' })
   *   },
   * }
   */
  revalidateRequest?: (req: Request) => Request | null

  /**
   * PR-S4: response filter — final-say override for whether a render's
   * response can be cached. Receives the freshly-rendered Response;
   * returns it (cache + serve) or `null` (bypass cache — pass through
   * to client with `x-isr-cache: BYPASS`).
   *
   * Wraps the built-in `isCacheable` check. Pyreon's defaults disqualify:
   *   - Non-2xx status codes (transient errors / redirects)
   *   - Responses carrying `Set-Cookie` (per-user state)
   *   - `Cache-Control: private | no-store | no-cache` (RFC 7234)
   *   - `Vary: Cookie | Authorization` without an explicit `cacheKey`
   *   - Any `Authorization` response header
   *
   * Use this when your default-disqualifier matches your needs but a
   * specific page needs explicit opt-in (or opt-out). Returning a NEW
   * Response with stripped headers also works — the cache stores the
   * returned shape.
   *
   * @example
   * ```ts
   * isr: {
   *   responseFilter: (res) => {
   *     // Only cache fully-public marketing pages
   *     if (res.headers.get('x-page-type') !== 'marketing') return null
   *     return res
   *   }
   * }
   * ```
   */
  responseFilter?: (res: Response) => Response | null
}

// ─── Zero config ─────────────────────────────────────────────────────────────

export interface ZeroConfig {
  /** Default rendering mode. Default: "ssr" */
  mode?: RenderMode

  /**
   * Typed route paths (opt-in). When `true`, the plugin scans your routes and
   * generates `src/pyreon-routes.d.ts` (regenerated on route add/remove), which
   * augments `RegisteredRoutes` so `<Link href>` / navigation autocomplete your
   * real route paths and `RouteParams<P>` is typed. Add the generated file to
   * `.gitignore`. Off by default.
   */
  typedRoutes?: boolean

  /** Vite config overrides. */
  vite?: Record<string, unknown>

  /**
   * Path to the client-side entry module that mounts the app. Auto-
   * injected as `<script type="module" src="${entryClient}">` before
   * the `<!--pyreon-scripts-->` placeholder in `index.html` so users
   * don't have to manually wire it (W19).
   *
   * Default: `/src/entry-client.ts`. Set to `false` to disable auto-
   * injection (the user is responsible for adding a `<script>` tag).
   * Auto-injection is also skipped if the html already contains a
   * `<script type="module"` referencing this path.
   */
  entryClient?: string | false

  /** SSR options. */
  ssr?: {
    /** Streaming mode. Default: "string" */
    mode?: 'string' | 'stream'
  }

  /**
   * Build-time per-route performance advisor (opt-in). When set, after the
   * client build the advisor reads the Vite manifest + dist and prints, per
   * route, the perf opportunities it finds — route JS over budget and
   * `content-visibility: auto` without `contain-intrinsic-size` (CLS) — and
   * writes `dist/_pyreon-perf-advisor.json`. Advisory only: never fails the
   * build, silent when there's nothing to report.
   *
   * `true` uses defaults; pass `{ jsBudget }` to set the per-route
   * static-JS-closure byte budget (default 150 KB).
   */
  perfAdvisor?: boolean | { jsBudget?: number }

  /** SSG options — only used when mode is "ssg". */
  ssg?: {
    /** Paths to prerender (or function returning paths). */
    paths?: string[] | (() => string[] | Promise<string[]>)
    /**
     * On-disk output format for prerendered routes — controls which file(s)
     * each route writes, mirroring Astro's `build.format`:
     *
     * - `'directory'` (**default**): `dist/<route>/index.html` (root →
     *   `dist/index.html`). The historical behavior.
     * - `'file'`: `dist/<route>.html` (Next.js `output: 'export'` style;
     *   root → `dist/index.html`).
     * - `'both'`: emit BOTH forms with byte-identical content — one extra
     *   HTML file per route, zero redirect risk on any host or link form.
     *
     * **Why this matters — the slash-less-URL 301.** With `'directory'`
     * only, a host that does NOT auto-rewrite slash-less URLs to the
     * trailing-slash form (GitHub Pages, raw Cloudflare R2 / S3 without an
     * index-document config, plain nginx without `try_files`) answers a
     * direct hit to `/resume` (the canonical share/link form) with a
     * **301 → `/resume/` → 200** round-trip. That single redirect is a
     * measurable mobile-performance cost (PageSpeed "Avoid multiple page
     * redirects"). Emitting `dist/resume.html` lets those hosts serve
     * `/resume` directly with no redirect.
     *
     * **Choosing a value:**
     * - `'both'` is the safe recommendation when redirects matter. It keeps
     *   trailing-slash links working (`<Link to="/resume/">`, the
     *   trailing-slash URLs `seoPlugin`'s sitemap advertises → served by the
     *   directory form) AND serves slash-less share URLs with no redirect
     *   (the file form). Cost: one extra HTML file per route.
     * - `'file'` is leanest but a page is then reachable ONLY at its
     *   slash-less URL — a host that maps `/resume/` → `/resume/index.html`
     *   will 404 the trailing-slash form, so avoid it if your app emits
     *   trailing-slash internal links or sitemap URLs.
     * - When a route is reachable at two URL forms (`'both'`), set a
     *   canonical (`@pyreon/zero`'s `<Meta canonical>`) so search engines
     *   dedupe `/resume` and `/resume/`.
     *
     * The root route always writes `dist/index.html` (there is no
     * `dist/.html`), regardless of format. Default: `'directory'`.
     */
    format?: 'file' | 'directory' | 'both'
    /**
     * Inject `<link rel="modulepreload">` into each prerendered page's
     * `<head>` for the route component's chunk + its STATIC import closure,
     * so the browser fetches the whole route graph in parallel instead of
     * discovering each chunk only after the previous one parses. Vite already
     * preloads the entry graph; this adds the per-route delta.
     *
     * Islands-safe by construction: only the manifest's `imports` (static)
     * are followed, NEVER `dynamicImports` — so deferred island / `lazy()`
     * chunks stay off the critical path. Enables Vite's `build.manifest`
     * (read + deleted post-build; never shipped to the host). Default: `true`.
     * Set `false` to opt out.
     */
    modulePreload?: boolean
    /**
     * Phase 6 — emit a `<script type="speculationrules">` block into every
     * prerendered page (Chrome's Speculation Rules API: near-instant
     * navigations by prefetching/prerendering same-origin links). Values:
     * `'prefetch'` (fetch likely next documents), `'prerender'` (fully
     * prerender them — highest impact, highest resource use). Progressive
     * enhancement — unsupported browsers ignore the block. Default: off.
     */
    speculationRules?: 'prefetch' | 'prerender' | false
    /**
     * Phase 6 — opt prerendered pages into CROSS-DOCUMENT View Transitions
     * (`@view-transition { navigation: auto }`): MPA navigations between
     * prerendered pages animate with zero JS in supporting browsers.
     * Default: off.
     */
    viewTransitions?: boolean
    /**
     * Phase 6 — how the styler's collected CSS ships on prerendered pages.
     * `'inline'` (default): the full rule set inlined in a `<style>` tag
     * per page — self-contained pages, but the CSS bytes are re-downloaded
     * with every page's HTML. `'asset'`: the rule set is written ONCE to a
     * content-hashed `assets/pyreon-ssg.<hash>.css` and every page links
     * it — pages share the browser-cached file (HTML shrinks by the full
     * sheet per page; one extra request on first visit).
     */
    cssMode?: 'inline' | 'asset'
    /**
     * Phase 6 — emit per-path `Link: <chunk>; rel=modulepreload` entries
     * into `_headers` for every prerendered page's route-chunk closure
     * (the same per-route delta the `<link rel=modulepreload>` head tags
     * carry). Cloudflare Pages and Netlify turn `Link` headers into HTTP
     * 103 Early Hints — the browser starts fetching route chunks before
     * the HTML arrives. Default: off.
     */
    earlyHints?: boolean
    /**
     * Auto-emit `dist/404.html` from the route tree's `_404.tsx` /
     * `_not-found.tsx` convention. fs-router already wires `_404.tsx` as
     * `notFoundComponent` on its parent layout route; the SSG plugin walks
     * the tree, picks up the first one, renders it through the same SSR
     * pipeline as regular paths (so styler CSS / @pyreon/head metadata land
     * correctly), and writes the result to `dist/404.html`. Static hosts
     * (Netlify, Cloudflare Pages, GitHub Pages, S3+CloudFront) serve this
     * file automatically for unmatched URLs. Default: `true`. Set to
     * `false` to opt out — the route tree is left alone.
     */
    emit404?: boolean
    /**
     * When a route loader throws `redirect('/target')` during SSG, write
     * a `dist/_redirects` file (Netlify / Cloudflare Pages convention)
     * AND a `dist/_redirects.json` (Vercel convention) listing every
     * redirected source path → target. Static hosts pick whichever
     * format their platform supports automatically. The redirected
     * path's HTML file is NOT emitted — the redirect is the response.
     *
     * Without this option, redirect-throwing loaders land in
     * `errors[]` and the path silently disappears from the build —
     * the user sees no output for `/old` AND no warning that the
     * loader ran a redirect. Default: `true`. Set to `false` to
     * restore the pre-PR-B behaviour (redirects treated as errors).
     */
    emitRedirects?: boolean
    /**
     * Additionally emit a static HTML file at the source path with a
     * `<meta http-equiv="refresh">` redirect — for adapters / hosts
     * that don't read `_redirects` (plain S3, GitHub Pages, simple
     * file servers). The meta-refresh fallback works on any HTTP
     * server that serves static files.
     *
     * - `'none'` (default): only `_redirects` / `_redirects.json` are
     *   emitted; no per-redirect HTML file.
     * - `'meta-refresh'`: emit `dist/<source>/index.html` containing
     *   `<meta http-equiv="refresh" content="0; url=<target>">` plus
     *   a canonical link tag for SEO. Status code information is
     *   lost (meta-refresh has no status equivalent), so 301/302/307/
     *   308 all collapse to "client-side refresh".
     */
    redirectsAsHtml?: 'none' | 'meta-refresh'
    /**
     * Callback invoked when a path's render throws (loader-throw that
     * isn't a `redirect()`, render exception, anything that lands in the
     * `errors[]` collection). Returns either:
     * - `string` → written as the path's HTML in place of the failed
     *   render. Use this to emit a per-path fallback page (e.g. a generic
     *   "this content is temporarily unavailable" template) so static
     *   hosts have something to serve at that URL instead of 404'ing.
     * - `null` → skip; the path produces no HTML output. The error
     *   stays in `errors[]` for the post-build summary.
     *
     * The callback runs ONCE per failed path. Async callbacks are
     * awaited. If the callback itself throws, the throw is captured as
     * a separate error entry and the path is skipped (no fallback HTML).
     * Default: `undefined` — failed paths just land in `errors[]`.
     *
     * @example
     * ssg: {
     *   onPathError: async (path, error) => {
     *     console.error(\`SSG render failed for \${path}:\`, error)
     *     return \`<!DOCTYPE html><html><body><h1>Page unavailable</h1></body></html>\`
     *   },
     * }
     */
    onPathError?: (
      path: string,
      error: unknown,
    ) => string | null | Promise<string | null>
    /**
     * When `'json'` (default), write `dist/_pyreon-ssg-errors.json` after
     * the render loop summarising every error encountered (path traversal,
     * timeout, render exception, getStaticPaths throw, fallback callback
     * throw). Each entry has `{ path, message, name, stack }`. The file
     * is ONLY written when `errors.length > 0` — successful builds don't
     * leak an empty manifest. Reading it lets CI gate on render failures
     * without parsing console output (e.g.
     * `cat dist/_pyreon-ssg-errors.json | jq '.errors | length' | grep -q 0`).
     *
     * Set to `'none'` to opt out entirely — errors stay in console-only,
     * matching pre-PR-G behaviour.
     */
    errorArtifact?: 'json' | 'none'
    /**
     * Maximum number of paths rendered in parallel during the SSG closeBundle
     * loop. Default: `4` — a sensible balance between speedup and the risk
     * of exhausting downstream resources (DB connection pools, fetch
     * rate-limits) inside loaders. Set to `1` to render fully sequentially
     * (the pre-PR-D behaviour). Set to a higher value for faster builds
     * on CI / multi-core hosts; the practical ceiling is the number of
     * loader-side concurrent connections your app's data layer tolerates.
     *
     * The render-error pipeline (`onPathError` callback, `errors[]`
     * collection, `_pyreon-ssg-errors.json` artifact) is unchanged —
     * concurrency only affects how many paths are in flight at once,
     * not how their successes / failures are recorded.
     *
     * @example
     * ssg: {
     *   concurrency: 8, // Faster builds for static-content sites
     * }
     */
    concurrency?: number
    /**
     * Per-path progress callback. Invoked once per path AFTER its render
     * settles (success, redirect, OR failure) — never during in-flight
     * renders. Receives `{ completed, total, currentPath, elapsed }`
     * where:
     *   - `completed` is the count of paths whose render has settled (1-indexed)
     *   - `total` is the full path count from `resolvePaths()`
     *   - `currentPath` is the path that just settled
     *   - `elapsed` is wall-clock ms since the loop started
     *
     * Use cases: build-tool progress bars (Vite picks up stdout), CI
     * heartbeat lines on long builds (10k-path sites take minutes —
     * silent stretches look hung), build-time perf instrumentation.
     *
     * Async callbacks are awaited before the next path's progress fires,
     * so a slow callback can serialize progress reporting (it does NOT
     * gate the worker pool — paths keep rendering in parallel; only
     * the progress callbacks themselves are serialized). Throws are
     * captured into `errors[]` with the path suffix `(onProgress)` so
     * a buggy callback can't take down the build.
     *
     * @example
     * ssg: {
     *   onProgress: ({ completed, total, currentPath, elapsed }) => {
     *     console.log(`[${completed}/${total}] ${currentPath} (${elapsed}ms)`)
     *   },
     * }
     */
    onProgress?: (info: {
      completed: number
      total: number
      currentPath: string
      elapsed: number
    }) => void | Promise<void>
    /**
     * Route-level code splitting in SSG mode. Default `true`.
     *
     * When `true` (default), each route file becomes its own dynamic-import
     * chunk via `lazy(() => import("..."))` — only the route the user
     * lands on plus its dependencies ship in the initial bundle, the
     * rest fetch on navigation. Matches the SSR/SPA-mode behaviour zero
     * has always had; brings parity to SSG.
     *
     * When `false`, every route is bundled statically into the main
     * client chunk (the pre-2026-Q3 SSG behaviour). Useful for tiny
     * sites (2-5 pages) where the single-chunk-then-instant-nav trade
     * is preferable — the chunk-fetch cost on navigation is gone, and
     * the marginal bytes are negligible.
     *
     * Crossover point: ~5-8 routes. Below that, single-chunk is fine.
     * Above that, lazy() shrinks the initial bundle by a meaningful
     * amount (a 50-route docs site might drop from 200 KB to 80 KB on
     * first paint).
     *
     * Underlying mechanism is the same 3-tier generator zero already
     * uses for SSR/SPA mode (`fs-router.ts:generateRouteEntry`): lazy
     * component + inlined metadata when possible, lazy + lazy-thunked
     * function exports when not, namespace-import fallback for cases
     * the literal-extractor can't reach.
     *
     * @example
     * ssg: {
     *   splitChunks: false, // bundle-everything for a 3-page marketing site
     * }
     */
    splitChunks?: boolean
  }

  /** ISR config — only used when mode is "isr". */
  isr?: ISRConfig

  /**
   * Deploy adapter. Default: `"node"`.
   *
   * Accepts either a built-in adapter name (string) OR a constructed
   * `Adapter` instance (e.g. `vercelAdapter()`). The scaffolded templates
   * emit the instance form (`adapter: vercelAdapter()`) by convention.
   * `resolveAdapter` (see `adapters/index.ts`) accepts both shapes —
   * strings go through a switch lookup, instances pass through
   * unchanged.
   */
  adapter?: 'node' | 'bun' | 'static' | 'vercel' | 'cloudflare' | 'netlify' | Adapter

  /** Base URL path. Default: "/" */
  base?: string

  /**
   * i18n routing — locale-prefixed route variants generated at build time
   * (PR H of the SSG roadmap). When set, every `FileRoute` is fanned into
   * per-locale duplicates by `expandRoutesForLocales` from
   * `@pyreon/zero`. Independent from the `i18nRouting()` Vite plugin
   * (which only handles request-time locale detection); both can be used
   * together. See `expandRoutesForLocales` JSDoc for strategy semantics.
   */
  i18n?: I18nRoutingConfig

  /** App-level middleware applied to all routes. */
  middleware?: Middleware[]

  /** Server port for dev/preview. Default: 3000 */
  port?: number

  /**
   * Image optimization — auto-wires `imagePlugin` into the build pipeline.
   *
   * Pass `false` to skip the auto-wire (no `?optimize` imports, no AVIF/WebP
   * generation). Pass a config object to override defaults. Default `{}`
   * means: AVIF + WebP fallback, blur placeholder, quality 80, sharp-backed.
   *
   * Image users typically rely on the optimization out of the box —
   * `<Image src={import('./hero.png?optimize')} />` Just Works without
   * adding `imagePlugin()` to the Vite config manually.
   */
  image?: import('./image-plugin').ImagePluginConfig | false

  /**
   * Font optimization — auto-wires `fontPlugin` into the build pipeline.
   *
   * Pass `false` to skip the auto-wire. Pass a config to declare Google
   * Fonts / local fonts; the plugin self-hosts at build time, injects
   * preload + preconnect tags, and applies font-display: swap.
   *
   * Default `{}` (auto-wire enabled but no fonts declared) means the
   * plugin is harmless — it only activates when `google` / `local` are
   * supplied. Pass `false` to remove it from the chain entirely.
   */
  font?: import('./font').FontConfig | false

  /**
   * SEO artifacts — auto-wires `seoPlugin` (sitemap.xml, robots.txt, RSS)
   * when a config is supplied. Same shape as `seoPlugin(config)`; declare it
   * here instead of importing + wiring the plugin manually:
   *
   * ```ts
   * zero({ seo: { sitemap: { origin: 'https://example.com' }, robots: { … } } })
   * ```
   *
   * Not auto-wired when omitted (a sitemap needs an `origin` — there is no
   * meaningful zero-config default).
   */
  seo?: import('./seo').SeoPluginConfig

  /**
   * Favicon set generation — auto-wires `faviconPlugin` when a config is
   * supplied (source SVG/PNG → ICO + PNG sizes + web manifest + theme-aware
   * SVG links). Same shape as `faviconPlugin(config)`:
   *
   * ```ts
   * zero({ favicon: { source: './src/favicon.svg' } })
   * ```
   *
   * Requires `sharp` as a devDependency (the plugin fails the build loudly
   * when a source is configured but sharp is missing).
   */
  favicon?: import('./favicon').FaviconPluginConfig

  /**
   * Social-share (og:image) generation — auto-wires `ogImagePlugin` when a
   * config is supplied (template + text layers → per-locale PNG/JPEG at
   * build time). Same shape as `ogImagePlugin(config)`.
   */
  og?: import('./og-image').OgImagePluginConfig

  /**
   * AI discoverability — auto-wires `aiPlugin` when a config is supplied
   * (llms.txt, llms-full.txt, /.well-known/ai-plugin.json, OpenAPI spec).
   * Same shape as `aiPlugin(config)`.
   */
  ai?: import('./ai').AiPluginConfig
}

// ─── File-system route ───────────────────────────────────────────────────────

/**
 * Which optional metadata exports a route file declares.
 * Detected at scan time by parsing the file source. The code generator
 * uses this to skip emitting `import * as mod` for routes that only
 * export `default`, eliminating the dual-import collision with `lazy()`
 * and silencing `IMPORT_IS_UNDEFINED` warnings from Rolldown.
 */
export interface RouteFileExports {
  /** Has `export const loader` or `export function loader` */
  hasLoader: boolean
  /** Has `export const guard` or `export function guard` */
  hasGuard: boolean
  /** Has `export const meta` */
  hasMeta: boolean
  /**
   * Phase 5 — relative path of the route's `.server.{ts,js}` sibling
   * (server-loader module) when one exists. The generator emits
   * `serverLoader: mod.serverLoader` (SSR build) / `hasServerLoader: true`
   * (client build) from it.
   */
  serverLoaderFile?: string
  /** Has `export const renderMode` */
  hasRenderMode: boolean
  /** Has `export const error` (custom per-route error component) */
  hasError: boolean
  /** Has `export const middleware` */
  hasMiddleware: boolean
  /**
   * Has `export const loaderKey` or `export function loaderKey`. When present,
   * the route generator wires it as the `loaderKey` field on the route record,
   * which controls cache identity for `_loaderCache`. Useful for auth-gate
   * loaders that should invalidate when the session cookie changes — read
   * `document.cookie` (CSR) or `ctx.request.headers.get('cookie')` (SSR) and
   * derive a key from session identity. Default cache key is `path + params`,
   * which doesn't see cookie changes.
   */
  hasLoaderKey: boolean
  /**
   * Has `export const gcTime` (number, in ms). When present, the route generator
   * inlines it on the route record. `gcTime: 0` disables caching entirely —
   * the loader runs on every navigation. Useful for auth-gate loaders that
   * must validate session on every navigation rather than serve stale data.
   */
  hasGcTime: boolean
  /**
   * Has `export function getStaticPaths` or `export const getStaticPaths`.
   * Used at SSG build time to enumerate concrete values for dynamic routes
   * (`/posts/[id].tsx` → `[/posts/1, /posts/2, …]`). The function returns
   * `Array<{ params: Record<string, string> }>`. Mirrors Astro's per-route
   * convention. Without it, dynamic routes are silently skipped during SSG
   * auto-detect — the user must hand-list every value in `ssg.paths`.
   */
  hasGetStaticPaths: boolean
  /**
   * Has `export const revalidate` (number, in seconds, or `false` for
   * never-revalidate). PR I — build-time ISR. The SSG plugin emits a
   * `dist/_pyreon-revalidate.json` manifest mapping `{ path: revalidate }`
   * which the deploy adapter (Vercel / Cloudflare / Netlify) consumes
   * to wire platform-specific ISR rebuild-on-stale. The route generator
   * does NOT inline `revalidate` onto the route record — it's a
   * build-time-only concern that never reaches the runtime router.
   */
  hasRevalidate: boolean
  /**
   * Raw text of the `export const meta = …` initializer, captured as a
   * literal expression. When present, the route generator inlines this
   * value directly into the generated routes module instead of importing
   * it from the route file — which means the route file can be lazy()'d
   * without forcing the entire dependency tree into the main bundle.
   *
   * Only set when the meta export is a top-level `export const meta = { … }`
   * literal that can be extracted via balanced-brace scanning. Anything
   * fancier (computed values, function calls, references to other
   * declarations) leaves this undefined and falls back to a static module
   * import.
   */
  metaLiteral?: string
  /**
   * Raw text of the `export const renderMode = …` initializer, captured
   * as a literal expression. Same inlining strategy as `metaLiteral`.
   */
  renderModeLiteral?: string
  /**
   * Raw text of the `export const revalidate = …` initializer (e.g.
   * `'60'`, `'false'`, `'3600'`). Captured at scan time so the SSG
   * plugin can read the value to emit the build-time ISR manifest
   * WITHOUT loading the route module — which is critical because the
   * manifest is emitted from the synthetic SSR build's outer plugin
   * context, where evaluating route modules would re-trigger the
   * recursive sub-build env-flag guard.
   *
   * Only set when the revalidate export is a top-level
   * `export const revalidate = <numeric|boolean literal>` that passes
   * `isPureLiteral`. Anything else (function calls, references to
   * other declarations) leaves this undefined and the manifest falls
   * back to omitting the entry.
   */
  revalidateLiteral?: string
}

/** Internal representation of a file-system route before conversion to RouteRecord. */
export interface FileRoute {
  /** File path relative to routes dir (e.g. "users/[id].tsx") */
  filePath: string
  /** Parsed URL path pattern (e.g. "/users/:id") */
  urlPath: string
  /** Directory path for grouping (e.g. "users" or "" for root) */
  dirPath: string
  /** Route segment depth for nesting. */
  depth: number
  /** Whether this is a layout file. */
  isLayout: boolean
  /** Whether this is an error boundary file. */
  isError: boolean
  /** Whether this is a loading fallback file. */
  isLoading: boolean
  /** Whether this is a not-found (404) file. */
  isNotFound: boolean
  /** Whether this is a catch-all route. */
  isCatchAll: boolean
  /** Resolved rendering mode. */
  renderMode: RenderMode
  /**
   * Detected optional exports from the file source.
   * When undefined, the generator treats the file as having no metadata
   * exports and emits the optimal `lazy()` shape (one dynamic import,
   * no static metadata wiring). When provided, the generator emits a
   * single namespace import for files with metadata or `lazy()` for
   * files with only a default export.
   */
  exports?: RouteFileExports
}

// ─── Route middleware ────────────────────────────────────────────────────

/** Entry mapping a URL pattern to its route-level middleware. */
export interface RouteMiddlewareEntry {
  pattern: string
  middleware: Middleware | Middleware[]
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface Adapter {
  name: string
  /** Build the production server/output for this adapter. */
  build(options: AdapterBuildOptions): Promise<void>
  /**
   * Revalidate a prerendered path on the deploy platform's ISR layer
   * (PR I — build-time ISR). Called by user code (webhook handlers,
   * cron jobs, CMS triggers, etc.) to trigger a rebuild-on-stale for
   * the named path. Optional — adapters without platform ISR support
   * (static, node, bun) implement a no-op. Returns `{ regenerated:
   * boolean }` so user code can branch on whether the platform actually
   * accepted the revalidation request.
   *
   * Distinct from runtime ISR (`mode: 'isr'`, on-demand LRU caching in
   * `@pyreon/zero/server`'s `createISRHandler`). Build-time ISR is
   * static prerender + platform-driven rebuild-on-stale; runtime ISR is
   * SSR-cached-with-TTL. They can coexist.
   *
   * Per-route `revalidate` metadata flows from `export const revalidate
   * = 60` in route files into a `dist/_pyreon-revalidate.json` manifest
   * the adapter reads at deploy time. Adapters use that manifest to
   * configure platform ISR (Vercel `output/config.json`, Cloudflare
   * Cache API rules, Netlify revalidation headers).
   */
  revalidate?(path: string): Promise<AdapterRevalidateResult>
}

/**
 * Result of `Adapter.revalidate(path)`. `regenerated: false` means the
 * adapter does not support platform ISR (no-op fallback) OR the
 * platform rejected the request. Adapters that throw on platform-API
 * failure should let it propagate so user code can handle the rejection.
 */
export interface AdapterRevalidateResult {
  regenerated: boolean
}

/**
 * Inputs the build pipeline passes to an adapter's `build()` method.
 *
 * The `kind` field discriminates the two shapes. **SSR mode** (`'ssr'`)
 * carries `serverEntry` + `clientOutDir` so adapters can wrap the user's
 * server bundle as a serverless function. **SSG mode** (`'ssg'`) carries
 * only `outDir` (which IS the rendered dist/) — no serverEntry exists
 * because every page is already prerendered. SSG-mode adapters write
 * platform-specific routing config so the host knows the deploy is
 * fully-static (no function invocation per request).
 *
 * Pre-PR-J this was a single SSR-shaped struct; the SSG path had no way
 * to invoke `adapter.build()` because it couldn't supply `serverEntry`.
 * Adding `kind` (with TS-narrowing per branch) lets `ssgPlugin`
 * `closeBundle` call `adapter.build({ kind: 'ssg', outDir, config })`
 * cleanly, AND keeps the SSR-mode adapter implementations unchanged.
 */
export type AdapterBuildOptions =
  | {
      kind: 'ssr'
      /** Path to the built server entry. */
      serverEntry: string
      /** Path to the client build output. */
      clientOutDir: string
      /** Final output directory. */
      outDir: string
      config: ZeroConfig
      /**
       * Vite's resolved `build.assetsDir` (the directory under the output
       * root where content-hashed chunks land — default `'assets'`). Adapters
       * scope their immutable cache-control rules to `/<assetsDir>/*` instead
       * of a hardcoded `/assets/*`, so a custom `assetsDir` still gets the
       * long-cache treatment. Falls back to `'assets'` when absent.
       */
      assetsDir?: string | undefined
    }
  | {
      kind: 'ssg'
      /**
       * The rendered dist directory. For SSG, this directory IS the
       * publishable output — adapters write platform-specific routing
       * config alongside (e.g. `.vercel/output/config.json`,
       * `_routes.json`, `netlify.toml`) but generally don't move files.
       */
      outDir: string
      config: ZeroConfig
      /** Vite's resolved `build.assetsDir` — see the `'ssr'` variant. */
      assetsDir?: string | undefined
    }
