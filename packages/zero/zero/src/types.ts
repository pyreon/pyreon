import type { ComponentFn } from '@pyreon/core'
import type { NavigationGuard } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'

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

/** Context passed to route loaders. */
export interface LoaderContext {
  params: Record<string, string>
  query: Record<string, string>
  signal: AbortSignal
  request: Request
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
