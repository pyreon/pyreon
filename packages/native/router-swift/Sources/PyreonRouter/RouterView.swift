// RouterView — the SwiftUI counterpart to @pyreon/router's
// `<RouterView />` component.
//
// Phase A4 (native readiness audit, 2026-06 — closes CRIT-2 partial):
// RouterView renders the route table dispatcher's matched component
// instead of the pre-A4 `EmptyView()` no-op. The router's
// `resolveCurrentRoute()` walks `routes` in declaration order, picks
// the first match, and returns the matching record. RouterView pulls
// the component from that record and renders it.
//
// Phase A6: when no route matches AND the router has a
// `notFoundComponent` configured, render that instead — the wildcard
// catch-all that mirrors the web router's `'*'` / `(.*)` route.
//
// Backward-compat: if the active router has NO routes AND no
// notFoundComponent configured (pre-A4 shape, where the host wires its
// own `.navigationDestination(for:)` on the parent NavigationStack),
// RouterView emits `EmptyView()` — host's destination handler is the
// source of truth.
//
// Out of scope (separate follow-up PRs):
//   - Nested-route depth indexing (`RouteRecord.children` + per-depth
//     `<RouterView />`) — A4.5
//   - Per-route `beforeEnter` guards wired to navigation — A5

import SwiftUI

/// Active-route view — Phase A4 + A6.
///
/// Looks up `PyreonRouter` from the SwiftUI environment, calls
/// `resolveCurrentRoute()` against the route table, and renders the
/// matched component. On no-match falls back to the router's
/// `notFoundComponent` (Phase A6 wildcard-404 catch-all) when set,
/// or `EmptyView()` when not.
///
/// Render-time decision table:
///   - no router in scope     → `EmptyView()` (defensive — impossible
///     inside a properly-wired `RouterProvider`)
///   - route matches           → render the matched record's component
///   - no match + notFound set → render `notFoundComponent` (A6)
///   - no match + notFound nil → `EmptyView()` (pre-A4 fallback;
///     host's `.navigationDestination(for:)` handles routing)
@available(iOS 17.0, macOS 14.0, *)
public struct RouterView: View {
    @Environment(\.pyreonRouter) private var router: PyreonRouter?

    public init() {}

    public var body: some View {
        // Resolving against the live router triggers SwiftUI's
        // observation: when `path` (and therefore `currentPath`)
        // changes via push/replace/back, this body re-runs and the
        // matched component swaps. `routes` itself is also Observable
        // — if the host mutates the route table at runtime (rare),
        // re-resolution picks up the change too.
        if let router, let resolved = router.resolveCurrentRoute() {
            resolved.route.component()
        } else if let router, let notFound = router.notFoundComponent {
            // Phase A6: wildcard-404 catch-all. No route matched
            // currentPath; the app configured a notFoundComponent
            // (mirrors the web router's `'*'` / `(.*)` wildcard).
            notFound()
        } else {
            // Pre-A4 fallback: host's `.navigationDestination(for:)`
            // handles routing externally. Don't paint anything here.
            EmptyView()
        }
    }
}
