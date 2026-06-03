// PyreonReactivity — adapter layer between Pyreon's signal model and
// Compose's reactive primitives. KOTLIN PARITY MIRROR of
// `PyreonReactivity.swift`. Closes the Phase B (native readiness
// audit 2026-06) gap: Swift had this namespace scaffold; Kotlin
// didn't, leaving the runtime asymmetric.
//
// Per the PMTC plan, the structural mapping is:
//   `signal<T>(initial)`       → `var x by remember { mutableStateOf(initial) }`
//   `computed(() => f(...))`   → `val x by remember { derivedStateOf { f(...) } }`
//   `effect(() => f(...))`     → `LaunchedEffect(key) { f(...) }`
//
// Compose's `mutableStateOf` / `derivedStateOf` ARE the reactive
// primitives — Pyreon doesn't ship its own observable wrapper layer
// in production. This file exists for the FEW cases where the
// structural mapping needs a small helper:
//   - effect-with-dependency-list tracking (Phase 1)
//   - debugging hooks (devtools-style; Phase 2+)
//
// Phase 0 (this file's current shape): SCAFFOLD ONLY — same parity
// status as `PyreonReactivity.swift`. The runtime is intentionally
// near-empty; this file's existence is more about reserving the API
// namespace than about shipping behaviour.

package com.pyreon.runtime

/**
 * Namespace for compile-emitter helpers that don't fit directly into
 * Compose's primitives.
 *
 * The expectation is that this namespace stays small. If it grows past
 * ~500 LOC of Kotlin, that's a signal the compiler emit shape is wrong
 * (per the Phase 0 roadmap risk register) and we should regroup.
 */
public object PyreonReactivity {
    /** Placeholder symbol so the namespace is reachable from tests.
     *  Replaced by real helpers as Phase 0 progresses. Mirrors
     *  `PyreonReactivity.runtimeName` on the Swift side. */
    public const val RUNTIME_NAME: String = "@pyreon/native-runtime-kotlin"
}
