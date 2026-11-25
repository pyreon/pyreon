// ─── api-route-order.ts ────────────────────────────────────────────────────
//
// Internal: the most-specific-first ordering of API route patterns. Split out
// of the public entry `api-routes.ts`, which imports from here, so these
// helpers are not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

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
