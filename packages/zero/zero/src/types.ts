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
  adapter?: 'node' | 'bun' | 'static'

  /** Base URL path. Default: "/" */
  base?: string

  /** App-level middleware applied to all routes. */
  middleware?: Middleware[]

  /** Server port for dev/preview. Default: 3000 */
  port?: number
}

// ─── File-system route ───────────────────────────────────────────────────────

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
  /** Whether this is a catch-all route. */
  isCatchAll: boolean
  /** Resolved rendering mode. */
  renderMode: RenderMode
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
