// RouterView — the SwiftUI counterpart to @pyreon/router's
// `<RouterView />` component. Phase C1 ships the SCAFFOLD: a view that
// reads the active router from the environment and renders whatever
// content the host wires up via `.navigationDestination(for:)`.
//
// Phase C1 is intentionally minimal because route definitions (the
// `routes: [...]` config the web side passes to `createRouter()`) are
// in flux on the native side. The compiler-emit shape is being settled
// per the canonical-primitives table; this scaffold is enough to make
// the symbol resolvable + the package buildable.
//
// The host app's NavigationStack content is the source of truth for
// what each path renders to. RouterView itself is just a placeholder
// — the real per-route rendering lives in
// `.navigationDestination(for: String.self) { path in ... }` modifiers
// the host wires up.

import SwiftUI

/// Active-route view. Placeholder content for now — the host's
/// `.navigationDestination(for:)` modifier on the parent NavigationStack
/// is what actually renders per-path content. Phase C1 ships RouterView
/// as a symbol-reachable namespace anchor so the compiler emit can
/// reference it.
///
/// Phase C2+ extends this with declarative route definitions matching
/// the web side's `routes: [{ path: '/users/:id', component: UserPage }, ...]`
/// shape, so the SAME source compiles to both targets.
@available(iOS 17.0, macOS 14.0, *)
public struct RouterView: View {
    public init() {}

    public var body: some View {
        // EmptyView so the placeholder doesn't render anything visible.
        // The host's NavigationStack-level `.navigationDestination(for:)`
        // modifier is what actually paints per-path content.
        EmptyView()
    }
}
