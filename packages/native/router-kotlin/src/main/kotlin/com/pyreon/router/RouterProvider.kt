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
 * It does not wrap an AndroidX `NavHost` — the router exposes its
 * path state directly — but it does own the system Back: Back pops
 * the router's stack while there is one, and is left to the system
 * at the root.
 */
@Composable
public fun RouterProvider(
    router: PyreonRouter,
    content: @Composable () -> Unit,
) {
    // The system Back pops the router's stack, as the iOS navigation bar's back button does. Without it, Back on any
    // pushed page left the app (the activity's default), so a user could never step back through a Pyreon app on
    // Android. At the root it stays disabled and the system handles Back. A tab-bar router's stacks are popped by
    // each tab's own handler (RouterTabContent), so this one stays out of it.
    BackHandler(enabled = router.tabs.isEmpty() && router.path.value.isNotEmpty()) {
        router.back()
    }
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
