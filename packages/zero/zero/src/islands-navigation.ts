// ─── islands-navigation.ts ─────────────────────────────────────────────────
//
// Internal: the navigation guard an islands-only page installs: a route
// change becomes a full document load. Split out of the public entry
// `client.ts`, which imports from here, so these helpers are not public API;
// their unit tests reach them through `@pyreon/zero/internal`.

import { stringifyQuery, type ResolvedRoute } from '@pyreon/router'

/**
 * The navigation guard that sends a client-side navigation TO an islands-only
 * route (`meta.hydrate === 'islands'`) to the server as a full page load.
 * Exported for its unit test; `assign` is the browser's `location.assign`.
 * @internal
 */
export function islandsOnlyNavigation(
  base: string,
  assign: (href: string) => void = (href) => globalThis.location.assign(href),
): (to: ResolvedRoute, from: ResolvedRoute) => boolean | undefined {
  return (to, from) => {
    if ((to.meta as { hydrate?: unknown }).hydrate !== 'islands') return undefined
    // The route the app is already on (a cold start re-running loaders for
    // the current URL) is rendered here, never reloaded: reloading it would
    // loop when a static host served this app's shell at that URL.
    if (to.path === from.path) return undefined
    assign(`${base}${to.path}${stringifyQuery(to.query as Record<string, string>)}${to.hash ? `#${to.hash}` : ''}`)

    return false
  }
}
