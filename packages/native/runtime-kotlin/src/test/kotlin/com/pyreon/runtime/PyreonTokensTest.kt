// PyreonTokens unit-level smoke — exercises the design-token namespace
// stub shipped as the Kotlin parity mirror of `PyreonTokens.swift`.
// Phase B (native readiness audit 2026-06).
//
// What this verifies:
//   - The namespace object is reachable
//   - VERSION matches the Swift side's `version` (cross-target drift
//     guard — both targets ship the same `0.0.0-phase0-scaffold`
//     sentinel until the styler emit replaces them per Phase 0
//     roadmap)
//
// What this DOESN'T verify (intentional — stub-only file):
//   - Any actual token values (spacing scale, colors, typography) —
//     those land via compiler emit of `PyreonTokens.generated.kt`
//   - Compose-side application (using tokens IN a Composable would
//     require Compose-test infrastructure this package avoids)

package com.pyreon.runtime

fun testPyreonTokensNamespaceReachable() {
    check(PyreonTokens.VERSION.isNotEmpty()) {
        "PyreonTokens.VERSION should be non-empty"
    }
}

fun testPyreonTokensVersionMatchesScaffoldSentinel() {
    // Cross-target parity: Swift's `PyreonTokens.version` and
    // Kotlin's `PyreonTokens.VERSION` ship the same sentinel value
    // (`0.0.0-phase0-scaffold`) so drift checks can compare them
    // directly. When the styler emit ships, BOTH targets bump to
    // the real version simultaneously.
    check(PyreonTokens.VERSION == "0.0.0-phase0-scaffold") {
        "VERSION should be the scaffold sentinel, got=${PyreonTokens.VERSION}"
    }
}

fun main() {
    testPyreonTokensNamespaceReachable()
    testPyreonTokensVersionMatchesScaffoldSentinel()
    println("[PyreonTokensTest] all smoke tests passed")
}
