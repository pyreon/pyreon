import { apiFilePathToPattern, isApiRoute } from '@pyreon/compiler/fs-route-convention'
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

  // A param NAME comes from the route pattern (file-based route like
  // `[__proto__].ts`) — developer-controlled, so this is defense-in-depth
  // rather than an attacker vector, but assigning `params['__proto__'] =
  // …` still mutates the result object's prototype instead of setting a
  // param. Skip the dangerous names (consistent with reconcile / i18n
  // deepMerge guards) so a stray route name can't pollute.
  const isUnsafeParam = (name: string): boolean =>
    name === '__proto__' || name === 'constructor' || name === 'prototype'

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    if (!pp) continue

    // Catch-all: :param*
    if (pp.endsWith('*')) {
      const paramName = pp.slice(1, -1)
      if (!isUnsafeParam(paramName)) params[paramName] = pathParts.slice(i).join('/')
      return params
    }

    // No more path segments
    if (i >= pathParts.length) return null

    // Dynamic segment: :param
    if (pp.startsWith(':')) {
      const paramName = pp.slice(1)
      if (!isUnsafeParam(paramName)) params[paramName] = pathParts[i]!
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
      // PATHNAME, not `ctx.path`: that carries the query string, so
      // `/api/posts?page=2` matched nothing and `/api/users/5?x=1` handed
      // the handler `id = "5?x=1"`.
      const params = matchApiRoute(route.pattern, ctx.url.pathname)
      if (!params) continue

      const method = ctx.req.method.toUpperCase() as HttpMethod
      // HEAD is GET without a body (RFC 9110 §9.3.2): serve it from the GET
      // handler rather than 405 a route that plainly answers GET.
      const handler =
        route.module[method] ??
        (method === 'HEAD' ? route.module.GET : undefined)

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

// `isApiRoute` (a `.ts`/`.js` file inside the TOP-LEVEL `api/` directory —
// nested `posts/api/x.ts` is a PAGE route) and `apiFilePathToPattern` are the
// fs-route CONVENTION — single-sourced from
// `@pyreon/compiler/fs-route-convention` (a pure, dependency-free subpath; it
// does NOT pull the compiler barrel / TypeScript API) so this router and the
// project scanner (`@pyreon/compiler` `generateContext`) can never drift.
// The bodies over there are byte-behavior-identical ports of the functions
// that lived here; this file's tests keep running against the re-exports and
// `fs-route-convention-parity.test.ts` asserts IDENTITY. Do NOT reintroduce
// local copies.
export { apiFilePathToPattern, isApiRoute }

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

  // The dispatcher takes the FIRST matching entry, so emit order IS
  // precedence. Directory-read order put `api/[...path].ts` ahead of every
  // sibling and let `api/posts/[id].ts` capture `/api/posts/new`.
  const ordered = apiFiles
    .map((file) => ({ file, pattern: apiFilePathToPattern(file) }))
    .sort((a, b) => compareApiRoutePatterns(a.pattern, b.pattern))

  for (let i = 0; i < ordered.length; i++) {
    const name = `_api${i}`
    const { file, pattern } = ordered[i]!
    const fullPath = `${routesDir}/${file}`

    imports.push(`import * as ${name} from "${fullPath}"`)
    entries.push(`  { pattern: ${JSON.stringify(pattern)}, module: ${name} }`)
  }

  return [...imports, '', 'export const apiRoutes = [', entries.join(',\n'), ']'].join('\n')
}

/**
 * Specificity rank of one pattern segment: a static segment beats a
 * dynamic one, which beats a catch-all. Running out of segments (the pattern has no segment
 * here) beats all three — `/api/a` must precede `/api/a/:rest*`, which a
 * catch-all also matches with an empty remainder.
 */
function segmentRank(segment: string | undefined): number {
  if (segment === undefined) return 0 // end of pattern
  if (segment.startsWith(':')) return segment.endsWith('*') ? 3 : 2 // catch-all : dynamic
  return 1 // static
}

/**
 * Order two API route patterns most-specific first, comparing segment by
 * segment from the left: the first position where their ranks differ
 * decides (static > dynamic > catch-all > nothing-left counts as most
 * specific). Patterns of identical shape fall back to lexical order so
 * the emitted module is deterministic regardless of directory-read order.
 *
 * @internal exported for tests
 */
export function compareApiRoutePatterns(a: string, b: string): number {
  const as = a.split('/').filter(Boolean)
  const bs = b.split('/').filter(Boolean)
  const n = Math.max(as.length, bs.length)
  for (let i = 0; i < n; i++) {
    const diff = segmentRank(as[i]) - segmentRank(bs[i])
    if (diff !== 0) return diff
  }
  return a < b ? -1 : a > b ? 1 : 0
}
