import type { ComponentFn } from '@pyreon/core'
import type { LoaderContext, NavigationGuard } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'

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
  /** Revalidation interval in seconds. */
  revalidate: number
  /**
   * Maximum number of distinct URL paths to keep in the in-memory cache.
   * Oldest-first LRU eviction once the cap is reached. Default: `1000`.
   * Set higher for SSG-heavy sites, lower for routes with unbounded URL
   * space (e.g. `/user/:id` where `:id` is free-form).
   */
  maxEntries?: number
}

// ─── Zero config ─────────────────────────────────────────────────────────────

export interface ZeroConfig {
  /** Default rendering mode. Default: "ssr" */
  mode?: RenderMode

  /** Vite config overrides. */
  vite?: Record<string, unknown>

  /** SSR options. */
  ssr?: {
    /** Streaming mode. Default: "string" */
    mode?: 'string' | 'stream'
  }

  /** SSG options — only used when mode is "ssg". */
  ssg?: {
    /** Paths to prerender (or function returning paths). */
    paths?: string[] | (() => string[] | Promise<string[]>)
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
  }

  /** ISR config — only used when mode is "isr". */
  isr?: ISRConfig

  /** Deploy adapter. Default: "node" */
  adapter?: 'node' | 'bun' | 'static' | 'vercel' | 'cloudflare' | 'netlify'

  /** Base URL path. Default: "/" */
  base?: string

  /** App-level middleware applied to all routes. */
  middleware?: Middleware[]

  /** Server port for dev/preview. Default: 3000 */
  port?: number
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
}

export interface AdapterBuildOptions {
  /** Path to the built server entry. */
  serverEntry: string
  /** Path to the client build output. */
  clientOutDir: string
  /** Final output directory. */
  outDir: string
  config: ZeroConfig
}
