/**
 * @pyreon/zero fs-route convention — THE single source of truth.
 *
 * The pure path→URL functions of zero's file-based router, extracted so every
 * consumer imports ONE implementation (the `scripts/test-paths.ts` precedent):
 *
 *  - `@pyreon/zero` `fs-router.ts` / `api-routes.ts` re-export these — the
 *    LOAD-BEARING consumer (route enumeration for SSG/SSR/dev, api-route
 *    registration). The bodies here are byte-behavior-identical ports of
 *    zero's original functions (zero was the source of truth; its full
 *    fs-router test suite runs against these re-exports unchanged).
 *  - `@pyreon/compiler` `project-scanner.ts` (`generateContext`) — previously
 *    carried comment-synced COPIES that had already diverged at birth
 *    (`isApiRouteFile` accepted `/api/` at any depth; zero's `isApiRoute`
 *    requires the top-level `api/` prefix — a nested `posts/api/x.ts` was
 *    reported as an API route zero never serves).
 *
 * Identity parity tests in zero's suite (`fs-route-convention-parity.test.ts`)
 * assert the re-exports ARE these functions, so a local copy can never be
 * silently reintroduced on either side.
 *
 * This module is deliberately dependency-free (no `node:*`, no `typescript`)
 * and lives on its own subpath (`@pyreon/compiler/fs-route-convention`) so
 * zero's server/plugin code can import it without cold-loading the whole
 * compiler (the main barrel pulls the TypeScript compiler API).
 */

/** Route-file extensions, in zero's fs-router precedence order. */
export const ROUTE_EXTENSIONS: readonly string[] = ['.tsx', '.jsx', '.ts', '.js']

/**
 * Special (non-navigable) route-file names. They configure the route tree
 * (`_layout` wraps children; `_error` / `_loading` / `_404` / `_not-found`
 * are fallbacks) but are not themselves URL routes — `filePathToUrlPath`
 * skips these segments (so a bare `_layout` maps to `/`).
 */
export const SPECIAL_ROUTE_FILES: ReadonlySet<string> = new Set([
  '_layout',
  '_error',
  '_loading',
  '_404',
  '_not-found',
])

/** Strip the first matching route extension (`.tsx` > `.jsx` > `.ts` > `.js`). */
export function stripRouteExtension(filePath: string): string {
  for (const ext of ROUTE_EXTENSIONS) {
    if (filePath.endsWith(ext)) return filePath.slice(0, -ext.length)
  }
  return filePath
}

/**
 * Detect whether a route file is an API route.
 * API routes are `.ts` or `.js` files inside the TOP-LEVEL `api/` directory
 * of the routes dir (`filePath` is relative to the routes dir). A nested
 * `posts/api/x.ts` is NOT an API route — zero registers it as a page route.
 * `.tsx` / `.jsx` files under `api/` are page routes too (they still SSR).
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
  // Remove extension (api routes are `.ts`/`.js` only — see isApiRoute)
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
 * Convert a page-route file path (WITHOUT extension) to a URL path pattern.
 *
 * Examples:
 *   "index"            → "/"
 *   "about"            → "/about"
 *   "users/index"      → "/users"
 *   "users/[id]"       → "/users/:id"
 *   "blog/[...slug]"   → "/blog/:slug*"
 *   "(auth)/login"     → "/login"         (group stripped — URL-invisible)
 *   "_layout"          → "/"              (layout marker)
 */
export function filePathToUrlPath(filePath: string): string {
  const segments = filePath.split('/')
  const urlSegments: string[] = []

  for (const seg of segments) {
    // Skip route groups "(name)" — URL-invisible (but they REMAIN tree
    // boundaries in zero's fs-router: see parseFilePath's dirPath handling)
    if (seg.startsWith('(') && seg.endsWith(')')) continue

    // Skip special files (_layout / _error / _loading / _404 / _not-found)
    if (SPECIAL_ROUTE_FILES.has(seg)) continue

    // "index" maps to the parent path
    if (seg === 'index') continue

    // Catch-all: [...param] → :param*
    const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAll) {
      urlSegments.push(`:${catchAll[1]}*`)
      continue
    }

    // Dynamic: [param] → :param
    const dynamic = seg.match(/^\[(\w+)\]$/)
    if (dynamic) {
      urlSegments.push(`:${dynamic[1]}`)
      continue
    }

    urlSegments.push(seg)
  }

  // Empty segment list (root `index`, bare specials) already yields "/" —
  // the template literal is never falsy (zero's original carried a dead
  // `path || '/'` fallback; dropped here so V8 branch coverage stays real).
  return `/${urlSegments.join('/')}`
}
