import type { ResolvedRoute, RouteRecord, RouteMeta } from "./types"

// ─── Query string ─────────────────────────────────────────────────────────────

export function parseQuery(qs: string): Record<string, string> {
  if (!qs) return {}
  const result: Record<string, string> = {}
  for (const part of qs.split("&")) {
    const eqIdx = part.indexOf("=")
    if (eqIdx < 0) {
      const key = decodeURIComponent(part)
      if (key) result[key] = ""
    } else {
      const key = decodeURIComponent(part.slice(0, eqIdx))
      const val = decodeURIComponent(part.slice(eqIdx + 1))
      if (key) result[key] = val
    }
  }
  return result
}

export function stringifyQuery(query: Record<string, string>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(query)) {
    parts.push(v ? `${encodeURIComponent(k)}=${encodeURIComponent(v)}` : encodeURIComponent(k))
  }
  return parts.length ? `?${parts.join("&")}` : ""
}

// ─── Path matching ────────────────────────────────────────────────────────────

/**
 * Match a single route pattern against a path segment.
 * Returns extracted params or null if no match.
 *
 * Supports:
 *   - Exact segments: "/about"
 *   - Param segments: "/user/:id"
 *   - Wildcard: "(.*)" matches everything
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  // Wildcard pattern
  if (pattern === "(.*)" || pattern === "*") return {}

  const patternParts = pattern.split("/").filter(Boolean)
  const pathParts = path.split("/").filter(Boolean)

  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i] ?? ""
    const pt = pathParts[i] ?? ""
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = decodeURIComponent(pt)
    } else if (pp !== pt) {
      return null
    }
  }
  return params
}

/**
 * Check if a path starts with a route's prefix (for nested route matching).
 * Returns the remaining path suffix, or null if no match.
 */
function matchPrefix(pattern: string, path: string): { params: Record<string, string>; rest: string } | null {
  if (pattern === "(.*)" || pattern === "*") return { params: {}, rest: path }

  const patternParts = pattern.split("/").filter(Boolean)
  const pathParts = path.split("/").filter(Boolean)

  if (pathParts.length < patternParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i] ?? ""
    const pt = pathParts[i] ?? ""
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = decodeURIComponent(pt)
    } else if (pp !== pt) {
      return null
    }
  }

  const rest = "/" + pathParts.slice(patternParts.length).join("/")
  return { params, rest }
}

// ─── Route resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a raw path (including query string and hash) against the route tree.
 * Handles nested routes recursively.
 */
export function resolveRoute(rawPath: string, routes: RouteRecord[]): ResolvedRoute {
  const qIdx = rawPath.indexOf("?")
  const pathAndHash = qIdx >= 0 ? rawPath.slice(0, qIdx) : rawPath
  const queryPart = qIdx >= 0 ? rawPath.slice(qIdx + 1) : ""

  const hIdx = pathAndHash.indexOf("#")
  const cleanPath = hIdx >= 0 ? pathAndHash.slice(0, hIdx) : pathAndHash
  const hash = hIdx >= 0 ? pathAndHash.slice(hIdx + 1) : ""

  const query = parseQuery(queryPart)

  const match = matchRoutes(cleanPath, routes, [])
  if (match) {
    return {
      path: cleanPath,
      params: match.params,
      query,
      hash,
      matched: match.matched,
      meta: mergeMeta(match.matched),
    }
  }

  return { path: cleanPath, params: {}, query, hash, matched: [], meta: {} }
}

interface MatchResult {
  params: Record<string, string>
  matched: RouteRecord[]
}

function matchRoutes(
  path: string,
  routes: RouteRecord[],
  parentMatched: RouteRecord[],
  parentParams: Record<string, string> = {},
): MatchResult | null {
  for (const route of routes) {
    if (route.children && route.children.length > 0) {
      // Try matching this route as a prefix
      const prefix = matchPrefix(route.path, path)
      if (prefix !== null) {
        const allParams = { ...parentParams, ...prefix.params }
        const matched = [...parentMatched, route]
        // Try to match children against the remaining path
        const childMatch = matchRoutes(prefix.rest || "/", route.children, matched, allParams)
        if (childMatch) return childMatch
        // No child matched — if this route has a component, it's the match itself
        const exactParams = matchPath(route.path, path)
        if (exactParams !== null) {
          return { params: { ...parentParams, ...exactParams }, matched }
        }
      }
    } else {
      const params = matchPath(route.path, path)
      if (params !== null) {
        return { params: { ...parentParams, ...params }, matched: [...parentMatched, route] }
      }
    }
  }
  return null
}

/** Merge meta from matched routes (leaf takes precedence) */
function mergeMeta(matched: RouteRecord[]): RouteMeta {
  const meta: RouteMeta = {}
  for (const record of matched) {
    if (record.meta) Object.assign(meta, record.meta)
  }
  return meta
}

/** Build a path string from a named route's pattern and params */
export function buildPath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:([^/]+)/g, (_, key) => encodeURIComponent(params[key] ?? ""))
}

/** Find a route record by name (recursive, O(n)). Prefer buildNameIndex for repeated lookups. */
export function findRouteByName(name: string, routes: RouteRecord[]): RouteRecord | null {
  for (const route of routes) {
    if (route.name === name) return route
    if (route.children) {
      const found = findRouteByName(name, route.children)
      if (found) return found
    }
  }
  return null
}

/**
 * Pre-build a name → RouteRecord index from a route tree for O(1) named navigation.
 * Called once at router creation time; avoids O(n) depth-first search per push({ name }).
 */
export function buildNameIndex(routes: RouteRecord[]): Map<string, RouteRecord> {
  const index = new Map<string, RouteRecord>()
  function walk(list: RouteRecord[]): void {
    for (const route of list) {
      if (route.name) index.set(route.name, route)
      if (route.children) walk(route.children)
    }
  }
  walk(routes)
  return index
}
