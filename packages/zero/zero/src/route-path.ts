/**
 * Whether `base` is a ROUTE path: a root-relative path on this origin, the
 * only kind of base pages can live under (see `routeBaseOf` in config.ts).
 *
 * The one predicate every base decision uses — `validateZeroConfig`,
 * `routeBaseOf`, the inner build's zero config, the PWA check and the dev
 * router — so no site can accept a base another rejects (#4751 review: a bare
 * `startsWith('/')` took `//cdn.example.com/x/`, a protocol-relative URL, as a
 * route base, and the inner build then failed validation).
 *
 * Rejected: no leading `/`; `//host` and `/\host` (browsers read `/\` as `//`,
 * so links would leave the origin); a query, a fragment or whitespace; a `..`
 * segment.
 */
export function isRoutePath(base: string): boolean {
  return /^\/(?![/\\])[^?#\\\s]*$/.test(base) && !/(^|\/)\.\.(\/|$)/.test(base)
}
