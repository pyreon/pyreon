// PyreonRouter — Compose-aware router instance matching @pyreon/router's
// shape. The web side carries a `Router` class with `currentRoute`
// (signal), `push(path)`, `replace(path)`, `back()`, `forward()`,
// `params` (computed from the active route), `query` (typed search
// params). This file mirrors that surface for Compose.
//
// Phase C2 (this PR) is the SCAFFOLD: the class + the minimum surface
// the compiler-emitted Kotlin will reference. Real route definitions,
// loader handling, guards, transitions, lazy components — those land
// in later PRs as the real-app TodoMVC + counter examples surface
// concrete needs.
//
// Implementation note: PyreonRouter keeps its own MutableState<List<String>>
// stack rather than wrapping AndroidX Navigation's NavController. Two
// reasons:
//   1. PARITY — the web router carries a plain reactive path-array;
//      the Swift router carries an @Observable path-array. Keeping the
//      Kotlin side symmetric makes the cross-platform reasoning trivial.
//   2. NO ANDROID-SDK DEPENDENCY — the runtime package intentionally
//      doesn't depend on AndroidX so it can typecheck without an
//      Android SDK install. Apps that want NavHost integration can wrap
//      the router's path state into a NavController in their host code.
//
// API parity with @pyreon/router's `Router` class:
// - `currentPath` ← `router.currentRoute().path`
// - `push(_:)`    ← `router.push(path)`
// - `replace(_:)` ← `router.replace(path)`
// - `back()`      ← `router.back()`
// - `params`      ← `useParams()`

package com.pyreon.router

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Routing model. Holds a reactive path stack as `MutableState<List<String>>`
 * so Compose observers (and the [RouterProvider] wrapper) recompose when
 * the stack changes.
 *
 * API parity with [@pyreon/router]'s `Router` class:
 *
 * | Web                                       | Kotlin                       |
 * | ----------------------------------------- | ---------------------------- |
 * | `router.currentRoute().path`              | `router.currentPath`         |
 * | `router.push(path)`                       | `router.push(path)`          |
 * | `router.replace(path)`                    | `router.replace(path)`       |
 * | `router.back()`                           | `router.back()`              |
 * | `router.reset()`                          | `router.reset()`             |
 */
public class PyreonRouter(initialPath: List<String> = emptyList()) {
    /**
     * Reactive path stack. Drives the host's NavHost / when-on-path
     * branching. Compose observers recompose when this changes.
     */
    public val path: MutableState<List<String>> = mutableStateOf(initialPath)

    /** Path parameter map for the current route. Phase C2 ships SCAFFOLD — empty
     *  by default; real pattern-matching against route definitions lands in
     *  follow-up PRs. The compiler-emitted Kotlin references `router.params["id"]`
     *  so the symbol must exist now even with no-op behaviour. */
    public val params: MutableState<Map<String, String>> = mutableStateOf(emptyMap())

    /** Top-of-stack path. Mirrors `router.currentRoute().path` on the web side. */
    public val currentPath: String
        get() = path.value.lastOrNull() ?: "/"

    /** Push a new path onto the stack. Matches `router.push(path)` on the web side. */
    public fun push(path: String) {
        this.path.value = this.path.value + path
    }

    /**
     * Replace the top-of-stack path. Matches `router.replace(path)`
     * on the web side — useful for auth redirects so the previous
     * page isn't in the back stack.
     */
    public fun replace(path: String) {
        val current = this.path.value
        this.path.value = if (current.isEmpty()) {
            listOf(path)
        } else {
            current.dropLast(1) + path
        }
    }

    /**
     * Pop the top-of-stack path. Matches `router.back()` on the web
     * side. No-op if the stack is empty (the host's root view has
     * nothing to pop to).
     */
    public fun back() {
        val current = this.path.value
        if (current.isEmpty()) return
        this.path.value = current.dropLast(1)
    }

    /**
     * Clear the entire path stack — navigates back to the root view.
     * Matches the web-side pattern of `router.replace('/')` for
     * "logout / forget everything".
     */
    public fun reset() {
        this.path.value = emptyList()
    }
}
