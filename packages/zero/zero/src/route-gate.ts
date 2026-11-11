/**
 * Shared between the route-module codegen (`fs-router.ts`) and the request
 * gate (`pipeline.ts`). Kept dependency-free so the server pipeline does not
 * import the build-time route scanner.
 */

/**
 * Symbol-keyed tag on every generated layout RECORD whose `_layout` file
 * exports `middleware`. The value is that file's gate id, the same id the
 * generated route-middleware entry carries (`RouteMiddlewareEntry.gate`).
 *
 * Route middleware is matched by page URL patterns, but the router also runs
 * a layout's loaders for a URL that matches NO page: the not-found chain
 * `[...ancestor layouts, <404 leaf>]`. The request gate reads these tags off
 * the chain the router actually resolves, so a guarded layout's middleware
 * runs whenever its loaders would. A symbol key survives the record spreads
 * of locale expansion and is invisible to `Object.keys` / JSON.
 */
export const ROUTE_GATE_TAG = 'pyreon.zero.routeGate'

/**
 * A short, stable id for a route file — not the path itself, which would
 * otherwise ship to the client inside the routes module. FNV-1a (32-bit) in
 * base 36; a collision only makes one gate also run another layout's
 * middleware, never fewer.
 */
export function routeGateId(filePath: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < filePath.length; i++) {
    h ^= filePath.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `g${h.toString(36)}`
}
