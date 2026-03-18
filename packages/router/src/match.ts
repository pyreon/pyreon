import type { ResolvedRoute, RouteMeta, RouteRecord } from "./types"

// ─── Query string ─────────────────────────────────────────────────────────────

/**
 * Parse a query string into key-value pairs. Duplicate keys are overwritten
 * (last value wins). Use `parseQueryMulti` to preserve duplicates as arrays.
 */
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

/**
 * Parse a query string preserving duplicate keys as arrays.
 *
 * @example
 * parseQueryMulti("color=red&color=blue&size=lg")
 * // → { color: ["red", "blue"], size: "lg" }
 */
export function parseQueryMulti(qs: string): Record<string, string | string[]> {
  if (!qs) return {}
  const result: Record<string, string | string[]> = {}
  for (const part of qs.split("&")) {
    const eqIdx = part.indexOf("=")
    let key: string
    let val: string
    if (eqIdx < 0) {
      key = decodeURIComponent(part)
      val = ""
    } else {
      key = decodeURIComponent(part.slice(0, eqIdx))
      val = decodeURIComponent(part.slice(eqIdx + 1))
    }
    if (!key) continue
    const existing = result[key]
    if (existing === undefined) {
      result[key] = val
    } else if (Array.isArray(existing)) {
      existing.push(val)
    } else {
      result[key] = [existing, val]
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

// ─── Compiled route structures ───────────────────────────────────────────────

/**
 * Pre-compiled segment info — computed once per route, reused on every match.
 * Avoids repeated split()/filter()/startsWith(":") on hot paths.
 */
interface CompiledSegment {
  /** Original segment string */
  raw: string
  /** true if this segment is a `:param` */
  isParam: boolean
  /** true if this segment is a `:param*` splat */
  isSplat: boolean
  /** Param name (without leading `:` and trailing `*`) — empty for static segments */
  paramName: string
}

interface CompiledRoute {
  route: RouteRecord
  /** true for wildcard patterns: `(.*)` or `*` */
  isWildcard: boolean
  /** Pre-split and classified segments */
  segments: CompiledSegment[]
  /** Number of segments */
  segmentCount: number
  /** true if route has no dynamic segments (pure static) */
  isStatic: boolean
  /** For static routes: the normalized path (e.g. "/about") for Map lookup */
  staticPath: string | null
  /** Compiled children (lazily populated) */
  children: CompiledRoute[] | null
}

/** WeakMap cache: compile each RouteRecord[] once */
const _compiledCache = new WeakMap<RouteRecord[], CompiledRoute[]>()

function compileSegment(raw: string): CompiledSegment {
  if (raw.endsWith("*") && raw.startsWith(":")) {
    return { raw, isParam: true, isSplat: true, paramName: raw.slice(1, -1) }
  }
  if (raw.startsWith(":")) {
    return { raw, isParam: true, isSplat: false, paramName: raw.slice(1) }
  }
  return { raw, isParam: false, isSplat: false, paramName: "" }
}

function compileRoute(route: RouteRecord): CompiledRoute {
  const pattern = route.path
  const isWildcard = pattern === "(.*)" || pattern === "*"

  if (isWildcard) {
    return {
      route,
      isWildcard: true,
      segments: [],
      segmentCount: 0,
      isStatic: false,
      staticPath: null,
      children: null,
    }
  }

  const segments = pattern.split("/").filter(Boolean).map(compileSegment)
  const isStatic = segments.every((s) => !s.isParam)
  const staticPath = isStatic ? `/${segments.map((s) => s.raw).join("/")}` : null

  return {
    route,
    isWildcard: false,
    segments,
    segmentCount: segments.length,
    isStatic,
    staticPath,
    children: null,
  }
}

function compileRoutes(routes: RouteRecord[]): CompiledRoute[] {
  const cached = _compiledCache.get(routes)
  if (cached) return cached

  const compiled = routes.map((r) => {
    const c = compileRoute(r)
    if (r.children && r.children.length > 0) {
      c.children = compileRoutes(r.children)
    }
    return c
  })
  _compiledCache.set(routes, compiled)
  return compiled
}

// ─── Static route index ──────────────────────────────────────────────────────

/** WeakMap cache: build static index once per route array */
const _staticIndexCache = new WeakMap<RouteRecord[], Map<string, CompiledRoute>>()

function buildStaticIndex(
  routes: RouteRecord[],
  compiled: CompiledRoute[],
): Map<string, CompiledRoute> {
  const cached = _staticIndexCache.get(routes)
  if (cached) return cached

  const index = new Map<string, CompiledRoute>()
  for (const c of compiled) {
    if (c.isStatic && !c.route.children?.length && c.staticPath) {
      index.set(c.staticPath, c)
    }
  }
  _staticIndexCache.set(routes, index)
  return index
}

// ─── Fast path splitting ─────────────────────────────────────────────────────

/** Split path into segments without allocating a filtered array */
function splitPath(path: string): string[] {
  // Fast path for common cases
  if (path === "/") return []
  // Remove leading slash, split, no filter needed if path is clean
  const start = path.charCodeAt(0) === 47 /* / */ ? 1 : 0
  const end = path.length
  if (start >= end) return []

  const parts: string[] = []
  let segStart = start
  for (let i = start; i <= end; i++) {
    if (i === end || path.charCodeAt(i) === 47 /* / */) {
      if (i > segStart) {
        parts.push(path.substring(segStart, i))
      }
      segStart = i + 1
    }
  }
  return parts
}

/** Decode only if the segment contains a `%` character */
function decodeSafe(s: string): string {
  return s.indexOf("%") >= 0 ? decodeURIComponent(s) : s
}

// ─── Path matching (compiled) ────────────────────────────────────────────────

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

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i] as string
    const pt = pathParts[i] as string
    // Splat param — captures the rest of the path (e.g. ":path*")
    if (pp.endsWith("*") && pp.startsWith(":")) {
      const paramName = pp.slice(1, -1)
      params[paramName] = pathParts.slice(i).map(decodeURIComponent).join("/")
      return params
    }
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = decodeURIComponent(pt)
    } else if (pp !== pt) {
      return null
    }
  }

  if (patternParts.length !== pathParts.length) return null
  return params
}

// ─── Compiled matching (internal) ────────────────────────────────────────────

/** Collect remaining path segments as a decoded splat value */
function captureSplat(pathParts: string[], from: number, pathLen: number): string {
  const remaining: string[] = []
  for (let j = from; j < pathLen; j++) {
    const p = pathParts[j]
    if (p !== undefined) remaining.push(decodeSafe(p))
  }
  return remaining.join("/")
}

/** Walk compiled segments against path parts, populating params. */
function walkSegments(
  segments: CompiledSegment[],
  segmentCount: number,
  pathParts: string[],
  pathLen: number,
  params: Record<string, string>,
): boolean {
  for (let i = 0; i < segmentCount; i++) {
    const seg = segments[i]
    const pt = pathParts[i]
    if (!seg || pt === undefined) return false
    if (seg.isSplat) {
      params[seg.paramName] = captureSplat(pathParts, i, pathLen)
      return true
    }
    if (seg.isParam) {
      params[seg.paramName] = decodeSafe(pt)
    } else if (seg.raw !== pt) {
      return false
    }
  }
  return true
}

function matchCompiled(
  segments: CompiledSegment[],
  segmentCount: number,
  pathParts: string[],
  pathLen: number,
  params: Record<string, string>,
): boolean {
  if (segmentCount !== pathLen) {
    // Could still match if last segment is a splat
    const last = segmentCount > 0 ? segments[segmentCount - 1] : undefined
    if (!last?.isSplat || pathLen < segmentCount) return false
  }
  return walkSegments(segments, segmentCount, pathParts, pathLen, params)
}

function matchPrefixCompiled(
  segments: CompiledSegment[],
  segmentCount: number,
  pathParts: string[],
  pathLen: number,
  params: Record<string, string>,
): string | null {
  if (pathLen < segmentCount) return null

  for (let i = 0; i < segmentCount; i++) {
    const seg = segments[i]
    const pt = pathParts[i]
    if (!seg || pt === undefined) return null
    if (seg.isSplat) {
      params[seg.paramName] = captureSplat(pathParts, i, pathLen)
      return "/"
    }
    if (seg.isParam) {
      params[seg.paramName] = decodeSafe(pt)
    } else if (seg.raw !== pt) {
      return null
    }
  }

  // Build rest path from remaining segments
  if (segmentCount === pathLen) return "/"
  let rest = ""
  for (let i = segmentCount; i < pathLen; i++) {
    const p = pathParts[i]
    if (p !== undefined) {
      rest += "/"
      rest += p
    }
  }
  return rest
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

  // Compile routes (cached after first call)
  const compiled = compileRoutes(routes)
  const staticIndex = buildStaticIndex(routes, compiled)

  // Fast path: try static Map lookup first (O(1) for pure static routes)
  const staticMatch = staticIndex.get(cleanPath)
  if (staticMatch) {
    return {
      path: cleanPath,
      params: {},
      query,
      hash,
      matched: [staticMatch.route],
      meta: staticMatch.route.meta ? { ...staticMatch.route.meta } : {},
    }
  }

  // Full compiled matching
  const pathParts = splitPath(cleanPath)
  const match = matchRoutesCompiled(pathParts, pathParts.length, compiled, [], {})
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

function matchRoutesCompiled(
  pathParts: string[],
  pathLen: number,
  compiled: CompiledRoute[],
  parentMatched: RouteRecord[],
  parentParams: Record<string, string>,
): MatchResult | null {
  for (let i = 0; i < compiled.length; i++) {
    const c = compiled[i]
    if (!c) continue
    const result = matchSingleCompiled(pathParts, pathLen, c, parentMatched, parentParams)
    if (result) return result
  }
  return null
}

/** Merge parentParams into target (mutates target) */
function mergeParams(target: Record<string, string>, source: Record<string, string>): void {
  for (const k in source) {
    const v = source[k]
    if (v !== undefined) target[k] = v
  }
}

/** Match a leaf route (no children) */
function matchLeafCompiled(
  pathParts: string[],
  pathLen: number,
  c: CompiledRoute,
  parentMatched: RouteRecord[],
  parentParams: Record<string, string>,
): MatchResult | null {
  if (c.isWildcard) {
    return { params: { ...parentParams }, matched: [...parentMatched, c.route] }
  }

  const params: Record<string, string> = {}
  if (!matchCompiled(c.segments, c.segmentCount, pathParts, pathLen, params)) return null

  mergeParams(params, parentParams)
  return { params, matched: [...parentMatched, c.route] }
}

/** Match a route with children — prefix match then recurse */
function matchBranchCompiled(
  pathParts: string[],
  pathLen: number,
  c: CompiledRoute,
  parentMatched: RouteRecord[],
  parentParams: Record<string, string>,
): MatchResult | null {
  if (c.isWildcard) {
    const matched = [...parentMatched, c.route]
    // children is guaranteed non-null here (caller checks)
    const childMatch = matchRoutesCompiled(
      pathParts,
      pathLen,
      c.children as CompiledRoute[],
      matched,
      parentParams,
    )
    if (childMatch) return childMatch
    return { params: { ...parentParams }, matched }
  }

  const prefixParams: Record<string, string> = {}
  const rest = matchPrefixCompiled(c.segments, c.segmentCount, pathParts, pathLen, prefixParams)
  if (rest === null) return null

  const allParams: Record<string, string> = { ...parentParams, ...prefixParams }
  const matched = [...parentMatched, c.route]

  const restParts = rest === "/" ? [] : splitPath(rest)
  const childMatch = matchRoutesCompiled(
    restParts,
    restParts.length,
    c.children as CompiledRoute[],
    matched,
    allParams,
  )
  if (childMatch) return childMatch

  // Fallback: try exact match on parent
  const exactParams: Record<string, string> = {}
  if (matchCompiled(c.segments, c.segmentCount, pathParts, pathLen, exactParams)) {
    mergeParams(exactParams, parentParams)
    return { params: exactParams, matched }
  }

  return null
}

function matchSingleCompiled(
  pathParts: string[],
  pathLen: number,
  c: CompiledRoute,
  parentMatched: RouteRecord[],
  parentParams: Record<string, string>,
): MatchResult | null {
  if (!c.children || c.children.length === 0) {
    return matchLeafCompiled(pathParts, pathLen, c, parentMatched, parentParams)
  }
  return matchBranchCompiled(pathParts, pathLen, c, parentMatched, parentParams)
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
  return pattern.replace(/:([^/]+)\*?/g, (match, key) => {
    const val = params[key] ?? ""
    // Splat params contain slashes — don't encode them
    if (match.endsWith("*")) return val.split("/").map(encodeURIComponent).join("/")
    return encodeURIComponent(val)
  })
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
