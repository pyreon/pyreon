// PyreonTokens — design-system tokens emitted from `@pyreon/ui-theme`.
// KOTLIN PARITY MIRROR of `PyreonTokens.swift`. Closes the Phase B
// (native readiness audit 2026-06) gap: Swift had this stub; Kotlin
// didn't, breaking parity for the styler-emitter Phase B work.
//
// In Phase 0 this file is a STUB. The actual tokens (spacing scale,
// color palette, typography, breakpoints) are emitted by the compiler
// per the Phase 0 roadmap.
//
// The stub-shape lets PyreonRuntime build and lets downstream PRs
// (Compose host apps, native examples) reference the namespace early
// without blocking on the full token emit being ready.

package com.pyreon.runtime

/**
 * Namespace for compiler-generated design tokens.
 *
 * In a real build, the Pyreon compiler emits a `PyreonTokens.generated.kt`
 * file alongside this stub. The stub provides at least one symbol so
 * downstream code can compile-reference the namespace; the generation
 * step replaces it with real tokens.
 */
public object PyreonTokens {
    /** Placeholder version constant. Used in smoke tests to verify the
     *  namespace is reachable. Mirrors `PyreonTokens.version` on the
     *  Swift side (same `0.0.0-phase0-scaffold` value so cross-target
     *  drift checks can compare). */
    public const val VERSION: String = "0.0.0-phase0-scaffold"
}
