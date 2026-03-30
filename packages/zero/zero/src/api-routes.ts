import type { Middleware, MiddlewareContext } from '@pyreon/server'

// ─── Types ───────────────────────────────────────────────────────────────────

/** HTTP methods supported by API routes. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/** Context passed to API route handlers. */
export interface ApiContext {
  /** The incoming request. */
  request: Request
  /** Parsed URL. */
  url: URL
  /** URL path. */
  path: string
  /** Dynamic route parameters (e.g., { id: "123" }). */
  params: Record<string, string>
  /** Request headers. */
  headers: Headers
}

/** An API route handler function. */
export type ApiHandler = (ctx: ApiContext) => Response | Promise<Response>

/** An API route module — exports named HTTP method handlers. */
export interface ApiRouteModule {
  GET?: ApiHandler
  POST?: ApiHandler
  PUT?: ApiHandler
  PATCH?: ApiHandler
  DELETE?: ApiHandler
  HEAD?: ApiHandler
  OPTIONS?: ApiHandler
}

/** A registered API route entry. */
export interface ApiRouteEntry {
  /** URL pattern (e.g., "/api/posts/:id"). */
  pattern: string
  /** The route module with method handlers. */
  module: ApiRouteModule
}

// ─── Pattern matching ────────────────────────────────────────────────────────

/**
 * Match a URL path against an API route pattern.
 * Returns extracted params or null if no match.
 */
export function matchApiRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    if (!pp) continue

    // Catch-all: :param*
    if (pp.endsWith('*')) {
      const paramName = pp.slice(1, -1)
      params[paramName] = pathParts.slice(i).join('/')
      return params
    }

    // No more path segments
    if (i >= pathParts.length) return null

    // Dynamic segment: :param
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = pathParts[i]!
      continue
    }

    // Static segment
    if (pp !== pathParts[i]) return null
  }

  return patternParts.length === pathParts.length ? params : null
}

// ─── Middleware ───────────────────────────────────────────────────────────────

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/**
 * Create a middleware that dispatches API route requests.
 * API routes are matched by URL pattern and HTTP method.
 */
export function createApiMiddleware(routes: ApiRouteEntry[]): Middleware {
  return async (ctx: MiddlewareContext) => {
    for (const route of routes) {
      const params = matchApiRoute(route.pattern, ctx.path)
      if (!params) continue

      const method = ctx.req.method.toUpperCase() as HttpMethod
      const handler = route.module[method]

      if (!handler) {
        // Route matched but method not supported
        const allowed = HTTP_METHODS.filter((m) => route.module[m]).join(', ')
        return new Response(null, {
          status: 405,
          headers: {
            Allow: allowed,
            'Content-Type': 'application/json',
          },
        })
      }

      return handler({
        request: ctx.req,
        url: ctx.url,
        path: ctx.path,
        params,
        headers: ctx.req.headers,
      })
    }
  }
}

// ─── Virtual module generation ───────────────────────────────────────────────

/**
 * Detect whether a route file is an API route.
 * API routes are `.ts` or `.js` files inside an `api/` directory.
 */
export function isApiRoute(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return (
    normalized.startsWith('api/') &&
    (normalized.endsWith('.ts') || normalized.endsWith('.js')) &&
    !normalized.endsWith('.tsx') &&
    !normalized.endsWith('.jsx')
  )
}

/**
 * Convert an API route file path to a URL pattern.
 *
 * Examples:
 *   "api/posts.ts"        → "/api/posts"
 *   "api/posts/index.ts"  → "/api/posts"
 *   "api/posts/[id].ts"   → "/api/posts/:id"
 *   "api/[...path].ts"    → "/api/:path*"
 */
export function apiFilePathToPattern(filePath: string): string {
  let route = filePath
  // Remove extension
  for (const ext of ['.ts', '.js']) {
    if (route.endsWith(ext)) {
      route = route.slice(0, -ext.length)
      break
    }
  }

  const segments = route.split('/')
  const urlSegments: string[] = []

  for (const seg of segments) {
    if (seg === 'index') continue

    // Catch-all: [...param]
    const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAll) {
      urlSegments.push(`:${catchAll[1]}*`)
      continue
    }

    // Dynamic: [param]
    const dynamic = seg.match(/^\[(\w+)\]$/)
    if (dynamic) {
      urlSegments.push(`:${dynamic[1]}`)
      continue
    }

    urlSegments.push(seg)
  }

  return `/${urlSegments.join('/')}`
}

/**
 * Generate a virtual module that exports API route entries.
 * Each entry maps a URL pattern to a module with HTTP method handlers.
 */
export function generateApiRouteModule(files: string[], routesDir: string): string {
  const apiFiles = files.filter(isApiRoute)

  if (apiFiles.length === 0) {
    return 'export const apiRoutes = []\n'
  }

  const imports: string[] = []
  const entries: string[] = []

  for (let i = 0; i < apiFiles.length; i++) {
    const name = `_api${i}`
    const file = apiFiles[i]
    if (!file) continue
    const fullPath = `${routesDir}/${file}`
    const pattern = apiFilePathToPattern(file)

    imports.push(`import * as ${name} from "${fullPath}"`)
    entries.push(`  { pattern: ${JSON.stringify(pattern)}, module: ${name} }`)
  }

  return [...imports, '', 'export const apiRoutes = [', entries.join(',\n'), ']'].join('\n')
}
