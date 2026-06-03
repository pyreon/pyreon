// RouterView — Compose counterpart to @pyreon/router's
// `<RouterView />` component.
//
// Phase A4 (route-table dispatcher): RouterView renders the matched
// component when the path matches an entry in `routes`.
// Phase A4.5 (nested routes): RouterView reads [LocalRouterDepth] to
// know which level of the matched chain to render. Top-of-tree
// `RouterView()` has depth 0 (renders the outermost layout / leaf).
// Nested `RouterView()` inside a layout body reads depth 1 (renders
// the child of that layout). Depth increments AUTOMATICALLY:
// RouterView wraps the invoked component with
// `CompositionLocalProvider(LocalRouterDepth provides depth + 1)`.
// Phase A6 (wildcard-404): when no chain matches AND the router has a
// `notFoundComponent`, render that as the depth-0 fallback.

package com.pyreon.router

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * Active-route view — Phase A4 + A4.5 + A6.
 *
 * Looks up [PyreonRouter] from the CompositionLocal, calls
 * [PyreonRouter.resolveCurrentChain] against the route table, and
 * renders the chain entry at the current [LocalRouterDepth] level.
 *
 * Render-time decision table:
 *   - no router in scope            → no-op (defensive)
 *   - chain matches + depth in range → invoke `chain[depth].first.component()`
 *     wrapped in `CompositionLocalProvider(LocalRouterDepth provides
 *     depth + 1)` so nested `RouterView()` calls inside automatically
 *     pick up the next chain entry.
 *   - chain matches + depth out-of-range → no-op (leaf at bottom of
 *     chain that doesn't include its own `RouterView()`)
 *   - no chain match + notFoundComponent set → render notFoundComponent
 *     (A6 wildcard-404; always at depth 0)
 *   - no chain match + null → no-op (pre-A4 fallback; manual when-dispatch)
 *
 * Usage (with nested routes — A4.5 idiom):
 * ```kotlin
 * @Composable
 * fun App() {
 *     val router = remember { PyreonRouter(routes = listOf(
 *         RouteRecord("/app", children = listOf(
 *             RouteRecord("/app/dashboard") { Dashboard() },
 *             RouteRecord("/app/profile") { Profile() },
 *         )) { AppLayout() },
 *     )) }
 *     RouterProvider(router) { RouterView() }
 * }
 *
 * @Composable
 * fun AppLayout() {
 *     Column { Header(); RouterView(); Footer() }  // inner renders the child
 * }
 * ```
 *
 * Usage (flat routes — A4 idiom, still works):
 * ```kotlin
 * RouteRecord("/users/:id") { UserPage() }
 * ```
 *
 * Usage (pre-A4 manual dispatch, still supported via no-routes fallback):
 * ```kotlin
 * RouterProvider(router) {
 *     when (router.currentPath) {
 *         "/about" -> AboutPage()
 *         else -> HomePage()
 *     }
 * }
 * ```
 */
@Composable
public fun RouterView() {
    val router = LocalPyreonRouter.current ?: return
    val depth = LocalRouterDepth.current
    val chain = router.resolveCurrentChain()
    if (chain != null) {
        if (depth < chain.size) {
            // Phase A4.5: invoke this depth's component and increment
            // LocalRouterDepth in its composition so any nested
            // RouterView() renders chain[depth+1].
            CompositionLocalProvider(LocalRouterDepth provides depth + 1) {
                chain[depth].first.component()
            }
        }
        // depth out-of-range → no-op (no more chain levels)
        return
    }
    // Phase A6: wildcard-404 catch-all. No route chain matched currentPath;
    // if the app configured a notFoundComponent, render it (mirrors
    // the web router's `'*'` / `(.*)` wildcard). Always at depth 0 —
    // 404 isn't a chain.
    router.notFoundComponent.value?.invoke()
}
