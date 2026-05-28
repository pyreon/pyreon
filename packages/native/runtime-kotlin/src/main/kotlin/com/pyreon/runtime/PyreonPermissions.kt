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
    /** Currently-granted permission keys (exact + `"x.*"` wildcards). */
    public val granted: MutableState<Set<String>> = mutableStateOf(granted)

    /**
     * True when [key] is granted exactly, or matched by a granted
     * `"<prefix>.*"` wildcard (`"posts.*"` matches `"posts.edit"`).
     */
    public fun can(key: String): Boolean {
        if (granted.value.contains(key)) return true
        return granted.value.any { it.endsWith(".*") && key.startsWith(it.dropLast(1)) }
    }

    /** Inverse of [can]. */
    public fun cannot(key: String): Boolean = !can(key)

    /** True when every [keys] is granted. */
    public fun all(vararg keys: String): Boolean = keys.all { can(it) }

    /** True when at least one of [keys] is granted. */
    public fun any(vararg keys: String): Boolean = keys.any { can(it) }

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
