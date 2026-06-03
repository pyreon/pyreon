// RouterView — the SwiftUI counterpart to @pyreon/router's
// `<RouterView />` component.
//
// Phase A4 (route-table dispatcher): RouterView renders the matched
// component when the path matches an entry in `routes`.
// Phase A4.5 (nested routes): RouterView reads `@Environment(\.routerDepth)`
// to know which level of the matched chain to render. Top-of-tree
// `<RouterView />` has depth 0 (renders the outermost layout / leaf).
// Nested `<RouterView />` inside a layout body reads depth 1 (renders
// the child of that layout). Depth increments AUTOMATICALLY: RouterView
// wraps the invoked component with `.environment(\.routerDepth, depth + 1)`.
// Phase A6 (wildcard-404): when no chain matches AND the router has a
// `notFoundComponent`, render that as the depth-0 fallback.
//
// Backward-compat: if the active router has NO routes AND no
// notFoundComponent (pre-A4 shape, where the host wires its own
// `.navigationDestination(for:)`), RouterView emits `EmptyView()`.

import SwiftUI

/// Active-route view — Phase A4 + A4.5 + A6.
///
/// Render-time decision table:
///   - no router in scope            → `EmptyView()` (defensive — impossible
///     inside a properly-wired `RouterProvider`)
///   - chain matches + depth in range → render `chain[depth].route.component()`
///     with `.environment(\.routerDepth, depth + 1)` so descendant
///     `<RouterView />` instances inside the rendered component pick
///     up the next chain entry automatically.
///   - chain matches + depth out-of-range → render `EmptyView()` (no
///     more chain levels to descend into; the common case for a leaf
///     at the bottom that doesn't include its own `<RouterView />`).
///   - no chain match + notFound set → render `notFoundComponent` (A6)
///   - no chain match + notFound nil → `EmptyView()` (pre-A4 fallback;
///     host's `.navigationDestination(for:)` handles routing)
@available(iOS 17.0, macOS 14.0, *)
public struct RouterView: View {
    @Environment(\.pyreonRouter) private var router: PyreonRouter?
    @Environment(\.routerDepth) private var depth: Int

    public init() {}

    public var body: some View {
        // Reading routes + currentPath via resolveCurrentChain triggers
        // SwiftUI's observation: navigation OR routes-table mutation
        // causes this body to re-evaluate, swapping components.
        if let router, let chain = router.resolveCurrentChain() {
            if depth < chain.count {
                // Phase A4.5: invoke this depth's component and
                // increment routerDepth in its environment so any
                // nested `<RouterView />` inside renders chain[depth+1].
                chain[depth].route.component()
                    .environment(\.routerDepth, depth + 1)
            } else {
                // Depth out of chain — common case for a leaf at the
                // bottom that doesn't include its own <RouterView />.
                EmptyView()
            }
        } else if let router, let notFound = router.notFoundComponent {
            // Phase A6: wildcard-404 catch-all. No route chain matched
            // currentPath; the app configured a notFoundComponent
            // (mirrors the web router's `'*'` / `(.*)` wildcard).
            // Always rendered at depth 0 — 404 isn't a chain.
            notFound()
        } else {
            // Pre-A4 fallback: host's `.navigationDestination(for:)`
            // handles routing externally. Don't paint anything here.
            EmptyView()
        }
    }
}
