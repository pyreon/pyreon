// Shared route-IR helpers — consumed by BOTH emit-swift.ts and
// emit-kotlin.ts so iOS + Android resolve route redirects identically.
//
// Phase 3 (native router parity) introduces static per-route redirects.
// A redirect-only route (`{ path: '/', redirect: '/home' }`) carries no
// component of its own; the native emit treats it as a COMPILE-TIME ALIAS
// — the dispatch branch for the source path renders the redirect target's
// component directly. No router-runtime push, fully verifiable via
// swiftc/kotlinc.
//
// Keeping the resolution logic in ONE place is deliberate: the codebase
// prioritizes Swift⇄Kotlin lockstep, and a duplicated resolver is exactly
// the kind of thing that silently drifts.

import type { ExprIR, RouteIR } from './types'

/**
 * Resolve a route to the route that actually carries a `component`,
 * following `redirect` chains transitively.
 *
 *   { path: '/', redirect: '/home' }            // source
 *   { path: '/home', component: HomePage }      // → returned
 *
 * Chains resolve transitively (`/a → /b → /c`). A cycle
 * (`/a → /b → /a`) or a dangling redirect (target path not in the table)
 * returns `undefined` — the caller skips emitting a branch for it, so a
 * misconfigured redirect degrades to "no route" rather than a crash or
 * infinite loop.
 *
 * A non-redirect route resolves to itself. The returned route is
 * guaranteed to have a defined `component`.
 */
export function resolveRouteTarget(
  route: RouteIR,
  routes: readonly RouteIR[],
): RouteIR | undefined {
  const seen = new Set<string>()
  let current: RouteIR = route
  while (current.component === undefined && current.redirect !== undefined) {
    if (seen.has(current.path)) return undefined // cycle
    seen.add(current.path)
    const next = routes.find((r) => r.path === current.redirect)
    if (next === undefined) return undefined // dangling target
    current = next
  }
  return current.component !== undefined ? current : undefined
}

/**
 * True when `route` is a redirect-only entry (a `redirect` target and no
 * own `component`). The emitters branch on this to decide whether the
 * dispatch case is a compile-time alias.
 */
export function isRedirectRoute(route: RouteIR): boolean {
  return route.component === undefined && route.redirect !== undefined
}

/**
 * Resolved component for a route, or `undefined` when unresolvable
 * (dangling / cyclic redirect). Thin convenience over
 * {@link resolveRouteTarget} for callers that only need the component.
 */
export function resolveRouteComponent(
  route: RouteIR,
  routes: readonly RouteIR[],
): ExprIR | undefined {
  return resolveRouteTarget(route, routes)?.component
}
