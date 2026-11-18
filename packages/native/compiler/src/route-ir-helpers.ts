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
 * True when `route` is a bare whole-route catch-all wildcard (`*` or
 * `(.*)`, mirroring @pyreon/router's `compileRoute` wildcard test). The
 * emitters render its component as the dispatch ELSE-branch (the fallback
 * for any unmatched path) rather than as a path-equality branch — a literal
 * `path == "*"` would only ever match the literal string "*". This is the
 * canonical 404-page route: `{ path: '*', component: NotFoundPage }`.
 */
export function isWildcardRoute(route: RouteIR): boolean {
  return route.path === '*' || route.path === '(.*)'
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

/**
 * Phase 3 (nested routes) — a single flattened render entry: a full path and
 * the component to render there, plus the ancestor LAYOUT chain that wraps it
 * (outermost-first). The native emit dispatches `path == fullPath` and renders
 * the component wrapped in each layout via a content-closure
 * (`Outer { Inner { Leaf() } }`).
 */
export interface FlatRouteEntry {
  /** Full joined path, e.g. `/app/dashboard`. */
  path: string
  /** Component rendered at this path (a leaf page, or a layout's own index). */
  component: ExprIR
  /**
   * Ancestor layout components, OUTERMOST-FIRST, that wrap `component`. Empty
   * for a top-level (non-nested) route. Each entry is a layout whose body
   * carries a `<RouterView />` slot the next entry fills.
   */
  layoutChain: ExprIR[]
  /** Per-route boolean guard (carried from the leaf route). */
  guard?: ExprIR
  /** True when the source route was a `:param`-bearing pattern. */
  isPattern: boolean
  /** The route's `loader`, carried so the nested dispatch wraps it exactly as the flat one does. */
  loader?: ExprIR
  /** True when that loader reads `ctx.params.*`, so the branch must bind `params`. */
  loaderUsesParams?: boolean
  /**
   * Set on a redirect ALIAS: the source path whose branch renders the target's component (and layout chain). The
   * branch carries no guard or loader of its own: those belong to the target route, which has its own branch.
   */
  redirectFrom?: string
}

/**
 * Join a parent path with a child's (possibly relative) path segment.
 * Mirrors `@pyreon/router`'s fs-router nested-path handling: a child whose
 * path already starts with `/` is ALREADY-ABSOLUTE (used verbatim); otherwise
 * it's a relative segment concatenated onto the parent. Empty segments are
 * collapsed so `/app` + `dashboard` → `/app/dashboard` and `/` + `x` → `/x`.
 */
export function joinRoutePath(parent: string, child: string): string {
  if (child.startsWith('/')) return child // already-absolute child
  const segs = [
    ...parent.split('/').filter(Boolean),
    ...child.split('/').filter(Boolean),
  ]
  return '/' + segs.join('/')
}

/**
 * Flatten a (possibly nested) route tree into a flat list of render entries,
 * each carrying its full path + the ancestor layout chain that wraps it.
 *
 * - A route WITHOUT `children` is a leaf → one entry, `layoutChain` =
 *   the ancestors accumulated so far.
 * - A route WITH `children` is a LAYOUT: if it has its own `component` it
 *   contributes an INDEX entry (its own path, wrapped by ancestors), and its
 *   component is pushed onto the chain for the recursive child entries.
 * - A layout WITHOUT a component (pure grouping) contributes no index entry
 *   and does NOT extend the wrap chain (nothing to wrap with).
 *
 * Conservative v1 bails (the route is SKIPPED from the flattened output):
 *   - redirect / wildcard routes nested under a layout (no clean alias site)
 *   - a nested route whose own segment is a `:param` (the parent's params
 *     aren't in scope at the wrap site) — top-level params still flatten.
 * A top-level redirect becomes an ALIAS entry (`redirectFrom` set) at its
 * declaration position, carrying the target's component and layout chain — the
 * target may itself be nested (`{ path: '/old', redirect: '/app/inbox' }`). A
 * top-level wildcard is omitted: the emitters render it as the else-branch.
 * Each entry carries its route's guard and loader, so the nested dispatch
 * lowers everything the flat dispatch does.
 */
export function flattenRouteTree(routes: readonly RouteIR[]): FlatRouteEntry[] {
  // Each slot is a rendered entry, or a top-level redirect resolved once every entry exists (its target may be a
  // nested route declared later). Slots keep declaration order, which is the dispatch's first-match order.
  const slots: (FlatRouteEntry | RouteIR)[] = []
  const carry = (route: RouteIR): Partial<FlatRouteEntry> => ({
    ...(route.guard !== undefined ? { guard: route.guard } : {}),
    ...(route.loader !== undefined ? { loader: route.loader } : {}),
    ...(route.loaderUsesParams === true ? { loaderUsesParams: true } : {}),
  })
  const walk = (
    nodes: readonly RouteIR[],
    parentPath: string,
    chain: readonly ExprIR[],
  ): void => {
    for (const route of nodes) {
      // Nesting is by PATH position (are we recursing under a parent?), NOT by
      // whether a wrap chain exists — a component-less grouping layout still
      // nests its children's paths (`/group` + `a` → `/group/a`) even though
      // it contributes nothing to wrap with.
      const isNested = parentPath !== ''
      const fullPath = isNested ? joinRoutePath(parentPath, route.path) : route.path
      const hasChildren = route.children !== undefined && route.children.length > 0
      // Conservative bail for nested redirect / wildcard / param routes.
      if (isNested && (route.redirect !== undefined || isWildcardRoute(route))) continue
      if (isNested && route.path.includes(':')) continue
      // A top-level wildcard is the dispatch's ELSE branch, never a path branch.
      if (isWildcardRoute(route)) continue

      if (hasChildren) {
        // Layout route. Its own component (if any) is an index entry.
        if (route.component !== undefined) {
          slots.push({
            path: fullPath,
            component: route.component,
            layoutChain: [...chain],
            ...carry(route),
            isPattern: fullPath.includes(':'),
          })
        }
        // Recurse children with this layout appended to the wrap chain. A
        // childless-component-less layout can't wrap, so only extend the
        // chain when the layout has a component to wrap WITH.
        const nextChain =
          route.component !== undefined ? [...chain, route.component] : [...chain]
        walk(route.children!, fullPath, nextChain)
      } else if (route.component !== undefined) {
        slots.push({
          path: fullPath,
          component: route.component,
          layoutChain: [...chain],
          ...carry(route),
          isPattern: fullPath.includes(':'),
        })
      } else if (isRedirectRoute(route)) {
        slots.push(route)
      }
    }
  }
  walk(routes, '', [])
  const rendered = slots.filter((s): s is FlatRouteEntry => 'layoutChain' in s)
  const redirects = slots.filter((s): s is RouteIR => !('layoutChain' in s))
  const out: FlatRouteEntry[] = []
  for (const slot of slots) {
    if ('layoutChain' in slot) {
      out.push(slot)
      continue
    }
    // A redirect is a compile-time alias, as in the flat dispatch: the source path renders the target's component in
    // the target's layout chain. Chains resolve through other redirects; a cycle, a dangling target or a `:param` on
    // either side has no alias site and is skipped, so the path falls through to the wildcard.
    const seen = new Set<string>([slot.path])
    let target = slot.redirect!
    let entry: FlatRouteEntry | undefined
    for (;;) {
      entry = rendered.find((e) => e.path === target)
      if (entry !== undefined) break
      const next = redirects.find((r) => r.path === target)
      if (next === undefined || seen.has(next.path)) break
      seen.add(next.path)
      target = next.redirect!
    }
    if (entry === undefined || slot.path.includes(':') || entry.path.includes(':')) continue
    out.push({
      path: slot.path,
      component: entry.component,
      layoutChain: entry.layoutChain,
      isPattern: false,
      redirectFrom: slot.path,
    })
  }
  return out
}

/** True when ANY route in the tree carries nested `children`. */
export function hasNestedRoutes(routes: readonly RouteIR[]): boolean {
  return routes.some((r) => r.children !== undefined && r.children.length > 0)
}
