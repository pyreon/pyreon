// RouterProvider — top-level container that wires a PyreonRouter
// instance into the Compose tree via CompositionLocal. Matches
// @pyreon/router's `<RouterProvider router={router}>` on the web.
//
// Compiler emit (Phase B + canonical-primitives):
//   <RouterProvider router={router}>
//     <RouterView />
//   </RouterProvider>
//   ↓
//   RouterProvider(router = router) {
//     RouterView()
//   }

package com.pyreon.router

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf

/**
 * CompositionLocal carrying the active [PyreonRouter]. [useNavigate]
 * and [useParams] resolve via this Local so any Composable in the
 * tree can read the router without prop drilling — matches the
 * React/Pyreon context pattern + the SwiftUI @Environment pattern
 * on the iOS side.
 *
 * Default is `null` so a call to [useNavigate] outside any provider
 * is a safe-no-op (mirrors @pyreon/router's "no provider in scope"
 * defensive default).
 */
public val LocalPyreonRouter: androidx.compose.runtime.ProvidableCompositionLocal<PyreonRouter?> =
    compositionLocalOf { null }

/**
 * Top-level routing container. Exposes the given [PyreonRouter] via
 * [LocalPyreonRouter] so descendants can call [useNavigate] /
 * [useParams] / [PyreonLink] / [RouterView].
 *
 * Usage:
 * ```kotlin
 * @Composable
 * fun TodoApp() {
 *     val router = remember { PyreonRouter() }
 *     RouterProvider(router) {
 *         RouterView()
 *     }
 * }
 * ```
 *
 * Phase C2 (this PR) DOES NOT wrap an AndroidX `NavHost` — the
 * router exposes its path state directly. Apps that want full
 * NavHost integration (back-handler, animations, type-safe routes)
 * wrap RouterProvider's content with their own NavHost reading
 * from `router.path.value`. Phase C3+ may add a Compose-Navigation
 * adapter when real apps need it.
 */
@Composable
public fun RouterProvider(
    router: PyreonRouter,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalPyreonRouter provides router) {
        content()
    }
}
