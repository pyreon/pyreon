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

    /** Phase 3 (loaders) — per-route loaded data, keyed by full path. A
     *  route's loader stores its result here on navigation; `useLoaderData()`
     *  reads the current path's entry. Type-erased (`Any?`) because payloads
     *  are per-route. Empty until a loader harness populates it (the harness
     *  emit is a follow-up — this is the runtime contract it targets). */
    public val loaderData: MutableState<Map<String, Any?>> = mutableStateOf(emptyMap())

    /** Top-of-stack path. Mirrors `router.currentRoute().path` on the web side. */
    public val currentPath: String
        get() = path.value.lastOrNull() ?: "/"

    /** Store a route's loaded data under its path. Called by the compiler's
     *  loader harness; idempotent overwrite. Mutating `loaderData` triggers
     *  Compose recomposition for observers reading `useLoaderData()`.
     *
     *  Round-1 audit fix: applies an LRU bound (cap = `MAX_LOADER_ENTRIES`,
     *  matches the web router's prefetch-cache convention) to prevent
     *  unbounded growth across many navigations. Pre-fix the map grew
     *  monotonically — every visited path retained its loader payload
     *  forever, anti-pattern Class C (unbounded cache).
     *
     *  Update semantics: re-storing an existing key NEVER evicts (it's
     *  an in-place value swap, not a fresh insertion). Eviction only
     *  fires when adding a NEW key would exceed the cap — the oldest
     *  entry (the `+` operator on a `mapOf`-backed Map preserves
     *  insertion order via the default LinkedHashMap impl) is dropped. */
    public fun setLoaderData(path: String, value: Any?) {
        val current = loaderData.value
        if (path !in current && current.size >= MAX_LOADER_ENTRIES) {
            val oldest = current.keys.first()
            loaderData.value = current.filterKeys { it != oldest } + (path to value)
        } else {
            loaderData.value = current + (path to value)
        }
    }

    /** Global router-level guards (`beforeEach: [fn]` on createRouter).
     *  Each is `(path: String) -> Boolean` — return `false` to BLOCK
     *  the navigation. Chains: if ANY guard returns false, the
     *  navigation is dropped. Runs BEFORE `push`/`replace` mutates
     *  the path. PMTC-emitted apps configure these from
     *  `createRouter({ beforeEach: [authGuard, logGuard] })` config. */
    public val beforeEachGuards: MutableList<(String) -> Boolean> = mutableListOf()

    /** Global router-level afterEach hooks (`afterEach: [fn]` on
     *  createRouter). Each is `(path: String) -> Unit` — runs AFTER
     *  the path commits. Fan-out (no short-circuit); side effects
     *  only. Typical use: analytics, page-view logging. */
    public val afterEachHooks: MutableList<(String) -> Unit> = mutableListOf()

    /** Re-entry flag for the redirect pattern. When a beforeEach
     *  guard calls `router.replace("/login")` (the canonical "throw
     *  redirect" shape on native — see `redirect(_)` below), the
     *  inner replace would otherwise re-run the guard chain and
     *  recurse infinitely. `_inGuard` is set true while a guard
     *  chain is running; any nested push/replace SKIPS its own
     *  guard chain (and afterEach fan-out — fired by the outer
     *  level). */
    private var _inGuard: Boolean = false

    /** Run the beforeEach chain against `candidate`; any false →
     *  navigation BLOCKED. Returns true iff every guard allowed.
     *  Sets `_inGuard` so router.replace/redirect calls from inside
     *  a guard don't recurse through the chain. */
    private fun allowNavigation(candidate: String): Boolean {
        _inGuard = true
        try {
            for (guardFn in beforeEachGuards) {
                if (!guardFn(candidate)) return false
            }
            return true
        } finally {
            _inGuard = false
        }
    }

    /** Push a new path onto the stack. Matches `router.push(path)` on the web side.
     *
     *  Round-2 follow-up: chains `beforeEachGuards` (any false →
     *  no-op) before the path mutation, fans out `afterEachHooks`
     *  after the commit. Nested push/replace from inside a guard
     *  (the redirect pattern) skips the guard chain via `_inGuard`. */
    public fun push(path: String) {
        if (_inGuard) {
            // Re-entry from a guard's redirect — bypass the guard
            // chain (guard is the active gate) AND the afterEach
            // fan-out (the outer level fires it).
            this.path.value = this.path.value + path
            return
        }
        if (!allowNavigation(path)) return
        this.path.value = this.path.value + path
        for (hook in afterEachHooks) hook(path)
    }

    /**
     * Replace the top-of-stack path. Matches `router.replace(path)`
     * on the web side — useful for auth redirects so the previous
     * page isn't in the back stack.
     *
     * Round-2 follow-up: same guard chain as `push`. Re-entry-safe
     * for the redirect pattern (`router.replace("/login")` from
     * inside a beforeEach guard).
     */
    public fun replace(path: String) {
        if (_inGuard) {
            // Re-entry from a guard's redirect — skip the chain.
            val current = this.path.value
            this.path.value = if (current.isEmpty()) {
                listOf(path)
            } else {
                current.dropLast(1) + path
            }
            return
        }
        if (!allowNavigation(path)) return
        val current = this.path.value
        this.path.value = if (current.isEmpty()) {
            listOf(path)
        } else {
            current.dropLast(1) + path
        }
        for (hook in afterEachHooks) hook(path)
    }

    /** "Throw redirect" — the canonical native equivalent of the web
     *  router's `throw redirect("/login")` pattern. A beforeEach
     *  guard that wants to redirect (vs just block) calls
     *  `router.redirect("/login")` then returns `false`:
     *
     *      router.beforeEachGuards.add { path ->
     *          if (!isAuthed() && path != "/login") {
     *              router.redirect("/login")
     *              false  // block the current navigation
     *          } else {
     *              true
     *          }
     *      }
     *
     *  Thin wrapper around `replace`; the `_inGuard` flag breaks
     *  the recursion so the inner replace doesn't re-run the guard
     *  chain (which would block the redirect itself). */
    public fun redirect(path: String) {
        // Delegate to replace. When called from inside a guard,
        // `_inGuard` is true → the inner replace skips its own
        // chain. When called from outside, behaves identically to
        // `replace`.
        this.replace(path)
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

    public companion object {
        /** Round-1 audit fix: LRU bound for `loaderData`. 50 mirrors the
         *  web router's prefetch-cache cap — empirically large enough
         *  for normal app navigation patterns (tab-bar apps, deep flows)
         *  without retaining hundreds of stale payloads. */
        public const val MAX_LOADER_ENTRIES: Int = 50

        /**
         * R1.2 — match an incoming path against a pattern, extracting
         * named params. Returns the params map on match, null on miss.
         *
         * Mirrors @pyreon/router's `match.ts` algorithm AND the Swift
         * runtime's `PyreonRouter.matchPath`. The compiler emits calls
         * to this helper from inside the `when`-dispatch block when
         * a route's path contains a `:param` segment.
         *
         * Examples:
         *   matchPath("/users/123", "/users/:id")     → mapOf("id" to "123")
         *   matchPath("/posts/abc/edit", "/posts/:slug/edit") → mapOf("slug" to "abc")
         *   matchPath("/users/123", "/posts/:id")     → null
         *   matchPath("/blog/2026/may", "/blog/:rest*") → mapOf("rest" to "2026/may")
         *   matchPath("/about/", "/about")            → emptyMap() (trailing slash ignored)
         *
         * Semantics (mirrors @pyreon/router's `match.ts` AND the Swift
         * runtime's matchPath):
         *   - empty segments filtered → leading/trailing slashes tolerated
         *   - `:name` captures one segment
         *   - `:name*` (splat / catch-all) captures the remaining tail joined
         *     by "/"; must be the last pattern segment; matches one-or-more
         *     trailing segments (web parity: pathLen >= segCount)
         *   - `:name?` (optional) — a TRAILING optional segment may be omitted
         *     by the path (`/users/:id?` matches both `/users` and `/users/7`)
         *   - non-splat / non-optional patterns require an exact segment count
         */
        public fun matchPath(path: String, pattern: String): Map<String, String>? {
            // Filter empty segments → leading/trailing slashes ignored, same
            // as the web router's `.split('/').filter(Boolean)`.
            val pathParts = path.split("/").filter { it.isNotEmpty() }
            val patternParts = pattern.split("/").filter { it.isNotEmpty() }
            val params = mutableMapOf<String, String>()
            for (i in patternParts.indices) {
                val patternSeg = patternParts[i]
                // Splat / catch-all `:name*` — captures the remaining tail.
                if (patternSeg.startsWith(":") && patternSeg.endsWith("*")) {
                    val name = patternSeg.substring(1, patternSeg.length - 1)
                    // One-or-more: the splat position must have a segment.
                    if (i >= pathParts.size) return null
                    params[name] = pathParts.subList(i, pathParts.size).joinToString("/")
                    return params
                }
                val isOptional = patternSeg.startsWith(":") && patternSeg.endsWith("?")
                // Path exhausted at this index — OK only if optional (and so
                // is every remaining segment, hitting this same branch).
                if (i >= pathParts.size) {
                    if (isOptional) continue
                    return null
                }
                val pathSeg = pathParts[i]
                if (patternSeg.startsWith(":")) {
                    val name =
                        if (isOptional) patternSeg.substring(1, patternSeg.length - 1)
                        else patternSeg.substring(1)
                    params[name] = pathSeg
                } else if (pathSeg != patternSeg) {
                    return null
                }
            }
            // The path may be SHORTER than the pattern only when the missing
            // tail was all optional; it must never be LONGER.
            if (pathParts.size > patternParts.size) return null
            return params
        }
    }
}
