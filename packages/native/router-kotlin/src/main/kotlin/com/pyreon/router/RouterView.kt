// RouterView — Compose counterpart to @pyreon/router's
// `<RouterView />` component. Phase C2 ships the SCAFFOLD: a
// Composable that reads the active router from the CompositionLocal
// and renders nothing visible (host wires per-path content via
// when-on-path branching or by reading `router.path.value`).
//
// Phase C2 is intentionally minimal because route definitions (the
// `routes: [...]` config the web side passes to `createRouter()`)
// are in flux on the native side. The compiler-emit shape is being
// settled per the canonical-primitives table; this scaffold is enough
// to make the symbol resolvable + the package buildable.

package com.pyreon.router

import androidx.compose.runtime.Composable

/**
 * Active-route view. Placeholder Composable for now — the host's
 * per-path branching against `router.path.value` is what actually
 * renders content. Phase C2 ships RouterView as a symbol-reachable
 * anchor so the compiler emit can reference it.
 *
 * Phase C3+ extends this with declarative route definitions matching
 * the web side's `routes: [{ path: '/users/:id', component: UserPage }, ...]`
 * shape, so the SAME source compiles to both targets.
 *
 * Usage today (manual per-path branching):
 * ```kotlin
 * @Composable
 * fun TodoApp() {
 *     val router = remember { PyreonRouter() }
 *     RouterProvider(router) {
 *         when (router.currentPath) {
 *             "/users" -> UsersPage()
 *             "/about" -> AboutPage()
 *             else -> HomePage()
 *         }
 *     }
 * }
 * ```
 */
@Composable
public fun RouterView() {
    // Placeholder — Composable that emits nothing. Once Phase C3
    // adds route definitions, this branches on the active route
    // and renders the matched component.
}
