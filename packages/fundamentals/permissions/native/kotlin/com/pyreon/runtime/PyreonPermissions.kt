// PyreonPermissions — the Compose side of Pyreon's cross-platform
// authorization story (Phase 4). Mirrors the core `@pyreon/permissions`
// surface and the Swift `PyreonPermissions` one-for-one.
//
// ## What this delivers
//
// A reactive permission set (Compose `MutableState`, read `.value`) with
// the RBAC/feature-flag checks `@pyreon/permissions` exposes:
//
//     can("posts.edit")  // exact or wildcard match
//     cannot("posts.edit")
//     all("a", "b")      // every key granted
//     any("a", "b")      // at least one granted
//
// plus `set` / `grant` / `revoke`. A granted `"posts.*"` matches any
// `"posts.<X>"` (segment-prefix wildcard).
//
// ## Scope — pure-logic state container
//
// No platform API, no schema libs, no Android-SDK dependency — the
// already-framework-agnostic `@pyreon/permissions` logic ported as a
// reactive native container. Coroutine-free, unit-testable synchronously.
// The `usePermissions` / `<Can>` compiler emit builds on this contract in
// a follow-up (the PyreonFetch / PyreonForm per-service-port pattern).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Reactive permission set — the Compose half of `usePermissions`.
 * Exposes `granted` as Compose `MutableState` (read `.value`).
 */
public class PyreonPermissions(granted: Set<String> = emptySet()) {
    /**
     * Currently-granted permission keys — exact, plus the three wildcard
     * forms `"x.*"` (one segment), `"x.**"` (any depth) and `"*"`.
     */
    public val granted: MutableState<Set<String>> = mutableStateOf(granted)

    /**
     * Resolve [key] against the granted set, in the SAME order the web
     * resolver uses: exact → one-segment wildcard → recursive wildcard
     * (most-specific ancestor first) → global.
     *
     * The previous implementation matched any `"prefix.*"` entry with a
     * bare `startsWith`, which made `.*` behave like the web's `.**`:
     * granting `"posts.*"` also granted `"posts.comments.edit"`, a key
     * the web DENIES. That is the wrong direction for a permission check
     * — the same source granted more on device than in the browser. It
     * also recognised neither `.**` nor `*`, so the two wildcards that
     * SHOULD widen a grant were silently ignored.
     */
    public fun can(key: String): Boolean {
        val keys = granted.value
        // 1. Exact match.
        if (keys.contains(key)) return true

        val dot = key.lastIndexOf('.')
        if (dot != -1) {
            val parent = key.substring(0, dot)
            // 2. One-segment wildcard — "posts.*" covers "posts.edit" but
            //    NOT "posts.comments.edit".
            if (keys.contains("$parent.*")) return true
            // 3. Recursive wildcard, most-specific ancestor first:
            //    "posts.admin.delete" tries "posts.admin.**" then "posts.**".
            var ancestor = parent
            while (true) {
                if (keys.contains("$ancestor.**")) return true
                val i = ancestor.lastIndexOf('.')
                if (i == -1) break
                ancestor = ancestor.substring(0, i)
            }
        }

        // 4. Global wildcard — any key, any depth.
        return keys.contains("*")
    }

    /** Inverse of [can]. */
    public fun cannot(key: String): Boolean = !can(key)

    /**
     * Web-API-parity inverse — `@pyreon/permissions` exposes
     * `can.not("posts.delete")`, so the SAME source must compile
     * against this port unchanged. A NON-operator member named `not`
     * is legal Kotlin (the unary `operator fun not()` has a different
     * signature); `cannot` stays as the Kotlin-flavored alias.
     */
    public fun not(key: String): Boolean = !can(key)

    /** True when every [keys] is granted. */
    public fun all(vararg keys: String): Boolean = keys.all { can(it) }

    /** True when at least one of [keys] is granted. */
    public fun any(vararg keys: String): Boolean = keys.any { can(it) }

    /**
     * Operator overload enabling the callable shape the web
     * `@pyreon/permissions` API uses: `can("posts.edit")` instead of
     * `can.can("posts.edit")`. Mirror of the PyreonMachine `m()`
     * pattern. Closes Gap 4's "partial A — `.can(...)` lowering needs
     * work" item by making the web's idiomatic callable shape work
     * unchanged on Compose without any compiler-side rewriting.
     */
    public operator fun invoke(key: String): Boolean = can(key)

    /** Replace the entire granted set. */
    public fun set(keys: Set<String>) {
        granted.value = keys
    }

    /** Add a single permission. */
    public fun grant(key: String) {
        granted.value = granted.value + key
    }

    /** Remove a single permission. */
    public fun revoke(key: String) {
        granted.value = granted.value - key
    }
}
