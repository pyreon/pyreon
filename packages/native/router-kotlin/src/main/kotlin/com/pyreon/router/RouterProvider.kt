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

import androidx.activity.compose.BackHandler
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

/**
 * One tab of a tab-bar router (`createRouter({ tabs })`): the tab's content,
 * whose route dispatch reads [PyreonRouter.tabTop] for THIS tab, so a hidden
 * tab keeps showing its own page while another tab navigates.
 *
 * It also owns the system Back for the tab while the tab is active — the
 * Navigation-Compose multiple-back-stacks convention: Back pops the active
 * tab's own stack first; at that tab's root it returns to the FIRST tab (the
 * start destination); on the first tab's root it is left to the system, which
 * leaves the app. Inactive tabs register a disabled handler, so exactly one
 * tab answers.
 */
@Composable
public fun PyreonTabStack(
    router: PyreonRouter,
    tab: String,
    content: @Composable () -> Unit,
) {
    val active = router.activeTab.value == tab
    val stack = router.tabPath(tab)
    val first = router.tabs.firstOrNull()?.name
    BackHandler(enabled = active && (stack.isNotEmpty() || (first != null && tab != first))) {
        if (router.tabPath(tab).isNotEmpty()) {
            router.back()
        } else if (first != null) {
            router.selectTab(first)
        }
    }
    content()
}
