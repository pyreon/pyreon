// RouteLoader — the SwiftUI host the compiler wraps a loader-bearing
// route's component in. Mirrors @pyreon/router's per-route `loader`:
// the loader runs ONCE when the route's view appears, and stores its
// result on the active router's `loaderData[path]`, where the
// already-shipped `useLoaderData<T>()` reads it.
//
// Compiler emit (Phase 3 — per-route loaders):
//   { path: '/dashboard', component: Dashboard, loader: () => fetchStats() }
//   ↓ (inside the navigationDestination / RouterView dispatch)
//   PyreonRouteLoader(path: "/dashboard", load: { fetchStats() }) {
//       Dashboard()
//   }
//
// Lifecycle note (the fetch-arc lesson): `.task` ties its lifetime to
// its host VIEW's identity. Here it attaches to `content()` — the route's
// concrete component view, which has STABLE identity for the duration of
// the route render (it is NOT a transparent `Group { if … }`, so SwiftUI
// does not redistribute the modifier onto a flipping branch and cancel /
// restart it). So `.task` fires exactly once on appear. The
// `loaderData[path] == nil` guard makes the store idempotent across any
// re-evaluation, matching the web router's "loader runs once per nav".

import SwiftUI

/// Wraps a route's component, firing its `loader` once on appear and
/// storing the result via `router.setLoaderData(path, …)`.
///
/// v1 scope: the `load` closure is SYNCHRONOUS (the compiler emits a
/// zero-param, expression-body loader). Truly-async `await` bodies +
/// `ctx.params` threading are a later arc — see `RouteIR.loader`.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonRouteLoader<Content: View>: View {
    @Environment(\.pyreonRouter) private var router: PyreonRouter?
    private let path: String
    private let load: () -> Any
    private let content: () -> Content

    public init(
        path: String,
        load: @escaping () -> Any,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.path = path
        self.load = load
        self.content = content
    }

    public var body: some View {
        content().task {
            // Idempotent: only run the loader if this route has no stored
            // data yet (a re-appear / re-evaluation must not re-run it).
            if let router, router.loaderData[path] == nil {
                router.setLoaderData(path, load())
            }
        }
    }
}
