/**
 * Whether `base` is a ROUTE path: a root-relative path on this origin, the
 * only kind of base pages (and their fragment endpoint) can live under.
 *
 * Shared by `@pyreon/server` (the server-island fragment URL) and
 * `@pyreon/zero` (every base decision), so the two can never disagree.
 * Rejected: no leading `/`; `//host` and `/\host` (browsers read `/\` as
 * `//`, leaving the origin); a query, a fragment or whitespace; a `..`
 * segment.
 */
export function isRoutePath(base: string): boolean {
  return /^\/(?![/\\])[^?#\\\s]*$/.test(base) && !/(^|\/)\.\.(\/|$)/.test(base)
}
