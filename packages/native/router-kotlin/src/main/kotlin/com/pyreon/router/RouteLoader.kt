// RouteLoader — the Compose host the compiler wraps a loader-bearing
// route's component in. Mirrors @pyreon/router's per-route `loader`:
// the loader runs ONCE when the route's content enters composition, and
// stores its result on the active router's `loaderData[path]`, where the
// already-shipped `useLoaderData<T>()` reads it.
//
// Compiler emit (Phase 3 — per-route loaders):
//   { path: '/dashboard', component: Dashboard, loader: () => fetchStats() }
//   ↓ (inside the when-dispatch / RouterView dispatch)
//   PyreonRouteLoader(path = "/dashboard", load = { fetchStats() }) {
//       Dashboard()
//   }
//
// Lifecycle note: `LaunchedEffect(path)` runs once when the content
// enters composition (and again only if `path` changes — which it never
// does for a given dispatch branch). Unlike SwiftUI's `.task`, a
// `LaunchedEffect` keyed by a stable value is NOT cancelled/restarted by
// recomposition, so no stable-host wrapping is needed (the Kotlin
// counterpart of the fetch-arc ZStack concern). The
// `loaderData.value[path] == null` guard makes the store idempotent,
// matching the web router's "loader runs once per nav".

package com.pyreon.router

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect

/**
 * Wraps a route's component, firing its `loader` once on entering
 * composition and storing the result via `router.setLoaderData(path, …)`.
 *
 * v1 scope: the [load] lambda is SYNCHRONOUS (the compiler emits a
 * zero-param, expression-body loader). Truly-async (`suspend` / `await`)
 * bodies + `ctx.params` threading are a later arc — see `RouteIR.loader`.
 */
@Composable
public fun PyreonRouteLoader(
    path: String,
    load: () -> Any?,
    content: @Composable () -> Unit,
) {
    val router = LocalPyreonRouter.current
    LaunchedEffect(path) {
        // Idempotent: only run the loader if this route has no stored
        // data yet (a recomposition must not re-run it).
        if (router != null && router.loaderData.value[path] == null) {
            router.setLoaderData(path, load())
        }
    }
    content()
}
