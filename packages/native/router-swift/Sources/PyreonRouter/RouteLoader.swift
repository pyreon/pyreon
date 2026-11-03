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
// The component renders only once its data EXISTS. On the web a route's
// loader runs before the component mounts, so `useLoaderData()` is never
// empty and an `onMount` reads real data. Here the loader runs on appear, so
// rendering the component first would hand it one frame with no data — and
// the compiler lowers `useLoaderData<T>()` to a NON-optional read (the web
// type), which would trap. Holding the content back until `loaderData[path]`
// is set restores the web order: data, then mount.
//
// Lifecycle note (the fetch-arc lesson): `.task` ties its lifetime to its
// host VIEW's identity, so it attaches to a concrete `ZStack`, not to the
// `if` inside it — a transparent conditional would let SwiftUI move the
// modifier onto the branch and cancel / restart it when the data arrives.
// The `loaderData[path] == nil` guard keeps the store idempotent across any
// re-evaluation, matching the web router's "loader runs once per nav".

import SwiftUI

/// Wraps a route's component, firing its `loader` once on appear and
/// storing the result via `router.setLoaderData(path, …)`. The component
/// renders once that data exists.
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
        ZStack {
            if router?.loaderData[path] != nil {
                content()
            }
        }
        .task {
            // Idempotent: only run the loader if this route has no stored
            // data yet (a re-appear / re-evaluation must not re-run it).
            if let router, router.loaderData[path] == nil {
                router.setLoaderData(path, load())
            }
        }
    }
}
