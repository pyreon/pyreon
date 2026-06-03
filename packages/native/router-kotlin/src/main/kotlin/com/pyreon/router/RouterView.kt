// RouterView — Compose counterpart to @pyreon/router's
// `<RouterView />` component.
//
// Phase A4 (native readiness audit, 2026-06 — closes CRIT-2 partial):
// RouterView now renders the route table dispatcher's matched component
// instead of the pre-A4 no-op. The router's `resolveCurrentRoute()`
// walks `routes` in declaration order, picks the first match, and
// returns the matching record. RouterView pulls the Composable from
// that record and invokes it.
//
// Backward-compat: if the active router has NO routes configured (the
// pre-A4 shape where the host writes a `when (router.currentPath)`
// dispatcher in its own code), RouterView emits nothing — the host's
// branching is the source of truth.
//
// Out of scope (separate follow-up PRs):
//   - Nested-route depth indexing (`RouteRecord.children` + per-depth
//     `<RouterView />`) — A4.5
//   - Per-route `beforeEnter` guards wired to navigation — A5
//   - Wildcard-404 catch-all + `notFoundComponent` — A6

package com.pyreon.router

import androidx.compose.runtime.Composable

/**
 * Active-route view — Phase A4.
 *
 * Looks up [PyreonRouter] from the CompositionLocal, calls
 * [PyreonRouter.resolveCurrentRoute] against the route table, and
 * invokes the matched component. Falls through to no-op when:
 *   - no [PyreonRouter] is in scope (impossible inside a properly-wired
 *     [RouterProvider]; defensive default)
 *   - the router has no `routes` configured (backward-compat for
 *     pre-A4 apps using manual `when (router.currentPath)` dispatch)
 *   - no route matches the current path (wildcard-404 is A6 work)
 *
 * Usage (with route table, A4 idiom):
 * ```kotlin
 * @Composable
 * fun TodoApp() {
 *     val router = remember {
 *         PyreonRouter(routes = listOf(
 *             RouteRecord("/") { HomePage() },
 *             RouteRecord("/users/:id") { UserPage() },
 *             RouteRecord("/about") { AboutPage() },
 *         ))
 *     }
 *     RouterProvider(router) { RouterView() }
 * }
 * ```
 *
 * Usage (pre-A4 manual dispatch, still supported via no-routes fallback):
 * ```kotlin
 * @Composable
 * fun TodoApp() {
 *     val router = remember { PyreonRouter() }
 *     RouterProvider(router) {
 *         when (router.currentPath) {
 *             "/about" -> AboutPage()
 *             else -> HomePage()
 *         }
 *     }
 * }
 * ```
 */
@Composable
public fun RouterView() {
    val router = LocalPyreonRouter.current ?: return
    // Reading the routes signal + currentPath inside this Composable
    // means a navigation OR a routes-table mutation triggers
    // recomposition. The route's component is then invoked fresh.
    val resolved = router.resolveCurrentRoute() ?: return
    resolved.first.component()
}
