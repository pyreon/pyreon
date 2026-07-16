import type { ResolvedRoute, RouteComponent, RouteMeta, RouteRecord } from './types'

// ─── Default chrome layout registration ──────────────────────────────────────
//
// Late-bound registration for the synthetic layout used by the
// layout-less-app 404 fallback in `findNotFoundFallback` below. The
// component itself lives in `./components.tsx` (it needs JSX + the
// `RouterView` it imports), but `match.ts` is below `components.tsx` in
// the dependency graph (router.ts imports match.ts; components.tsx
// imports router.ts) — directly importing `components.tsx` from here
// would create a cycle. Instead, `components.tsx` calls
// `_setDefaultChromeLayout(DefaultChromeLayout)` at module load. As
// long as the consumer's app imports anything from `@pyreon/router`
// that touches `components.tsx` (which every app does via
// `RouterProvider` / `RouterView` / `RouterLink`), the registration
// runs before any `resolveRoute()` call.
//
// When the setter hasn't been called (e.g. unit tests that exercise
// `resolveRoute` in isolation without ever importing `components.tsx`),
// `findNotFoundFallback` returns `null` for the layout-less case — the
// standalone-render path in the SSG plugin / runtime handler picks up
// from there. So the fix degrades gracefully.
let _defaultChromeLayout: RouteComponent | null = null

/**
 * Register the synthetic "default chrome" layout used when a page-level
 * `notFoundComponent` is the closest fallback (layout-less single-page-
 * app shape). Called once at module load from `./components.tsx`. Pyreon
 * apps shouldn't need to call this themselves.
 *
 * @internal
 */
export function _setDefaultChromeLayout(component: RouteComponent): void {
  _defaultChromeLayout = component
}

// ─── Query string ─────────────────────────────────────────────────────────────

/**
 * Parse a query string into key-value pairs. Duplicate keys are overwritten
 * (last value wins). Use `parseQueryMulti` to preserve duplicates as arrays.
 */
/** Decode a query component: `+` → space (per application/x-www-form-urlencoded), then URI-decode. */
function decodeQueryComponent(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '))
}

/**
 * Fresh null-prototype record for parsed query params. Query KEYS are
 * user-controlled, so a plain `{}` would let `?__proto__=…` / `?constructor=…`
 * write to inherited slots — prototype/property injection (CodeQL
 * `js/remote-property-injection`). A null-prototype object has no prototype
 * chain, so every user key is a plain OWN data property. This is the standard
 * `qs` / `query-string` hardening — layer ONE of two (see
 * `DANGEROUS_QUERY_KEYS` for layer two, which the null prototype does NOT cover).
 */
function emptyQueryRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/**
 * Layer TWO of the query hardening: dangerous keys are DROPPED at the parse
 * boundary, never stored — even as own properties of the null-prototype
 * record. The null prototype protects the record ITSELF, but an own
 * `__proto__` key still escapes into CONSUMER objects: `Object.assign(target,
 * query)` (and any `target[k] = query[k]` copy loop) uses [[Set]] semantics,
 * so copying an own `__proto__` data property onto an ordinary object mutates
 * the TARGET's prototype — pollution one hop downstream, outside this
 * module's control. Dropping the qs-convention key set (`__proto__`,
 * `constructor`, `prototype`) closes that hop and the CodeQL finding at the
 * source; a genuine app query param by these names has no legitimate use.
 */
const DANGEROUS_QUERY_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
// NOTE on CodeQL `js/remote-property-injection`: that query recognizes only
// ALLOWLIST/constant-prefix sanitizers by design — a blocklist guard (this
// one) is never credited, so the two alerts on the write sites below are
// DISMISSED with rationale rather than "fixed". Arbitrary user-chosen keys
// are the PURPOSE of a query-param record; the real risks are covered by
// the two layers above (null-prototype record + dangerous keys dropped),
// both locked by bisect-verified specs in tests/match.test.ts.

export function parseQuery(qs: string): Record<string, string> {
  if (!qs) return emptyQueryRecord()
  const result = emptyQueryRecord<string>()
  for (const part of qs.split('&')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx < 0) {
      const key = decodeQueryComponent(part)
      if (key && !DANGEROUS_QUERY_KEYS.has(key)) result[key] = ''
    } else {
      const key = decodeQueryComponent(part.slice(0, eqIdx))
      const val = decodeQueryComponent(part.slice(eqIdx + 1))
      if (key && !DANGEROUS_QUERY_KEYS.has(key)) result[key] = val
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
  if (!qs) return emptyQueryRecord()
  const result = emptyQueryRecord<string | string[]>()
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
    if (!key || DANGEROUS_QUERY_KEYS.has(key)) continue
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
  /**
   * The chain's effective `validateSearch` fn, resolved leaf→root ONCE at
   * flatten time (most-specific wins — leaf→root, first hit). `null` when
   * no route in the chain defines one — the dominant
   * case — letting every resolve skip the leaf→root property walk that
   * previously ran per navigation. Same precompute strategy as `meta`
   * (pre-merged + frozen at flatten time for the same per-resolve saving).
   */
  validateFn: ((raw: Record<string, string>) => Record<string, unknown>) | null
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
  // Resolve the chain's validateSearch ONCE (leaf→root, most-specific
  // wins). Per-resolve, the hot paths then do a null check instead of
  // walking the chain.
  let validateFn: FlattenedRoute['validateFn'] = null
  for (let i = chain.length - 1; i >= 0; i--) {
    const v = chain[i]?.validateSearch
    if (v) {
      validateFn = v as FlattenedRoute['validateFn']
      break
    }
  }
  // `meta` is shared across every navigation that resolves through this
  // FlattenedRoute (dynamic routes like `/posts/[id]` see the SAME meta
  // object identity for /posts/42 and /posts/99 — that's the cache that
  // makes resolveRoute O(1)). Freezing it makes user mutation throw in
  // strict-mode modules instead of silently polluting the cache. Without
  // this, `(props as any).meta.scrollBehavior = 'top'` in a component
  // mutates the global cache permanently for every future navigation to
  // this route AND every sibling resolving through the same chain. The
  // framework itself never writes to `route.meta` — only reads — so the
  // freeze is purely a user-mutation safety net.
  return {
    segments,
    segmentCount: segments.length,
    matchedChain: chain,
    isStatic,
    staticPath: isStatic ? `/${segments.map((s) => s.raw).join('/')}` : null,
    meta: Object.freeze(meta) as RouteMeta,
    firstSegment: getFirstSegment(segments),
    hasSplat: segments.some((s) => s.isSplat),
    isWildcard,
    hasOptional,
    minSegments: minSegs,
    validateFn,
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

  // fs-router emits absolute paths for nested children (e.g. parent
  // `/app` with child `/app/dashboard`, NOT child `dashboard`). Concating
  // parent segments with the child's already-absolute segments would
  // produce `/app/app/dashboard` — the staticMap then lookups the wrong
  // key and resolveRoute returns `matched: []` for any such request.
  // Detect "child path is absolute" (`path` starts with `/`) and skip the
  // parent-segment prefix in that case — the child's own segments ARE
  // the full intended path. Relative children (`dashboard`, `:id`)
  // continue to inherit the parent's segments via concatenation.
  const childPath = c.route.path
  const isAbsoluteChild = typeof childPath === 'string' && childPath.startsWith('/')
  const joined = isAbsoluteChild ? c.segments : [...parentSegments, ...c.segments]
  if (c.children && c.children.length > 0) {
    flattenWalk(result, c.children, joined, chain, meta)
  }
  result.push(makeFlatEntry(joined, chain, meta, false))
}

// ─── Combined index ─────────────────────────────────────────────────────────

interface RouteIndex {
  /** O(1) lookup for fully static paths (including nested) */
  staticMap: Record<string, FlattenedRoute>
  /** First-segment dispatch: maps first path segment → candidate routes */
  segmentMap: Record<string, FlattenedRoute[]>
  /**
   * Second-level dispatch for the fast lane: per first-segment bucket,
   * fixed-segment-count candidates indexed by their count (`exact[n]`),
   * with splat/optional candidates in `flex` (their acceptable count is a
   * range, checked via `isSegmentCountCompatible`). A 4-segment URL in a
   * 5-candidate bucket walks ONLY `exact[4]` + `flex` — the count-mismatch
   * rejects the flat bucket scan paid per resolve disappear structurally.
   * Built once per index alongside `segmentMap` (which the general lane
   * still uses — its split-based path skips empty segments, so its
   * pathLen can differ from the fast lane's; sharing dispatch would be
   * wrong there).
   */
  segmentDispatch: Record<string, BucketDispatch | null>
  /** Routes whose first segment is dynamic (fallback) */
  dynamicFirst: FlattenedRoute[]
  /** Wildcard/catch-all routes */
  wildcards: FlattenedRoute[]
  /**
   * First-char fail-fast mask (see buildRouteIndex): `mask[c] === 1` ⇔ some
   * non-wildcard route's first segment starts with ASCII code `c`. `null`
   * when the mask can't be used (dynamic-first routes exist, or a route's
   * first char is non-ASCII).
   */
  firstCharMask: Uint8Array | null
  /**
   * PR-S9: pre-built trie of `notFoundComponent`-bearing records keyed by
   * their full URL path. `findNotFoundFallback` walks the trie by URL
   * segment instead of scanning every route on every 404 (O(URL segments)
   * vs O(routes-in-tree)). Mirrors the existing `staticMap` / `_indexCache`
   * caching strategy — built once per `RouteRecord[]` identity, cached
   * via WeakMap.
   */
  notFoundTrie: NotFoundTrieNode
}

// ─── PR-S9: notFoundComponent trie ──────────────────────────────────────────
//
// Pre-fix `findNotFoundFallback` walked the entire route tree on every 404,
// re-doing path-prefix checks and chain accumulation for every record. With
// N notFoundComponent-bearing records, lookup was O(N) and constant-factor
// heavy (string ops per record). Real apps with deeply-nested i18n × dynamic
// route trees can have dozens of such records.
//
// The trie indexes records by URL-path segments at build time. A URL like
// `/de/posts/unknown` walks the trie in 3 steps: root → "de" → "posts" →
// no further match → return deepest-seen layout-or-page entry. Each step is
// O(1) (Map lookup + tracking the deepest entry seen). Total: O(URL
// segments), independent of route-tree size.
//
// Two parallel tracks per node:
// - `layout`: the deepest layout-record (record with children) carrying a
//   notFoundComponent that applies at this prefix.
// - `page`: the deepest page-record (record without children) carrying a
//   notFoundComponent — used only for the layout-less synthetic-chrome
//   fallback (see findNotFoundFallback's pageBest path).
//
// Specificity tiebreaker (used in `findNotFoundFallback` for ties at the
// same depth) is preserved by tracking both `chain.length` (depth) and
// `segmentCount` (specificity).
interface NotFoundEntry {
  record: RouteRecord
  chain: RouteRecord[]
  fullPath: string
  depth: number
  specificity: number
}
interface NotFoundTrieNode {
  layout: NotFoundEntry | null
  page: NotFoundEntry | null
  children: Map<string, NotFoundTrieNode>
}

function makeTrieNode(): NotFoundTrieNode {
  return { layout: null, page: null, children: new Map() }
}

function insertNotFoundEntry(root: NotFoundTrieNode, entry: NotFoundEntry, isLayout: boolean): void {
  const segments = pathSegments(entry.fullPath)
  let node = root
  for (const seg of segments) {
    let next = node.children.get(seg)
    if (!next) {
      next = makeTrieNode()
      node.children.set(seg, next)
    }
    node = next
  }
  // Tiebreaker: deeper chain wins; on tie, more specific path wins.
  if (isLayout) {
    const existing = node.layout
    if (
      !existing ||
      entry.depth > existing.depth ||
      (entry.depth === existing.depth && entry.specificity > existing.specificity)
    ) {
      node.layout = entry
    }
  } else {
    const existing = node.page
    if (
      !existing ||
      entry.depth > existing.depth ||
      (entry.depth === existing.depth && entry.specificity > existing.specificity)
    ) {
      node.page = entry
    }
  }
}

function pathSegments(fullPath: string): string[] {
  if (fullPath === '' || fullPath === '/') return []
  return fullPath.split('/').filter((s) => s.length > 0)
}

function buildNotFoundTrie(routes: RouteRecord[]): NotFoundTrieNode {
  const root = makeTrieNode()
  function walk(records: RouteRecord[], parentChain: RouteRecord[], parentPath: string): void {
    for (const r of records) {
      const rawPath = typeof r.path === 'string' ? r.path : ''
      const fullPath = rawPath.startsWith('/')
        ? rawPath
        : `${parentPath}/${rawPath}`.replace(/\/+/g, '/')
      const chain = [...parentChain, r]
      if (typeof r.notFoundComponent === 'function') {
        const isLayout = Array.isArray(r.children) && r.children.length > 0
        const entry: NotFoundEntry = {
          record: r,
          chain,
          fullPath,
          depth: chain.length,
          specificity: countSegments(fullPath),
        }
        insertNotFoundEntry(root, entry, isLayout)
      }
      if (Array.isArray(r.children)) walk(r.children, chain, fullPath)
    }
  }
  walk(routes, [], '')
  return root
}

/**
 * Walk the trie by URL segments. At each step, track the deepest layout
 * entry seen — that's our best layout fallback. Stop when the URL path
 * runs out OR no further child exists. The returned entry is the deepest
 * layout that applies at any prefix of `urlPath`.
 *
 * The trie naturally encodes the path-prefix semantics: an entry at path
 * `/de` lives at depth 1 in the trie, so URL `/de/unknown` traverses
 * root → "de" → "unknown" (no match), passing through the `/de` layout
 * entry at the `de` node. Root entries live at the trie root, applying
 * to every URL. `/encyclopedia` traverses root → "encyclopedia" (no
 * match), seeing only the root entry — no false `/de` match.
 */
function findInTrie(
  trie: NotFoundTrieNode,
  urlPath: string,
): { layout: NotFoundEntry | null; page: NotFoundEntry | null } {
  let bestLayout: NotFoundEntry | null = trie.layout
  let bestPage: NotFoundEntry | null = trie.page
  let node = trie
  const segments = pathSegments(urlPath)
  for (const seg of segments) {
    const next = node.children.get(seg)
    if (!next) break
    node = next
    if (node.layout) {
      if (
        !bestLayout ||
        node.layout.depth > bestLayout.depth ||
        (node.layout.depth === bestLayout.depth && node.layout.specificity > bestLayout.specificity)
      ) {
        bestLayout = node.layout
      }
    }
    if (node.page) {
      if (
        !bestPage ||
        node.page.depth > bestPage.depth ||
        (node.page.depth === bestPage.depth && node.page.specificity > bestPage.specificity)
      ) {
        bestPage = node.page
      }
    }
  }
  return { layout: bestLayout, page: bestPage }
}

const _indexCache = new WeakMap<RouteRecord[], RouteIndex>()

/**
 * Per-bucket second-level dispatch: candidates indexed by exact segment
 * count. ONLY built for buckets where every candidate has a fixed count
 * (no splat, no optional) — there a URL of length n can only ever match
 * `exact[n]`, so count-mismatch rejects disappear structurally AND
 * definition order is trivially preserved (only one count can match).
 * Buckets containing splat/optional candidates return `null` and keep the
 * ordered flat scan: first-match-wins across MIXED candidates (a splat
 * defined before a same-count param route must keep winning) cannot be
 * expressed in a count-indexed structure without re-merging order.
 */
interface BucketDispatch {
  /** exact[n] = candidates whose segmentCount === n, in definition order */
  exact: Array<FlattenedRoute[] | undefined>
}

function buildBucketDispatch(bucket: FlattenedRoute[]): BucketDispatch | null {
  const exact: Array<FlattenedRoute[] | undefined> = []
  for (const f of bucket) {
    if (f.hasSplat || f.hasOptional) return null
    ;(exact[f.segmentCount] ??= []).push(f)
  }
  return { exact }
}

/** Classify a single flattened route into the appropriate index bucket */
function indexFlatRoute(
  f: FlattenedRoute,
  staticMap: Record<string, FlattenedRoute>,
  segmentMap: Record<string, FlattenedRoute[]>,
  dynamicFirst: FlattenedRoute[],
  wildcards: FlattenedRoute[],
): void {
  // Static map: first static entry wins (preserves definition order)
  if (f.isStatic && f.staticPath && staticMap[f.staticPath] === undefined) {
    staticMap[f.staticPath] = f
  }

  if (f.isWildcard) {
    wildcards.push(f)
    return
  }

  // Root route "/" has 0 segments — already in static map
  if (f.segmentCount === 0) return

  // First-segment dispatch
  if (f.firstSegment) {
    let bucket = segmentMap[f.firstSegment]
    if (!bucket) {
      bucket = []
      segmentMap[f.firstSegment] = bucket
    }
    bucket.push(f)
  } else {
    dynamicFirst.push(f)
  }
}

function buildRouteIndex(routes: RouteRecord[]): RouteIndex {
  // Single WeakMap probe on the hot path — `compileRoutes` (its own
  // WeakMap) is only consulted on a cache MISS, so a warm resolve pays
  // ONE WeakMap.get instead of the two the previous shape did
  // (compileRoutes + buildRouteIndex were each probed per resolve).
  const cached = _indexCache.get(routes)
  if (cached) return cached

  const compiled = compileRoutes(routes)
  const flattened = flattenRoutes(compiled)

  // Null-prototype dictionary objects, NOT `Map` — measured ~3× faster on
  // the hit path (4.1ns vs 11.2ns per lookup in Bun/JSC; V8 comparable),
  // which is ~30% of the entire static-resolve cost. Null prototype makes
  // hostile keys (`__proto__`, `constructor`) plain own properties — the
  // same hardening radix3 relies on for its staticRoutesMap.
  const staticMap: Record<string, FlattenedRoute> = Object.create(null)
  const segmentMap: Record<string, FlattenedRoute[]> = Object.create(null)
  const dynamicFirst: FlattenedRoute[] = []
  const wildcards: FlattenedRoute[] = []

  for (const f of flattened) {
    indexFlatRoute(f, staticMap, segmentMap, dynamicFirst, wildcards)
  }

  // PR-S9: build the notFoundComponent trie at the same step. Walking
  // the route tree once for both the segmentMap AND the notFoundTrie is
  // cheaper than two separate walks; the trie is empty (root with no
  // children + no entries) when no record carries `notFoundComponent`.
  const notFoundTrie = buildNotFoundTrie(routes)

  const segmentDispatch: Record<string, BucketDispatch | null> = Object.create(null)
  for (const key in segmentMap) {
    const bucket = segmentMap[key]
    if (bucket) segmentDispatch[key] = buildBucketDispatch(bucket)
  }

  // First-char fail-fast mask: `mask[c] === 1` ⇔ SOME non-wildcard route's
  // first URL segment starts with ASCII char code `c`. After a staticMap
  // miss, a path whose first char isn't in the mask can only match a
  // wildcard — resolveRoute jumps straight there, skipping the plain-shape
  // scan + dispatch + general matcher (the radix-tree-style first-char
  // fail find-my-way gets for free; a 12-char miss was paying ~4ns/char
  // here). Statics are IN the mask: `/about/` (trailing slash) misses the
  // staticMap but must still reach the general matcher. Disabled entirely
  // (`null`) when any first char is non-ASCII (≥128 — a unicode segment
  // must never be mask-rejected) or when any route's first segment is
  // dynamic (a param matches ANY segment). '%'-first paths are handled at
  // the check site (encoded first char could decode to anything).
  let firstCharMask: Uint8Array | null = dynamicFirst.length === 0 ? new Uint8Array(128) : null
  if (firstCharMask) {
    for (const key in segmentMap) {
      const c = key.charCodeAt(0)
      if (!(c < 128)) {
        firstCharMask = null
        break
      }
      firstCharMask[c] = 1
    }
  }
  if (firstCharMask) {
    for (const key in staticMap) {
      // key is the full path (`/about/team`); first-segment char is key[1].
      // A bare-root `'/'` static has no char 1 — nothing to mark (a miss
      // can never be the root path: root always hits the staticMap).
      if (key.length < 2) continue
      const c = key.charCodeAt(1)
      if (!(c < 128)) {
        firstCharMask = null
        break
      }
      firstCharMask[c] = 1
    }
  }

  const index: RouteIndex = {
    staticMap,
    segmentMap,
    segmentDispatch,
    dynamicFirst,
    wildcards,
    notFoundTrie,
    firstCharMask,
  }
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

// ─── Offset-walking fast matcher ─────────────────────────────────────────────
//
// The general matcher (`splitPath` + `matchFlattened`) materializes EVERY
// path segment as a substring plus a parts array per resolve — for a
// 2-segment dynamic URL that's 3 allocations before matching even starts,
// and static pattern segments are compared via slice-then-===. The offset
// walker below compares static segments IN PLACE (`String.startsWith` at
// an offset, no slice) and only materializes the segments that become
// param values. Dynamic resolves drop from ~5 allocations to ~2.
//
// It only runs for "plain" paths — no `%` escapes (params would need
// decoding), no `//` empty segments, no trailing slash (both change
// segment-boundary semantics). `scanCleanPath` detects those shapes in
// the same single pass that counts segments; anything unusual returns -1
// and resolveRoute falls back to the general matcher, so behavior for
// every edge shape is byte-identical to the pre-optimization code by
// construction.

/**
 * First internal `/` offset (>= 1) from the most recent SUCCESSFUL
 * `scanCleanPath` call, or -1 for a single-segment path (no internal slash).
 * The fast lane reads this to slice the first segment for its dispatch-map key
 * WITHOUT a second `indexOf('/', 1)` pass — `scanCleanPath` already visited
 * that boundary while counting segments. Single-threaded synchronous read
 * immediately after the scan (same module-local memo pattern as
 * `_lastRoutes`/`_lastIndex`); only read when `scanCleanPath` returned >= 0,
 * so an early `-1` return never leaves an observable stale value.
 */
let _scanFirstSlash = -1

/**
 * Single-pass scan of a clean path (no query/hash): returns the segment
 * count when the path is "plain" (no `%`, no `//`, no trailing slash), or
 * -1 when the general split-based matcher must be used instead. On success it
 * also records the first internal `/` offset in `_scanFirstSlash` (see above).
 */
function scanCleanPath(path: string): number {
  const len = path.length
  let count = 0
  let prevSlash = true
  let firstSlash = -1
  for (let i = path.charCodeAt(0) === 47 /* / */ ? 1 : 0; i < len; i++) {
    const c = path.charCodeAt(i)
    if (c === 47 /* / */) {
      if (prevSlash) return -1 // `//` — empty segment
      if (firstSlash < 0) firstSlash = i // first internal boundary (for the fast-lane key)
      prevSlash = true
    } else {
      if (c === 37 /* % */) return -1 // encoded char — needs decode path
      if (prevSlash) {
        count++
        prevSlash = false
      }
    }
  }
  if (prevSlash && len > 1) return -1 // trailing slash
  _scanFirstSlash = firstSlash
  return count
}

/**
 * Offset-walking equivalent of `matchFlattened` for plain paths (as
 * certified by `scanCleanPath`). Static segments compare in place; param
 * segments slice exactly once (no decode needed — the scan guaranteed no
 * `%`); splats slice the remainder in one operation (joining decoded
 * segments is unnecessary for the same reason).
 *
 * `firstSlash`: when >= 0, the caller has already PROVEN segment 0 is a static
 * match (it reached this route through `segmentDispatch`/`segmentMap`, which
 * are keyed by the route's static `firstSegment` === the path's first segment),
 * and `firstSlash` is the offset of the first internal `/`. We then skip
 * segment 0 entirely and resume matching at segment 1 (offset `firstSlash + 1`)
 * — eliding one `indexOf('/')` + one `startsWith` per matched dynamic route,
 * the exact re-comparison the dispatch key already performed. Pass -1 (the
 * `dynamicFirst`/param-first path, whose segment 0 is NOT pre-validated) to
 * match from segment 0 as before.
 */
function matchFlattenedFast(
  f: FlattenedRoute,
  path: string,
  pathLen: number,
  firstSlash: number,
): Record<string, string> | null {
  if (!isSegmentCountCompatible(f, pathLen)) return null

  let params: Record<string, string> | null = null
  const segments = f.segments
  const count = f.segmentCount
  const len = path.length
  // firstSlash >= 0 ⇒ segment 0 already matched via the dispatch key; resume at
  // segment 1 just past the first internal '/'. Else start at the leading '/'.
  let i = firstSlash >= 0 ? 1 : 0
  let offset = firstSlash >= 0 ? firstSlash + 1 : 1
  for (; i < count; i++) {
    const seg = segments[i]
    if (!seg) return null
    if (seg.isSplat) {
      if (params === null) params = {}
      params[seg.paramName] = path.slice(offset)
      return params
    }
    if (offset >= len) {
      // Path exhausted — only trailing optionals may remain
      if (!seg.isOptional) return null
      continue
    }
    let end = path.indexOf('/', offset)
    if (end === -1) end = len
    if (seg.isParam) {
      if (params === null) params = {}
      params[seg.paramName] = path.slice(offset, end)
    } else {
      if (end - offset !== seg.raw.length || !path.startsWith(seg.raw, offset)) return null
    }
    offset = end + 1
  }
  return params ?? {}
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

/** Collect remaining path segments as a decoded splat value.
 *
 * Builds the joined string directly via concatenation — avoids the
 * intermediate `string[]` allocation + `.push` per segment + `.join('/')`
 * round-trip the previous shape required. Decoding stays per-segment but
 * inlined here (cheap `indexOf('%')` check + return raw when no `%`),
 * skipping the `decodeSafe` function-call overhead. No signature change,
 * no JIT-shape impact on the static / dynamic fast paths.
 *
 * Microbench against the bench's `/files/docs/2024/report.pdf` shape
 * (4-segment splat, no `%`): ~32% throughput improvement (4.3M → 5.6M
 * ops/s @ 50-route table). Slow path with `%`-encoded segments
 * preserved by the inline `indexOf` check. */
function captureSplat(pathParts: string[], from: number, pathLen: number): string {
  let result = ''
  for (let j = from; j < pathLen; j++) {
    const p = pathParts[j]
    if (p === undefined) continue
    const decoded = p.indexOf('%') >= 0 ? decodeURIComponent(p) : p
    result = result === '' ? decoded : `${result}/${decoded}`
  }
  return result
}

// ─── Flattened route matching ─────────────────────────────────────────────────

/** Check whether a flattened route's segment count is compatible with the path length */
function isSegmentCountCompatible(f: FlattenedRoute, pathLen: number): boolean {
  if (f.segmentCount === pathLen) return true
  if (f.hasSplat && pathLen >= f.segmentCount) return true
  if (f.hasOptional && pathLen >= f.minSegments && pathLen <= f.segmentCount) return true
  return false
}

/** Try to match a flattened route against path parts.
 *
 * `params` is lazy-initialized — the previous shape allocated `{}` BEFORE
 * the segment loop, wasted on every candidate that ultimately fails on a
 * static-segment mismatch (the common case in multi-candidate buckets
 * like `/admin` where several routes share the same first segment but
 * differ on the second). Starting as `null` and materializing on the
 * first param write saves one allocation per fail-on-mismatch candidate.
 * Returns a fresh `{}` (not a shared sentinel) when no params were
 * captured — consumers may mutate the returned object via `useParams()`
 * patterns. Same return shape as before; no signature change. */
function matchFlattened(
  f: FlattenedRoute,
  pathParts: string[],
  pathLen: number,
): Record<string, string> | null {
  if (!isSegmentCountCompatible(f, pathLen)) return null

  let params: Record<string, string> | null = null
  const segments = f.segments
  const count = f.segmentCount
  for (let i = 0; i < count; i++) {
    const seg = segments[i]
    const pt = pathParts[i]
    if (!seg) return null
    if (seg.isSplat) {
      if (params === null) params = {}
      params[seg.paramName] = captureSplat(pathParts, i, pathLen)
      return params
    }
    if (pt === undefined) {
      if (!seg.isOptional) return null
      continue
    }
    if (seg.isParam) {
      if (params === null) params = {}
      params[seg.paramName] = decodeSafe(pt)
    } else if (seg.raw !== pt) {
      return null
    }
  }
  return params ?? {}
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
      // Carry the pre-merged `f.meta` (computed ONCE at flatten time, byte-for-
      // byte equal to `mergeMeta(f.matchedChain)`) so the dynamic-route paths in
      // resolveRoute reuse it instead of re-running `mergeMeta` (a fresh alloc +
      // a per-record Object.assign loop) on every navigation — matching what the
      // static/wildcard fast paths already do.
      return { params, matched: f.matchedChain, meta: f.meta, validateFn: f.validateFn }
    }
  }
  return null
}

// ─── Route resolution ─────────────────────────────────────────────────────────

interface MatchResult {
  params: Record<string, string>
  matched: RouteRecord[]
  /** Pre-merged route meta from the matched FlattenedRoute (cached, not re-merged) */
  meta: RouteMeta
  /** Pre-resolved validateSearch fn from the matched FlattenedRoute (null = none in chain) */
  validateFn: FlattenedRoute['validateFn']
}

/**
 * Apply a pre-resolved validateSearch fn to the parsed query. Same
 * semantics the per-resolve chain walk had (validator throw → raw query
 * copy; no validator → fresh empty object) but the fn was resolved once
 * at flatten time (`FlattenedRoute.validateFn`) — no walk per navigation.
 */
function applyValidateFn(
  validateFn: FlattenedRoute['validateFn'],
  query: Record<string, string>,
): Record<string, unknown> {
  if (!validateFn) return {}
  try {
    return validateFn(query)
  } catch {
    return { ...query }
  }
}

// Shared frozen empties for the no-params / no-query / no-search cases —
// the dominant shapes. Freezing follows the `meta` precedent (frozen at
// flatten time): user mutation throws in strict mode instead of silently
// polluting a shared object, and the resolver skips three allocations per
// navigation. Non-empty params/query/search are still fresh per resolve.
const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null))
const EMPTY_QUERY: Record<string, string> = Object.freeze(Object.create(null))
const EMPTY_SEARCH: Record<string, unknown> = Object.freeze(Object.create(null))

// Identity memo for the dominant single-router case: every navigation
// passes the SAME RouteRecord[] reference, so an identity check replaces
// the WeakMap probe (~0.5ns vs ~4ns). Multi-router apps alternate refs and
// fall back to the WeakMap-cached index — never rebuilt, never wrong.
let _lastRoutes: RouteRecord[] | null = null
let _lastIndex: RouteIndex | null = null

/**
 * Resolve a raw path (including query string and hash) against the route tree.
 * Uses flattened index for O(1) static lookup and first-segment dispatch.
 */
export function resolveRoute(rawPath: string, routes: RouteRecord[]): ResolvedRoute {
  // Split the FRAGMENT first, then the query within the pre-hash part —
  // WHATWG URL order (`/path?query#hash`): everything after `#` is the
  // fragment, the query sits between `?` and `#`. The previous shape split
  // `?` first, so `/user/42?tab=posts#bio` leaked the hash into the query
  // (`{ tab: 'posts#bio' }`) and a `?` INSIDE a fragment was misread as a
  // query separator.
  const hIdx = rawPath.indexOf('#')
  const beforeHash = hIdx >= 0 ? rawPath.slice(0, hIdx) : rawPath
  const hash = hIdx >= 0 ? rawPath.slice(hIdx + 1) : ''

  const qIdx = beforeHash.indexOf('?')
  const cleanPath = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash
  const queryPart = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : ''

  // Inline empty-query fast path — the dominant case (no query string)
  // skips the parseQuery call entirely; non-empty queries take the full
  // parser. Fresh `{}` per resolve is preserved (callers may mutate).
  const query = queryPart ? parseQuery(queryPart) : EMPTY_QUERY

  // Build index (identity memo for the single-router case; WeakMap-cached
  // build behind it)
  let index: RouteIndex
  if (routes === _lastRoutes && _lastIndex) {
    index = _lastIndex
  } else {
    index = buildRouteIndex(routes)
    _lastRoutes = routes
    _lastIndex = index
  }

  // Fast path 1: O(1) static Map lookup (covers nested static too)
  const staticMatch = index.staticMap[cleanPath]
  if (staticMatch) {
    return {
      path: cleanPath,
      params: EMPTY_PARAMS,
      query,
      hash,
      matched: staticMatch.matchedChain,
      meta: staticMatch.meta,
      search: staticMatch.validateFn ? applyValidateFn(staticMatch.validateFn, query) : EMPTY_SEARCH,
    }
  }

  // First-char fail-fast (see RouteIndex.firstCharMask): after the static
  // miss, a path whose first-segment char no non-wildcard route starts with
  // can only match a wildcard — return it directly, skipping the plain-shape
  // scan, dispatch, and general matcher (the first-char fail a radix tree
  // gets for free; a 12-char miss paid ~4ns/char here). Excluded chars fall
  // through to the full pipeline: `%` (an encoded first char decodes to
  // anything) and `/` (a leading `//` collapses in the general lane's
  // splitPath, so `//foo` can still match `/foo`). `charCodeAt(1)` is NaN
  // for the bare root `'/'` and for `''` — both fail `cc < 128` and jump:
  // correct, since a root route would have hit the staticMap above, and the
  // general lane resolves both to the same wildcard/not-found tail.
  const mask = index.firstCharMask
  if (mask) {
    const cc = cleanPath.charCodeAt(1)
    if (cc !== 37 && cc !== 47 && !(cc < 128 && mask[cc] === 1)) {
      const w = index.wildcards[0]
      if (w) {
        return {
          path: cleanPath,
          params: EMPTY_PARAMS,
          query,
          hash,
          matched: w.matchedChain,
          meta: w.meta,
          search: w.validateFn ? applyValidateFn(w.validateFn, query) : EMPTY_SEARCH,
        }
      }
      // Same not-found tail as the full pipeline (notFoundComponent walk →
      // bare empty match) — the mask only skips MATCHING work, never
      // changes what a non-match resolves to.
      const nfb = findNotFoundFallback(routes, cleanPath, index.notFoundTrie)
      if (nfb) {
        return {
          path: cleanPath,
          params: {},
          query,
          hash,
          matched: nfb,
          meta: mergeMeta(nfb),
          search: {},
          isNotFound: true,
        }
      }
      return { path: cleanPath, params: {}, query, hash, matched: [], meta: {}, search: {} }
    }
  }

  // Split path for segment-based matching
  // Fast lane: plain paths (no `%`, no `//`, no trailing slash — the
  // overwhelmingly common shape) match via the offset walker: static
  // pattern segments compare in place, only param values are sliced, no
  // parts array is allocated. `scanCleanPath` certifies the shape in a
  // single pass and returns -1 for anything that needs the general
  // split-based matcher, which is preserved below byte-for-byte.
  const fastLen = scanCleanPath(cleanPath)
  if (fastLen >= 0) {
    if (fastLen > 0) {
      // `_scanFirstSlash` was just set by `scanCleanPath` — reuse it to slice
      // the first segment instead of re-scanning with `indexOf('/', 1)`.
      const first =
        _scanFirstSlash < 0 ? cleanPath.slice(1) : cleanPath.slice(1, _scanFirstSlash)
      const dispatch = index.segmentDispatch[first]
      if (dispatch !== undefined) {
        // Candidates: count-indexed when the bucket is all-fixed (null =
        // bucket has splat/optional candidates → ordered flat scan).
        const candidates = dispatch !== null ? dispatch.exact[fastLen] : index.segmentMap[first]
        if (candidates) {
          for (let i = 0; i < candidates.length; i++) {
            const f = candidates[i]
            if (!f) continue
            // Every candidate in this bucket is keyed by `first` (its static
            // `firstSegment`), so segment 0 is a guaranteed match — skip it via
            // `_scanFirstSlash`.
            const params = matchFlattenedFast(f, cleanPath, fastLen, _scanFirstSlash)
            if (params) {
              return {
                path: cleanPath,
                params,
                query,
                hash,
                matched: f.matchedChain,
                meta: f.meta,
                search: f.validateFn ? applyValidateFn(f.validateFn, query) : EMPTY_SEARCH,
              }
            }
          }
        }
      }
    }
    const dyn = index.dynamicFirst
    for (let i = 0; i < dyn.length; i++) {
      const f = dyn[i]
      if (!f) continue
      // Param-first routes: segment 0 is NOT pre-validated — match from the top.
      const params = matchFlattenedFast(f, cleanPath, fastLen, -1)
      if (params) {
        return {
          path: cleanPath,
          params,
          query,
          hash,
          matched: f.matchedChain,
          meta: f.meta,
          search: f.validateFn ? applyValidateFn(f.validateFn, query) : EMPTY_SEARCH,
        }
      }
    }
    const w = index.wildcards[0]
    if (w) {
      return {
        path: cleanPath,
        params: EMPTY_PARAMS,
        query,
        hash,
        matched: w.matchedChain,
        meta: w.meta,
        search: w.validateFn ? applyValidateFn(w.validateFn, query) : EMPTY_SEARCH,
      }
    }
  } else {
    // General lane: %-encoded / `//` / trailing-slash paths — split-based
    // matching with per-segment decode, exactly as before the fast lane.
    const pathParts = splitPath(cleanPath)
    const pathLen = pathParts.length

    if (pathLen > 0) {
      const first = pathParts[0] as string
      const bucket = index.segmentMap[first]
      if (bucket) {
        const match = searchCandidates(bucket, pathParts, pathLen)
        if (match) {
          return {
            path: cleanPath,
            params: match.params,
            query,
            hash,
            matched: match.matched,
            meta: match.meta,
            search: applyValidateFn(match.validateFn, query),
          }
        }
      }
    }

    const dynMatch = searchCandidates(index.dynamicFirst, pathParts, pathLen)
    if (dynMatch) {
      return {
        path: cleanPath,
        params: dynMatch.params,
        query,
        hash,
        matched: dynMatch.matched,
        meta: dynMatch.meta,
        search: applyValidateFn(dynMatch.validateFn, query),
      }
    }

    const w = index.wildcards[0]
    if (w) {
      return {
        path: cleanPath,
        params: {},
        query,
        hash,
        matched: w.matchedChain,
        meta: w.meta,
        search: applyValidateFn(w.validateFn, query),
      }
    }
  }

  // Fallback: notFoundComponent walk. When the URL doesn't match any
  // descendant route, look for the deepest parent `notFoundComponent`
  // whose path is a prefix of this URL. Build a synthetic chain that
  // renders the not-found component INSIDE its ancestor layouts so the
  // 404 page carries the same chrome (headers, footers, navigation) as
  // regular pages. Without this, SSG/SSR returns `matched: []` and the
  // caller has to render the not-found component standalone, losing
  // layout wrapping.
  const nfb = findNotFoundFallback(routes, cleanPath, index.notFoundTrie)
  if (nfb) {
    return {
      path: cleanPath,
      params: {},
      query,
      hash,
      matched: nfb,
      meta: mergeMeta(nfb),
      search: {},
      isNotFound: true,
    }
  }

  return { path: cleanPath, params: {}, query, hash, matched: [], meta: {}, search: {} }
}

// ─── notFoundComponent walking ───────────────────────────────────────────────

/** Synthetic leaf RouteRecord used by the 404 fallback. Carries no real
 * path matching — the resolver inserts it at the end of the chain when
 * a parent `notFoundComponent` is the closest fallback for the URL. */
const SYNTHETIC_NOT_FOUND_PATH = '__pyreon_not_found_leaf__'

/**
 * Walk the route tree finding records with `notFoundComponent`. Return
 * the chain `[...ancestors, parentWithNotFound, syntheticLeaf]` for the
 * DEEPEST record whose URL path is a prefix of `urlPath`.
 *
 * The path-prefix check: a record at `'/de'` applies to `/de/unknown`
 * and `/de` itself but NOT to `/about` or `/encyclopedia` (full-segment
 * boundary required, not substring). A record at `'/'` (root layout)
 * applies to every URL. Deeper matches win — `/de` layout takes
 * precedence over root layout for URLs under `/de/...`.
 *
 * Returns `null` when no record has `notFoundComponent`.
 */
function findNotFoundFallback(
  _routes: RouteRecord[],
  urlPath: string,
  trie: NotFoundTrieNode,
): RouteRecord[] | null {
  // PR-S9: O(URL segments) trie lookup. Replaces the previous full
  // route-tree walk (O(routes-in-tree) per 404, with constant-factor
  // string ops per record). The trie is built once at `buildRouteIndex`
  // time and cached via `_indexCache` (WeakMap keyed on `routes`
  // identity). On large i18n × dynamic-route trees this drops 404
  // resolution from "scan every route" to "walk N segments of the URL".
  //
  // The trie's `layout` / `page` tracks at each node preserve the same
  // tiebreaker semantics as the old walk: deeper chain wins, ties go to
  // more specific (more-segments) paths.
  const { layout, page } = findInTrie(trie, urlPath)

  // Layout pass — preferred over page-level fallback. fs-router attaches
  // `notFoundComponent` to BOTH the parent layout AND every page record
  // under that layout. The trie distinguishes the two via `isLayout`
  // at insert time (records with non-empty `children`). Layout matches
  // produce a chain `[...ancestors, syntheticLeaf]` where the synthetic
  // leaf renders the notFoundComponent inside the layout's
  // `<RouterView />`.
  if (layout) {
    const syntheticLeaf: RouteRecord = {
      path: SYNTHETIC_NOT_FOUND_PATH,
      component: layout.record.notFoundComponent as RouteComponent,
    }
    return [...layout.chain, syntheticLeaf]
  }

  // Layout-less fallback. The user has a page-level `notFoundComponent`
  // (e.g. `_404.tsx` at the route root with no `_layout.tsx`). Without
  // a parent layout to wrap the leaf, we synthesize ONE: a minimal
  // "default chrome" layout that renders `<main data-pyreon-default-chrome>
  // <RouterView /></main>`. This provides a semantic-HTML landmark for
  // accessibility + a hook for users to target the wrapper via CSS, while
  // routing the render through the normal `<RouterView />` pipeline (so
  // `isNotFound` propagation and runtime SSR status-404 still work).
  //
  // The DefaultChromeLayout component is registered by `components.tsx`
  // at module load time via `_setDefaultChromeLayout()` (setter pattern
  // to avoid the components.tsx → match.ts circular import). If the
  // setter hasn't been called yet (consumer never imported anything
  // from `@pyreon/router` that triggers components.tsx's side effects),
  // we fall back to returning null — the standalone-render path in the
  // SSG plugin / runtime handler picks up from there.
  if (page && _defaultChromeLayout) {
    const syntheticChromeLayout: RouteRecord = {
      path: page.fullPath,
      component: _defaultChromeLayout,
    }
    const syntheticLeaf: RouteRecord = {
      path: SYNTHETIC_NOT_FOUND_PATH,
      component: page.record.notFoundComponent as RouteComponent,
    }
    return [syntheticChromeLayout, syntheticLeaf]
  }

  return null
}

/** Count `/`-separated path segments. `/` → 0; `/de` → 1; `/de/about` → 2. */
function countSegments(path: string): number {
  let count = 0
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) === 47 /* / */ && i + 1 < path.length) count++
  }
  return count
}

/** Merge meta from matched routes (leaf takes precedence) */
function mergeMeta(matched: RouteRecord[]): RouteMeta {
  const meta: RouteMeta = {}
  for (const record of matched) {
    if (record.meta) Object.assign(meta, record.meta)
  }
  // Match the freeze-on-construction contract enforced in `makeFlatEntry`
  // so the not-found-fallback path can't silently leak a mutable meta
  // when the rest of the system promises immutability. Same rationale —
  // user code calling `(props as any).meta.x = ...` should throw
  // consistently regardless of which resolver path produced the meta.
  return Object.freeze(meta) as RouteMeta
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
