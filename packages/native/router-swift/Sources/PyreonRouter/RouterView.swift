// RouterView — the SwiftUI counterpart to @pyreon/router's
// `<RouterView />` component.
//
// Phase A4 (native readiness audit, 2026-06 — closes CRIT-2 partial):
// RouterView now renders the route table dispatcher's matched component
// instead of the pre-A4 `EmptyView()` no-op. The router's
// `resolveCurrentRoute()` walks `routes` in declaration order, picks
// the first match, and returns the matching record. RouterView pulls
// the component from that record and renders it.
//
// Backward-compat: if the active router has NO routes configured (the
// pre-A4 shape, where the host wires its own `.navigationDestination(for:)`
// on the parent NavigationStack), RouterView still emits `EmptyView()`
// — the host's destination handler is the source of truth.
//
// Out of scope (separate follow-up PRs):
//   - Nested-route depth indexing (`RouteRecord.children` + per-depth
//     `<RouterView />`) — A4.5
//   - Per-route `beforeEnter` guards wired to navigation — A5
//   - Wildcard-404 catch-all + `notFoundComponent` — A6

import SwiftUI

/// Active-route view — Phase A4.
///
/// Looks up `PyreonRouter` from the SwiftUI environment, calls
/// `resolveCurrentRoute()` against the route table, and renders the
/// matched component. Falls through to `EmptyView()` when:
///   - no `PyreonRouter` is in scope (impossible inside a properly-wired
///     `RouterProvider`; defensive default)
///   - the router has no `routes` configured (backward-compat for
///     pre-A4 apps using `.navigationDestination(for:)` manually)
///   - no route matches the current path (wildcard-404 is A6 work)
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
        } else {
            // Pre-A4 fallback: host's `.navigationDestination(for:)`
            // handles routing externally. Don't paint anything here.
            EmptyView()
        }
    }
}
