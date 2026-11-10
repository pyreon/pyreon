import type { ResolvedRoute, RouteComponent, RouteMeta, RouteRecord } from './types'

// ─── Default chrome layout registration ──────────────────────────────────────
//
// Late-bound registration for the synthetic layout used by the layout-less-app
// 404 fallback in `findNotFoundFallback`. The component lives in
// `./components.tsx` (it needs JSX + RouterView), which sits ABOVE this file in
// the dependency graph, so importing it here would create a cycle. Instead
// `components.tsx` calls `_setDefaultChromeLayout(...)` at module load — and any
// app touching `RouterProvider`/`RouterView`/`RouterLink` runs that before any
// `resolveRoute()` call.
//
// When the setter hasn't been called (unit tests exercising `resolveRoute` in
// isolation), `findNotFoundFallback` returns `null` for the layout-less case and
// the standalone-render path picks up — so it degrades gracefully.
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
/**
 * URI-decode, returning the RAW text when the input is not valid
 * percent-encoding.
 *
 * `decodeURIComponent` throws `URIError` on a malformed escape — a lone `%`,
 * `%zz`, a truncated `%E0%A4`. Every decode in this module is applied to
 * ATTACKER-CONTROLLED text (a path segment, a query value), and this module is
 * reached PRE-AUTH from `router.preload` inside the SSR handler, so an
 * unguarded decode turned `GET /?q=%` — one character, no auth, a STATIC route,
 * no dynamic params needed — into a 500 on every server-rendered Pyreon app.
 *
 * Raw-on-failure rather than throw-or-drop: the router is a pure matcher with
 * no HTTP context, so it cannot answer 400; treating an undecodable segment as
 * its literal text keeps matching total and leaks nothing. A host that wants to
 * reject malformed URLs should validate before routing.
 *
 * The adapters (`zero`'s `bun.ts`) and `url-guard.ts` already guarded this, so
 * the unguarded sites were an oversight, not a policy.
 */
function safeDecodeURIComponent(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Decode a query component: `+` → space (per application/x-www-form-urlencoded), then URI-decode. */
function decodeQueryComponent(raw: string): string {
  return safeDecodeURIComponent(raw.replace(/\+/g, ' '))
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
// NOTE on CodeQL `js/remote-property-injection`: that query credits only
// ALLOWLIST/constant-prefix sanitizers by design, so a blocklist guard like this
// one is never recognized and the alerts on the write sites are DISMISSED with
// rationale rather than "fixed". Arbitrary user-chosen keys are the PURPOSE of a
// query-param record; the real risks are covered by the null-prototype record +
// dropped dangerous keys above, both bisect-locked in tests/match.test.ts.

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

// Shared frozen empties for the no-params / no-query / no-search cases —
// the dominant shapes. Freezing follows the `meta` precedent (frozen at
// flatten time): user mutation throws in strict mode instead of silently
// polluting a shared object, and the resolver skips three allocations per
// navigation. Non-empty params/query/search are still fresh per resolve.
const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null))
const EMPTY_QUERY: Record<string, string> = Object.freeze(Object.create(null))
const EMPTY_SEARCH: Record<string, unknown> = Object.freeze(Object.create(null))

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
  /**
   * Set when this entry owns a `staticMap` key: `true` when that key holds no
   * `?`/`#`, so a RAW URL equal to it is this route with no query/hash (a raw
   * URL's `?`/`#` are separators, never path characters).
   */
  rawSafe: boolean
  /**
   * `false` when a static segment contains `?` or `#`: in a raw URL those end
   * the path, so the single-pass walk cannot compare such a segment and hands
   * the URL to the general lane.
   */
  walkable: boolean
  /**
   * The frozen `ResolvedRoute` for this entry's static path with no query, no
   * hash and no `validateSearch` — built once when the entry enters `staticMap`
   * and returned as-is by every such resolve (zero allocation; the same
   * object identity, so an `Object.is`-gated consumer sees "unchanged" for a
   * same-path re-resolve). `null` for dynamic entries and validator chains.
   */
  staticResult: ResolvedRoute | null
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
  // `meta` is SHARED across every navigation resolving through this
  // FlattenedRoute (dynamic routes see the same object identity for /posts/42 and
  // /posts/99 — that sharing is the cache making resolveRoute O(1)). Freezing
  // makes user mutation throw in strict-mode modules instead of silently
  // polluting the cache permanently for every future navigation. The framework
  // only ever reads `route.meta`, so this is purely a user-mutation safety net.
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
    rawSafe: false,
    walkable: segments.every((s) => s.isParam || !/[?#]/.test(s.raw)),
    staticResult: null,
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

  // fs-router emits ABSOLUTE paths for nested children (parent `/app` with child
  // `/app/dashboard`, not `dashboard`). Concatenating parent segments with an
  // already-absolute child would produce `/app/app/dashboard`, so the staticMap
  // lookup misses and resolveRoute returns `matched: []`. Detect the absolute
  // child and skip the parent prefix; relative children (`dashboard`, `:id`)
  // still inherit via concatenation.
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
  /**
   * Raw URL → the final frozen `ResolvedRoute`, for every `rawSafe` static
   * entry without a validator: a static resolve is one probe and a return.
   */
  rawStatic: Record<string, ResolvedRoute>
  /** Some `rawSafe` static entry has a validator, so lane 1 must also probe `staticMap`. */
  validatedStatic: boolean
  /**
   * First-segment dispatch: an open-addressed hash table (`firstKeys[j]` →
   * `firstDispatch[j]`, size a power of two, linear probing) from a route's
   * static first segment to its bucket. The fast lane hashes the
   * first segment IN PLACE in the URL and compares candidate keys char by
   * char — no substring is allocated and no string is atomized for a property
   * lookup, which a `segmentMap[url.slice(1, end)]` probe pays on every
   * dynamic resolve (measured ~15 ns of a ~67 ns `/user/:id` resolve).
   * Each bucket lists its routes in definition order.
   */
  firstKeys: Array<string | undefined>
  firstDispatch: Array<FlattenedRoute[] | undefined>
  firstMask: number
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

// ─── notFoundComponent trie ─────────────────────────────────────────────────
//
// Indexes notFoundComponent-bearing records by URL-path segments at build time,
// so `/de/posts/unknown` walks root -> "de" -> "posts" in O(URL segments)
// instead of scanning the whole route tree per 404 (previously O(N) with heavy
// per-record string work; real i18n x dynamic trees have dozens of such records).
//
// Two parallel tracks per node: `layout` (deepest layout-record whose
// notFoundComponent applies at this prefix) and `page` (deepest page-record,
// used only for the layout-less synthetic-chrome fallback). Both `chain.length`
// and `segmentCount` are tracked so the depth/specificity tiebreaker in
// `findNotFoundFallback` is preserved.
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
    const key = f.staticPath
    staticMap[key] = f
    f.rawSafe = key.indexOf('?') < 0 && key.indexOf('#') < 0
    if (f.validateFn === null) {
      f.staticResult = Object.freeze({
        path: key,
        params: EMPTY_PARAMS,
        query: EMPTY_QUERY,
        hash: '',
        matched: f.matchedChain,
        meta: f.meta,
        search: EMPTY_SEARCH,
      })
    }
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

/** Hash of `s[from, to)` — the same function at build time (keys) and resolve time (URL, in place). */
function hashRange(s: string, from: number, to: number): number {
  let h = 0
  for (let i = from; i < to; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

/** Fast-lane bucket for the first segment `path[1, end)`, or undefined. */
function findFirstBucket(
  index: RouteIndex,
  path: string,
  end: number,
  hash: number,
): FlattenedRoute[] | undefined {
  const keys = index.firstKeys
  const mask = index.firstMask
  const len = end - 1
  let j = hash & mask
  for (let key = keys[j]; key !== undefined; key = keys[j]) {
    if (key.length === len) {
      let k = 0
      while (k < len && key.charCodeAt(k) === path.charCodeAt(1 + k)) k++
      if (k === len) return index.firstDispatch[j]
    }
    j = (j + 1) & mask
  }
  return undefined
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
  const rawStatic: Record<string, ResolvedRoute> = Object.create(null)
  let validatedStatic = false
  const segmentMap: Record<string, FlattenedRoute[]> = Object.create(null)
  const dynamicFirst: FlattenedRoute[] = []
  const wildcards: FlattenedRoute[] = []

  for (const f of flattened) {
    indexFlatRoute(f, staticMap, segmentMap, dynamicFirst, wildcards)
  }
  for (const key in staticMap) {
    const f = staticMap[key] as FlattenedRoute
    if (!f.rawSafe) continue
    if (f.staticResult !== null) rawStatic[key] = f.staticResult
    else validatedStatic = true
  }

  // PR-S9: build the notFoundComponent trie at the same step. Walking
  // the route tree once for both the segmentMap AND the notFoundTrie is
  // cheaper than two separate walks; the trie is empty (root with no
  // children + no entries) when no record carries `notFoundComponent`.
  const notFoundTrie = buildNotFoundTrie(routes)

  const firstKeysList = Object.keys(segmentMap)
  let size = 8
  while (size < firstKeysList.length * 2) size <<= 1
  const firstMask = size - 1
  const firstKeys: Array<string | undefined> = new Array(size).fill(undefined)
  const firstDispatch: Array<FlattenedRoute[] | undefined> = new Array(size).fill(undefined)
  for (const key of firstKeysList) {
    let j = hashRange(key, 0, key.length) & firstMask
    while (firstKeys[j] !== undefined) j = (j + 1) & firstMask
    firstKeys[j] = key
    firstDispatch[j] = segmentMap[key]
  }

  // First-char fail-fast mask: `mask[c] === 1` iff SOME non-wildcard route's first
  // URL segment starts with ASCII char code `c`. After a staticMap miss, a path
  // whose first char isn't in the mask can only match a wildcard, so resolveRoute
  // jumps straight there — the radix-tree-style first-char fail find-my-way gets
  // for free. Statics ARE in the mask: `/about/` misses the staticMap but must
  // still reach the general matcher. Disabled entirely when any first char is
  // non-ASCII or any route's first segment is dynamic; '%'-first paths are
  // handled at the check site.
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
    rawStatic,
    validatedStatic,
    firstKeys,
    firstDispatch,
    firstMask,
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


// ─── Single-pass walk lane ───────────────────────────────────────────────────
//
// The common URL is matched in ONE pass over its characters: the first
// segment is hashed in place for the dispatch table, then each candidate route
// is walked against the URL — static pattern segments compared char by char
// at the current offset, param segments scanned to their end and sliced, a
// splat taking the rest of the path. The walk stops at the first `?` or `#`,
// so the query/hash split falls out of it. Nothing re-scans the URL.
//
// Why a successful walk is exact: every segment it consumes is non-empty and
// it must end at `?`, `#` or the end of the URL, so success PROVES the path
// part has no `//` and no trailing slash — the shapes on which the general
// lane's split-and-collapse semantics differ. A walk that meets a `%` inside a
// param or splat value aborts (decoding could change which route wins), and
// static segments compare the raw text exactly as the general lane does. So
// whenever the walk succeeds, every earlier candidate's failure was genuine;
// when no candidate succeeds (or one aborts), the general lane answers.
// `fast-lane-differential.test.ts` fuzzes the two lanes against each other.

/** Walk state: where the matched path part ended, and whether the walk must defer to the general lane. */
const _walk = { end: 0, abort: false }

/** `c` ends a path part: end of string (-1), `?` or `#`. */
function isPathEnd(c: number): boolean {
  return c === -1 || c === 63 /* ? */ || c === 35 /* # */
}

/**
 * Walk `f` over `path` from segment `from`, whose opening `/` is at `off`.
 * Returns the params on a match (and sets `_walk.end`), or null. Sets
 * `_walk.abort` when a param value holds a `%` escape or the route has a
 * static `?`/`#` segment — the general lane must decide those.
 */
function walkRoute(
  f: FlattenedRoute,
  path: string,
  off: number,
  from: number,
  decode: boolean,
): Record<string, string> | null {
  if (!decode && !f.walkable) {
    _walk.abort = true
    return null
  }
  const segs = f.segments
  const count = f.segmentCount
  const len = path.length
  // The root path (`/`, `/?q`, `/#h`) has zero segments: its `/` opens none.
  if (off === 0 && isPathEnd(len > 1 ? path.charCodeAt(1) : -1)) off = 1
  let params: Record<string, string> | null = null
  for (let i = from; i < count; i++) {
    const seg = segs[i] as CompiledSegment
    const c = off < len ? path.charCodeAt(off) : -1
    if (c !== 47 /* / */) {
      // The path part ended (a non-`/` char here can only follow a static
      // segment that was a strict prefix — a mismatch). Only trailing
      // optionals may remain.
      if (!isPathEnd(c) || !seg.isOptional) return null
      continue
    }
    const start = off + 1
    if (seg.isParam) {
      let j = start
      let segs2 = 1
      for (; j < len; j++) {
        const ch = path.charCodeAt(j)
        if (ch === 63 || ch === 35) break
        if (ch === 37 /* % */ && !decode) {
          _walk.abort = true
          return null
        }
        if (ch === 47) {
          if (!seg.isSplat) break
          // inside a splat: an empty segment (`//`, trailing `/`) is not plain
          if (j === start || isPathEnd(j + 1 < len ? path.charCodeAt(j + 1) : -1) || path.charCodeAt(j + 1) === 47) {
            return null
          }
          segs2++
        }
      }
      if (j === start) return null // empty segment
      // A splat consumes the rest: the URL's segment count is now known, and
      // must pass the same count rule the general lane applies up front.
      if (seg.isSplat && !isSegmentCountCompatible(f, i + segs2)) return null
      if (params === null) params = {}
      let v = path.slice(start, j)
      // General lane: decode per segment (a malformed escape stays raw in its
      // own segment only).
      if (decode && v.indexOf('%') >= 0) v = v.split('/').map(safeDecodeURIComponent).join('/')
      params[seg.paramName] = v
      off = j
      if (seg.isSplat) break
    } else {
      const raw = seg.raw
      const n = raw.length
      if (start + n > len) return null
      for (let k = 0; k < n; k++) {
        if (path.charCodeAt(start + k) !== raw.charCodeAt(k)) return null
      }
      off = start + n
    }
  }
  if (!isPathEnd(off < len ? path.charCodeAt(off) : -1)) return null
  _walk.end = off
  return params ?? {}
}

/** First walk match in `list` (definition order), or null — check `_walk.abort` after a null. */
function walkList(
  list: FlattenedRoute[],
  path: string,
  off: number,
  from: number,
  decode: boolean,
): FlattenedRoute | null {
  for (let i = 0; i < list.length; i++) {
    const f = list[i] as FlattenedRoute
    const params = walkRoute(f, path, off, from, decode)
    if (params !== null) {
      _walkParams.p = params
      return f
    }
    if (_walk.abort) return null
  }
  return null
}

const _walkParams: { p: Record<string, string> } = { p: EMPTY_PARAMS }

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
    params[pp.slice(1, -1)] = pathParts.slice(i).map(safeDecodeURIComponent).join('/')
    return 'splat'
  }
  if (pp.endsWith('?') && pp.startsWith(':')) {
    if (pt !== undefined) params[pp.slice(1, -1)] = safeDecodeURIComponent(pt)
    return 'continue'
  }
  if (pt === undefined) return 'fail'
  if (pp.startsWith(':')) {
    params[pp.slice(1)] = safeDecodeURIComponent(pt)
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

// ─── Flattened route matching ─────────────────────────────────────────────────

/** Check whether a flattened route's segment count is compatible with the path length */
function isSegmentCountCompatible(f: FlattenedRoute, pathLen: number): boolean {
  if (f.segmentCount === pathLen) return true
  if (f.hasSplat && pathLen >= f.segmentCount) return true
  if (f.hasOptional && pathLen >= f.minSegments && pathLen <= f.segmentCount) return true
  return false
}

// ─── Route resolution ─────────────────────────────────────────────────────────

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


// Identity memo for the dominant single-router case: every navigation
// passes the SAME RouteRecord[] reference, so an identity check replaces
// the WeakMap probe (~0.5ns vs ~4ns). Multi-router apps alternate refs and
// fall back to the WeakMap-cached index — never rebuilt, never wrong.
// Held on a const object, not module `let`s (V8 pays a context-slot load +
// TDZ check per module-`let` access — see `.agents/guides/benchmarks`).
const _memo: { routes: RouteRecord[] | null; index: RouteIndex | null } = {
  routes: null,
  index: null,
}

function getIndex(routes: RouteRecord[]): RouteIndex {
  const m = _memo
  if (routes === m.routes && m.index !== null) return m.index
  const index = buildRouteIndex(routes)
  m.routes = routes
  m.index = index
  return index
}

/** A fast-lane match of `f`: fresh result with the shared frozen `search` when there is no validator. */
function routeHit(
  f: FlattenedRoute,
  path: string,
  params: Record<string, string>,
  query: Record<string, string>,
  hash: string,
): ResolvedRoute {
  return {
    path,
    params,
    query,
    hash,
    matched: f.matchedChain,
    meta: f.meta,
    search: f.validateFn ? applyValidateFn(f.validateFn, query) : EMPTY_SEARCH,
  }
}

/** Result for a static-map hit: the cached frozen route, or a fresh one when it has a query / hash / validator. */
function staticResult(
  s: FlattenedRoute,
  cleanPath: string,
  query: Record<string, string>,
  hash: string,
): ResolvedRoute {
  if (s.staticResult !== null && query === EMPTY_QUERY && hash === '') return s.staticResult
  return routeHit(s, cleanPath, EMPTY_PARAMS, query, hash)
}

/** A wildcard / not-found result — what every non-matching path resolves to. */
function missResult(
  index: RouteIndex,
  routes: RouteRecord[],
  cleanPath: string,
  query: Record<string, string>,
  hash: string,
): ResolvedRoute {
  const w = index.wildcards[0]
  if (w) return routeHit(w, cleanPath, EMPTY_PARAMS, query, hash)
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

/**
 * Resolve a raw path (including query string and hash) against the route tree.
 *
 * Lanes, cheapest first:
 *   1. The raw path is a static route's exact path (no `?`/`#`) → the route's
 *      cached frozen `ResolvedRoute` (zero allocation).
 *   2. First-char fail-fast (and non-root-relative paths) → the wildcard /
 *      not-found tail.
 *   3. The single-pass walk: first-segment dispatch, then each candidate
 *      walked over the URL once (see "Single-pass walk lane").
 *   4. Anything the walk cannot decide (`%` in a param, `//`, trailing slash,
 *      no match) → the general split-normalize-decode lane.
 */
export function resolveRoute(rawPath: string, routes: RouteRecord[]): ResolvedRoute {
  const index = getIndex(routes)
  const cached = index.rawStatic[rawPath]
  if (cached !== undefined) return cached
  // Lane 1 (rest): a raw static hit whose chain has a validator. Keys holding
  // `?`/`#` are excluded (`rawSafe`) here and in `rawStatic`: in a raw URL
  // those characters are the query / hash separators.
  if (index.validatedStatic) {
    const raw = index.staticMap[rawPath]
    if (raw !== undefined && raw.rawSafe) return routeHit(raw, rawPath, EMPTY_PARAMS, EMPTY_QUERY, '')
  }

  // Lane 2: first-char fail-fast (see RouteIndex.firstCharMask). A path whose
  // first-segment char no non-wildcard route starts with can only match a
  // wildcard — the first-char fail a radix tree gets for free. Excluded chars take
  // the full pipeline: `%` (an encoded first char decodes to anything), `/` (a
  // leading `//` collapses in the general lane), and `?`/`#` (`/?q` is the root
  // path plus a query). `charCodeAt(1)` is NaN for the bare root `/` — it
  // jumps, which is correct: a root route would have hit lane 1.
  //
  // A path that is not root-relative (no leading `/`, including `''`) matches
  // no route either: callers pass root-relative paths, and the resolver
  // deliberately does not guess (`matcher-agreement.test.ts`).
  const mask = index.firstCharMask
  const cc = rawPath.charCodeAt(1)
  if (
    rawPath.charCodeAt(0) !== 47 /* / */ ||
    (mask !== null &&
      cc !== 37 &&
      cc !== 47 &&
      cc !== 63 &&
      cc !== 35 &&
      !(cc < 128 && mask[cc] === 1))
  ) {
    const end = urlEnd(rawPath)
    const w = index.wildcards[0]
    // The common miss — no query/hash, a catch-all without a validator — is
    // built inline (no split, no helper calls).
    if (end === rawPath.length && w !== undefined && w.validateFn === null) {
      return {
        path: rawPath,
        params: EMPTY_PARAMS,
        query: EMPTY_QUERY,
        hash: '',
        matched: w.matchedChain,
        meta: w.meta,
        search: EMPTY_SEARCH,
      }
    }
    const cleanPath = splitUrl(rawPath, end)
    return missResult(index, routes, cleanPath, _url.query, _url.hash)
  }

  // Lane 3: the single-pass walk.
  return resolveUncached(rawPath, routes, index)
}

function resolveUncached(rawPath: string, routes: RouteRecord[], index: RouteIndex): ResolvedRoute {
  const f = walkAll(index, rawPath, false)
  if (f === null) return resolveGeneral(rawPath, routes, index)

  const end = _walk.end
  const params = _walkParams.p
  if (end === rawPath.length) return routeHit(f, rawPath, params, EMPTY_QUERY, '')
  const cleanPath = splitUrl(rawPath, end)
  // A static route for the bare path outranks the bucket (`/about?x=1`).
  const s = index.staticMap[cleanPath]
  if (s !== undefined) return staticResult(s, cleanPath, _url.query, _url.hash)
  return routeHit(f, cleanPath, params, _url.query, _url.hash)
}

/**
 * Hash the first segment in place (it ends at the first `/`, `?`, `#` or the
 * end), walk that bucket in definition order, then the param-first routes.
 * Returns the matched route (params in `_walkParams`, end in `_walk.end`) or
 * null; after a null, `_walk.abort` says the general lane must decide.
 */
function walkAll(index: RouteIndex, path: string, decode: boolean): FlattenedRoute | null {
  const len = path.length
  let firstEnd = 1
  let h = 0
  for (; firstEnd < len; firstEnd++) {
    const c = path.charCodeAt(firstEnd)
    if (c === 47 || c === 63 || c === 35) break
    h = (Math.imul(h, 31) + c) | 0
  }
  _walk.abort = false
  if (firstEnd > 1) {
    const bucket = findFirstBucket(index, path, firstEnd, h)
    // Every candidate is keyed by its static first segment, which the lookup
    // just proved equal — the walk starts at segment 1.
    if (bucket !== undefined) {
      const f = walkList(bucket, path, firstEnd, 1, decode)
      if (f !== null || _walk.abort) return f
    }
  }
  return walkList(index.dynamicFirst, path, 0, 0, decode)
}

/** Query and hash of the last `splitUrl` — read immediately after the call. */
const _url: { query: Record<string, string>; hash: string } = { query: EMPTY_QUERY, hash: '' }

/** Offset of the first `?` or `#` in a raw URL (its length when neither occurs). */
function urlEnd(raw: string): number {
  const q = raw.indexOf('?')
  const h = raw.indexOf('#')
  return q < 0 ? (h < 0 ? raw.length : h) : h < 0 || q < h ? q : h
}

/**
 * Split a raw URL whose path part ends at `end` (the first `?`/`#`): returns
 * the path and leaves the parsed query and the hash in `_url`. WHATWG order —
 * the hash starts at the first `#`, the query is what lies between a leading
 * `?` and that `#`, so a `?` inside the fragment is not a query separator.
 */
function splitUrl(raw: string, end: number): string {
  const u = _url
  if (end === raw.length) {
    u.query = EMPTY_QUERY
    u.hash = ''
    return raw
  }
  const h = raw.indexOf('#', end)
  u.hash = h >= 0 ? raw.slice(h + 1) : ''
  const qs = raw.charCodeAt(end) === 63 /* ? */ ? raw.slice(end + 1, h >= 0 ? h : raw.length) : ''
  u.query = qs ? parseQuery(qs) : EMPTY_QUERY
  return raw.slice(0, end)
}

/**
 * The general lane: `%`-encoded / `//` / trailing-slash / relative paths —
 * split-based matching with per-segment decode. It is also the reference the
 * fast lane is fuzzed against (`_resolveGeneralForTest`).
 */
function resolveGeneral(rawPath: string, routes: RouteRecord[], index: RouteIndex): ResolvedRoute {
  // Splitting `?` before `#` once leaked the hash into the query
  // (`/user/42?tab=posts#bio` -> `{ tab: 'posts#bio' }`); `splitUrl` keeps
  // WHATWG order.
  const cleanPath = splitUrl(rawPath, urlEnd(rawPath))
  const query = _url.query
  const hash = _url.hash

  const s = index.staticMap[cleanPath]
  if (s !== undefined) return staticResult(s, cleanPath, query, hash)

  // Normalize: drop empty segments (`//`, a trailing `/`) and walk the plain
  // `/`-joined path in decode mode — static pattern segments compare against
  // the RAW segment (a `%`-encoded static pattern matches the identical raw
  // URL), params and splats are decoded per segment.
  const path = `/${splitPath(cleanPath).join('/')}`
  const f = walkAll(index, path, true)
  if (f !== null) return routeHit(f, cleanPath, _walkParams.p, query, hash)
  return missResult(index, routes, cleanPath, query, hash)
}

/**
 * @internal Test hook: resolve through the general lane only — the reference
 * implementation `fast-lane-differential.test.ts` fuzzes the fast lanes against.
 */
export function _resolveGeneralForTest(rawPath: string, routes: RouteRecord[]): ResolvedRoute {
  return resolveGeneral(rawPath, routes, getIndex(routes))
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
