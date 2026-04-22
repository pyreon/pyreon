import type { ResolvedRoute, RouteMeta, RouteRecord } from './types'

// ─── Query string ─────────────────────────────────────────────────────────────

/**
 * Parse a query string into key-value pairs. Duplicate keys are overwritten
 * (last value wins). Use `parseQueryMulti` to preserve duplicates as arrays.
 */
/** Decode a query component: `+` → space (per application/x-www-form-urlencoded), then URI-decode. */
function decodeQueryComponent(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '))
}

export function parseQuery(qs: string): Record<string, string> {
  if (!qs) return {}
  const result: Record<string, string> = {}
  for (const part of qs.split('&')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx < 0) {
      const key = decodeQueryComponent(part)
      if (key) result[key] = ''
    } else {
      const key = decodeQueryComponent(part.slice(0, eqIdx))
      const val = decodeQueryComponent(part.slice(eqIdx + 1))
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
  for (const part of qs.split('&')) {
    const eqIdx = part.indexOf('=')
    let key: string
    let val: string
    if (eqIdx < 0) {
      key = decodeQueryComponent(part)
      val = ''
    } else {
      key = decodeQueryComponent(part.slice(0, eqIdx))
      val = decodeQueryComponent(part.slice(eqIdx + 1))
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
  return parts.length ? `?${parts.join('&')}` : ''
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
  /** true if this segment is a `:param?` optional */
  isOptional: boolean
  /** Param name (without leading `:` and trailing `*`/`?`) — empty for static segments */
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
  /** First static segment (for dispatch index), null if first segment is dynamic or route is wildcard */
  firstSegment: string | null
}

/**
 * A flattened route entry — pre-joins parent+child segments at compile time
 * so nested routes can be matched in a single pass without recursion.
 */
interface FlattenedRoute {
  /** All segments from root to leaf, concatenated */
  segments: CompiledSegment[]
  segmentCount: number
  /** The full matched chain from root to leaf (e.g. [adminLayout, usersPage]) */
  matchedChain: RouteRecord[]
  /** true if all segments are static */
  isStatic: boolean
  /** For static flattened routes: the full joined path */
  staticPath: string | null
  /** Pre-merged meta from all routes in the chain */
  meta: RouteMeta
  /** First static segment for dispatch index */
  firstSegment: string | null
  /** true if any segment is a splat */
  hasSplat: boolean
  /** true if this is a wildcard catch-all route (`*` or `(.*)`) */
  isWildcard: boolean
  /** true if any segment is optional (`:param?`) */
  hasOptional: boolean
  /** Minimum number of segments that must be present (excluding trailing optionals) */
  minSegments: number
}

/** WeakMap cache: compile each RouteRecord[] once */
const _compiledCache = new WeakMap<RouteRecord[], CompiledRoute[]>()

function compileSegment(raw: string): CompiledSegment {
  if (raw.endsWith('*') && raw.startsWith(':')) {
    return { raw, isParam: true, isSplat: true, isOptional: false, paramName: raw.slice(1, -1) }
  }
  if (raw.endsWith('?') && raw.startsWith(':')) {
    return { raw, isParam: true, isSplat: false, isOptional: true, paramName: raw.slice(1, -1) }
  }
  if (raw.startsWith(':')) {
    return { raw, isParam: true, isSplat: false, isOptional: false, paramName: raw.slice(1) }
  }
  return { raw, isParam: false, isSplat: false, isOptional: false, paramName: '' }
}

function compileRoute(route: RouteRecord): CompiledRoute {
  const pattern = route.path
  const isWildcard = pattern === '(.*)' || pattern === '*'

  if (isWildcard) {
    return {
      route,
      isWildcard: true,
      segments: [],
      segmentCount: 0,
      isStatic: false,
      staticPath: null,
      children: null,
      firstSegment: null,
    }
  }

  const segments = pattern.split('/').filter(Boolean).map(compileSegment)
  const isStatic = segments.every((s) => !s.isParam)
  const staticPath = isStatic ? `/${segments.map((s) => s.raw).join('/')}` : null
  const first = segments.length > 0 ? segments[0] : undefined
  const firstSegment = first && !first.isParam ? first.raw : null

  return {
    route,
    isWildcard: false,
    segments,
    segmentCount: segments.length,
    isStatic,
    staticPath,
    children: null,
    firstSegment,
  }
}

/** Expand alias paths into additional compiled entries sharing the original RouteRecord */
function expandAliases(r: RouteRecord, c: CompiledRoute): CompiledRoute[] {
  if (!r.alias) return []
  const aliases = Array.isArray(r.alias) ? r.alias : [r.alias]
  return aliases.map((aliasPath) => {
    const { alias: _, ...withoutAlias } = r
    const ac = compileRoute({ ...withoutAlias, path: aliasPath })
    ac.children = c.children
    ac.route = r
    return ac
  })
}

function compileRoutes(routes: RouteRecord[]): CompiledRoute[] {
  const cached = _compiledCache.get(routes)
  if (cached) return cached

  const compiled: CompiledRoute[] = []
  for (const r of routes) {
    const c = compileRoute(r)
    if (r.children && r.children.length > 0) {
      c.children = compileRoutes(r.children)
    }
    compiled.push(c)
    compiled.push(...expandAliases(r, c))
  }
  _compiledCache.set(routes, compiled)
  return compiled
}

// ─── Route flattening ────────────────────────────────────────────────────────

/** Extract first static segment from a segment list, or null if dynamic/empty */
function getFirstSegment(segments: CompiledSegment[]): string | null {
  const first = segments[0]
  if (first && !first.isParam) return first.raw
  return null
}

/** Build a FlattenedRoute from segments + metadata */
function makeFlatEntry(
  segments: CompiledSegment[],
  chain: RouteRecord[],
  meta: RouteMeta,
  isWildcard: boolean,
): FlattenedRoute {
  const isStatic = !isWildcard && segments.every((s) => !s.isParam)
  const hasOptional = segments.some((s) => s.isOptional)
  // minSegments: count of segments up to and not including trailing optionals
  let minSegs = segments.length
  if (hasOptional) {
    while (minSegs > 0 && segments[minSegs - 1]?.isOptional) minSegs--
  }
  return {
    segments,
    segmentCount: segments.length,
    matchedChain: chain,
    isStatic,
    staticPath: isStatic ? `/${segments.map((s) => s.raw).join('/')}` : null,
    meta,
    firstSegment: getFirstSegment(segments),
    hasSplat: segments.some((s) => s.isSplat),
    isWildcard,
    hasOptional,
    minSegments: minSegs,
  }
}

/**
 * Flatten nested routes into leaf entries with pre-joined segments.
 * This eliminates recursion during matching for the common case.
 */
function flattenRoutes(compiled: CompiledRoute[]): FlattenedRoute[] {
  const result: FlattenedRoute[] = []
  flattenWalk(result, compiled, [], [], {})
  return result
}

function flattenWalk(
  result: FlattenedRoute[],
  routes: CompiledRoute[],
  parentSegments: CompiledSegment[],
  parentChain: RouteRecord[],
  parentMeta: RouteMeta,
): void {
  for (const c of routes) {
    const chain = [...parentChain, c.route]
    const meta = c.route.meta ? { ...parentMeta, ...c.route.meta } : { ...parentMeta }
    flattenOne(result, c, parentSegments, chain, meta)
  }
}

function flattenOne(
  result: FlattenedRoute[],
  c: CompiledRoute,
  parentSegments: CompiledSegment[],
  chain: RouteRecord[],
  meta: RouteMeta,
): void {
  if (c.isWildcard) {
    result.push(makeFlatEntry(parentSegments, chain, meta, true))
    if (c.children && c.children.length > 0) {
      flattenWalk(result, c.children, parentSegments, chain, meta)
    }
    return
  }

  const joined = [...parentSegments, ...c.segments]
  if (c.children && c.children.length > 0) {
    flattenWalk(result, c.children, joined, chain, meta)
  }
  result.push(makeFlatEntry(joined, chain, meta, false))
}

// ─── Combined index ─────────────────────────────────────────────────────────

interface RouteIndex {
  /** O(1) lookup for fully static paths (including nested) */
  staticMap: Map<string, FlattenedRoute>
  /** First-segment dispatch: maps first path segment → candidate routes */
  segmentMap: Map<string, FlattenedRoute[]>
  /** Routes whose first segment is dynamic (fallback) */
  dynamicFirst: FlattenedRoute[]
  /** Wildcard/catch-all routes */
  wildcards: FlattenedRoute[]
}

const _indexCache = new WeakMap<RouteRecord[], RouteIndex>()

/** Classify a single flattened route into the appropriate index bucket */
function indexFlatRoute(
  f: FlattenedRoute,
  staticMap: Map<string, FlattenedRoute>,
  segmentMap: Map<string, FlattenedRoute[]>,
  dynamicFirst: FlattenedRoute[],
  wildcards: FlattenedRoute[],
): void {
  // Static map: first static entry wins (preserves definition order)
  if (f.isStatic && f.staticPath && !staticMap.has(f.staticPath)) {
    staticMap.set(f.staticPath, f)
  }

  if (f.isWildcard) {
    wildcards.push(f)
    return
  }

  // Root route "/" has 0 segments — already in static map
  if (f.segmentCount === 0) return

  // First-segment dispatch
  if (f.firstSegment) {
    let bucket = segmentMap.get(f.firstSegment)
    if (!bucket) {
      bucket = []
      segmentMap.set(f.firstSegment, bucket)
    }
    bucket.push(f)
  } else {
    dynamicFirst.push(f)
  }
}

function buildRouteIndex(routes: RouteRecord[], compiled: CompiledRoute[]): RouteIndex {
  const cached = _indexCache.get(routes)
  if (cached) return cached

  const flattened = flattenRoutes(compiled)

  const staticMap = new Map<string, FlattenedRoute>()
  const segmentMap = new Map<string, FlattenedRoute[]>()
  const dynamicFirst: FlattenedRoute[] = []
  const wildcards: FlattenedRoute[] = []

  for (const f of flattened) {
    indexFlatRoute(f, staticMap, segmentMap, dynamicFirst, wildcards)
  }

  const index: RouteIndex = { staticMap, segmentMap, dynamicFirst, wildcards }
  _indexCache.set(routes, index)
  return index
}

// ─── Fast path splitting ─────────────────────────────────────────────────────

/** Split path into segments without allocating a filtered array */
function splitPath(path: string): string[] {
  // Fast path for common cases
  if (path === '/') return []
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
  return s.indexOf('%') >= 0 ? decodeURIComponent(s) : s
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
/** Match a single pattern segment against a path segment, extracting params. Returns false on mismatch. */
function matchPatternSegment(
  pp: string,
  pt: string | undefined,
  params: Record<string, string>,
  pathParts: string[],
  i: number,
): 'splat' | 'continue' | 'fail' {
  if (pp.endsWith('*') && pp.startsWith(':')) {
    params[pp.slice(1, -1)] = pathParts.slice(i).map(decodeURIComponent).join('/')
    return 'splat'
  }
  if (pp.endsWith('?') && pp.startsWith(':')) {
    if (pt !== undefined) params[pp.slice(1, -1)] = decodeURIComponent(pt)
    return 'continue'
  }
  if (pt === undefined) return 'fail'
  if (pp.startsWith(':')) {
    params[pp.slice(1)] = decodeURIComponent(pt)
    return 'continue'
  }
  return pp === pt ? 'continue' : 'fail'
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  if (pattern === '(.*)' || pattern === '*') return {}

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const result = matchPatternSegment(
      patternParts[i] as string,
      pathParts[i],
      params,
      pathParts,
      i,
    )
    if (result === 'splat') return params
    if (result === 'fail') return null
  }

  if (pathParts.length > patternParts.length) return null
  return params
}

// ─── Compiled matching helpers ────────────────────────────────────────────────

/** Collect remaining path segments as a decoded splat value */
function captureSplat(pathParts: string[], from: number, pathLen: number): string {
  const remaining: string[] = []
  for (let j = from; j < pathLen; j++) {
    const p = pathParts[j]
    if (p !== undefined) remaining.push(decodeSafe(p))
  }
  return remaining.join('/')
}

// ─── Flattened route matching ─────────────────────────────────────────────────

/** Check whether a flattened route's segment count is compatible with the path length */
function isSegmentCountCompatible(f: FlattenedRoute, pathLen: number): boolean {
  if (f.segmentCount === pathLen) return true
  if (f.hasSplat && pathLen >= f.segmentCount) return true
  if (f.hasOptional && pathLen >= f.minSegments && pathLen <= f.segmentCount) return true
  return false
}

/** Try to match a flattened route against path parts */
function matchFlattened(
  f: FlattenedRoute,
  pathParts: string[],
  pathLen: number,
): Record<string, string> | null {
  if (!isSegmentCountCompatible(f, pathLen)) return null

  const params: Record<string, string> = {}
  const segments = f.segments
  const count = f.segmentCount
  for (let i = 0; i < count; i++) {
    const seg = segments[i]
    const pt = pathParts[i]
    if (!seg) return null
    if (seg.isSplat) {
      params[seg.paramName] = captureSplat(pathParts, i, pathLen)
      return params
    }
    if (pt === undefined) {
      if (!seg.isOptional) return null
      continue
    }
    if (seg.isParam) {
      params[seg.paramName] = decodeSafe(pt)
    } else if (seg.raw !== pt) {
      return null
    }
  }
  return params
}

/** Search a list of flattened candidates for a match */
function searchCandidates(
  candidates: FlattenedRoute[],
  pathParts: string[],
  pathLen: number,
): MatchResult | null {
  for (let i = 0; i < candidates.length; i++) {
    const f = candidates[i]
    if (!f) continue
    const params = matchFlattened(f, pathParts, pathLen)
    if (params) {
      return { params, matched: f.matchedChain }
    }
  }
  return null
}

// ─── Route resolution ─────────────────────────────────────────────────────────

interface MatchResult {
  params: Record<string, string>
  matched: RouteRecord[]
}

/**
 * Resolve a raw path (including query string and hash) against the route tree.
 * Uses flattened index for O(1) static lookup and first-segment dispatch.
 */
export function resolveRoute(rawPath: string, routes: RouteRecord[]): ResolvedRoute {
  const qIdx = rawPath.indexOf('?')
  const pathAndHash = qIdx >= 0 ? rawPath.slice(0, qIdx) : rawPath
  const queryPart = qIdx >= 0 ? rawPath.slice(qIdx + 1) : ''

  const hIdx = pathAndHash.indexOf('#')
  const cleanPath = hIdx >= 0 ? pathAndHash.slice(0, hIdx) : pathAndHash
  const hash = hIdx >= 0 ? pathAndHash.slice(hIdx + 1) : ''

  const query = parseQuery(queryPart)

  // Build index (cached after first call)
  const compiled = compileRoutes(routes)
  const index = buildRouteIndex(routes, compiled)

  // Fast path 1: O(1) static Map lookup (covers nested static too)
  const staticMatch = index.staticMap.get(cleanPath)
  if (staticMatch) {
    return {
      path: cleanPath,
      params: {},
      query,
      hash,
      matched: staticMatch.matchedChain,
      meta: staticMatch.meta,
      search: runValidateSearch(staticMatch.matchedChain, query),
    }
  }

  // Split path for segment-based matching
  const pathParts = splitPath(cleanPath)
  const pathLen = pathParts.length

  // Fast path 2: first-segment dispatch (O(1) bucket lookup + small scan)
  if (pathLen > 0) {
    const first = pathParts[0] as string
    const bucket = index.segmentMap.get(first)
    if (bucket) {
      const match = searchCandidates(bucket, pathParts, pathLen)
      if (match) {
        return {
          path: cleanPath,
          params: match.params,
          query,
          hash,
          matched: match.matched,
          meta: mergeMeta(match.matched),
          search: runValidateSearch(match.matched, query),
        }
      }
    }
  }

  // Fallback: dynamic-first-segment routes
  const dynMatch = searchCandidates(index.dynamicFirst, pathParts, pathLen)
  if (dynMatch) {
    return {
      path: cleanPath,
      params: dynMatch.params,
      query,
      hash,
      matched: dynMatch.matched,
      meta: mergeMeta(dynMatch.matched),
      search: runValidateSearch(dynMatch.matched, query),
    }
  }

  // Fallback: wildcard/catch-all routes
  const w = index.wildcards[0]
  if (w) {
    return {
      path: cleanPath,
      params: {},
      query,
      hash,
      matched: w.matchedChain,
      meta: w.meta,
      search: runValidateSearch(w.matchedChain, query),
    }
  }

  return { path: cleanPath, params: {}, query, hash, matched: [], meta: {}, search: {} }
}

/** Run validateSearch from the deepest matched route that has one. */
function runValidateSearch(
  matched: RouteRecord[],
  query: Record<string, string>,
): Record<string, unknown> {
  // Walk from leaf to root — first validateSearch wins (most specific route)
  for (let i = matched.length - 1; i >= 0; i--) {
    const validate = matched[i]?.validateSearch
    if (validate) {
      try {
        return validate(query)
      } catch {
        // Validation failed — return raw query as-is
        return { ...query }
      }
    }
  }
  return {}
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
  const built = pattern.replace(/\/:([^/]+)\?/g, (_match, key) => {
    const val = params[key]
    // Optional param — omit the entire segment if no value provided
    if (!val) return ''
    return `/${encodeURIComponent(val)}`
  })
  return built.replace(/:([^/]+)\*?/g, (match, key) => {
    const val = params[key] ?? ''
    // Splat params contain slashes — don't encode them
    if (match.endsWith('*')) return val.split('/').map(encodeURIComponent).join('/')
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
