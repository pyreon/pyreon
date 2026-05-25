// Link — declarative navigation matching @pyreon/router's
// `<Link to="/path">Label</Link>` component.
//
// Compiler emit:
//   <Link to="/users/123">Profile</Link>
//   ↓
//   PyreonLink("/users/123") { Text("Profile") }
//
// Named `PyreonLink` (mirroring the Swift side's choice) so the
// compiler emits a stable, unambiguous identifier regardless of what
// other `Link` types the host imports.
//
// Phase C2 ships the SCAFFOLD: a Composable that exposes the navigate
// action as a parameter to the content lambda. The host wraps that
// action in their preferred clickable surface (Box(Modifier.clickable),
// Material Surface, Button, etc.) — keeps this package free of
// androidx.compose.foundation / .material deps so it typechecks against
// the minimal kotlinc stubs without an Android SDK install.
//
// The caller-wraps-clickable shape is the Compose-idiomatic answer
// for libraries that want to stay Material-agnostic. Real apps can
// use the higher-level `Material PyreonLink` wrapper (separate
// follow-up module) that pre-wraps the click action in a Material
// `Surface` for ergonomics.

package com.pyreon.router

import androidx.compose.runtime.Composable

/**
 * Declarative navigation. Calls the [content] lambda with a `navigate`
 * action — host wraps it in their preferred clickable surface.
 *
 * Usage with Compose Foundation:
 * ```kotlin
 * PyreonLink("/users/123") { navigate ->
 *     Box(Modifier.clickable { navigate() }) {
 *         Text("View Profile")
 *     }
 * }
 * ```
 *
 * Usage with Material:
 * ```kotlin
 * PyreonLink("/users/123") { navigate ->
 *     Button(onClick = navigate) { Text("View Profile") }
 * }
 * ```
 *
 * Equivalent to `@pyreon/router`'s `<Link to="/users/123">View Profile</Link>`.
 * The web/iOS sides ship simpler one-arg-content surfaces because their
 * platforms have a canonical clickable wrapper (HTML `<a>`, SwiftUI
 * `Button`); Compose's foundation-vs-material split makes
 * caller-wraps-clickable the cleaner shape here.
 */
@Composable
public fun PyreonLink(
    to: String,
    content: @Composable (navigate: () -> Unit) -> Unit,
) {
    val router = LocalPyreonRouter.current
    content { router?.push(to) }
}
