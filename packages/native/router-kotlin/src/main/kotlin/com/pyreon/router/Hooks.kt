// Hooks — programmatic navigation + param-reading entry points.
// Match @pyreon/router's `useNavigate()` / `useParams()` hooks on web.
//
// Compiler emit:
//   const navigate = useNavigate()
//   navigate('/login')
//   ↓
//   val navigate = useNavigate()
//   navigate("/login")
//
//   const { id } = useParams<{ id: string }>()
//   ↓
//   val params = useParams()
//   val id = params["id"] ?: ""
//
// Implemented as @Composable functions that read [LocalPyreonRouter]
// — the canonical Compose pattern for hook-like helpers that depend
// on a CompositionLocal. Matches React/SwiftUI hook ergonomics from
// the consumer's POV.

package com.pyreon.router

import androidx.compose.runtime.Composable

/**
 * Programmatic navigation — returns a closure that pushes a path
 * onto the active router's stack. Mirrors `@pyreon/router`'s
 * `useNavigate()` hook.
 *
 * Usage (inside a Composable):
 * ```kotlin
 * @Composable
 * fun LoginButton() {
 *     val navigate = useNavigate()
 *     Button(onClick = { navigate("/dashboard") }) {
 *         Text("Log in")
 *     }
 * }
 * ```
 *
 * The compiler emit produces the equivalent shape from a JSX source:
 * ```tsx
 * const navigate = useNavigate()
 * <Button onPress={() => navigate('/dashboard')}>Log in</Button>
 * ```
 *
 * Returns a safe-no-op closure if called outside a [RouterProvider]
 * tree — matches the web side's defensive default for missing-provider.
 */
@Composable
public fun useNavigate(): (String) -> Unit {
    val router = LocalPyreonRouter.current
    return { path -> router?.push(path) }
}

/**
 * Read path parameters for the current route. Mirrors
 * `@pyreon/router`'s `useParams()` hook.
 *
 * Phase C2 ships SCAFFOLD: returns the active router's `params`
 * dictionary directly. Real pattern-matching against route
 * definitions lands in Phase C3+ once route configs settle.
 *
 * Returns an empty map if called outside a [RouterProvider] tree —
 * matches the web side's defensive default.
 */
@Composable
public fun useParams(): Map<String, String> {
    val router = LocalPyreonRouter.current
    return router?.params?.value ?: emptyMap()
}
