// PyreonTokens unit-level smoke — exercises the design-token namespace
// shipped as the Kotlin parity mirror of `PyreonTokens.swift`.
//
// Phase B (initial parity, native readiness audit 2026-06).
// Phase B3-partial: extended after PyreonTokens went beyond scaffold
// to ship the SPACING + SEMANTIC_SPACING constants.
//
// What this verifies:
//   - The namespace object is reachable
//   - VERSION matches the Swift side's `version` (cross-target drift
//     guard — both targets ship the same `0.1.0-phase1-tokens` string)
//   - SPACING scale matches the documented 0-9 indexed 4dp scale
//   - SEMANTIC_SPACING aliases (xs/sm/md/lg/xl) match the documented
//     4/8/12/16/24 values
//
// Cross-target parity contracts:
//   1. VERSION string identical to Swift's `PyreonTokens.version`
//   2. SPACING values identical to Swift's `PyreonTokens.SPACING`
//   3. SEMANTIC_SPACING values identical to Swift's `PyreonTokens.SEMANTIC_SPACING`
//
// (1) is enforced by `scripts/check-native-runtime-parity.ts` at CI
// time; (2) + (3) are doc-locked here — the same numeric values are
// asserted on both sides.

package com.pyreon.runtime

fun testPyreonTokensNamespaceReachable() {
    check(PyreonTokens.VERSION.isNotEmpty()) {
        "PyreonTokens.VERSION should be non-empty"
    }
}

fun testPyreonTokensVersionIsPhase1() {
    // Cross-target parity: Swift's `PyreonTokens.version` and
    // Kotlin's `PyreonTokens.VERSION` ship the SAME string. The
    // `scripts/check-native-runtime-parity.ts` script enforces
    // byte-for-byte match at CI time.
    check(PyreonTokens.VERSION == "0.1.0-phase1-tokens") {
        "VERSION should be the phase-1-tokens release, got=${PyreonTokens.VERSION}"
    }
}

fun testPyreonTokensSpacingScale() {
    // Indexed 4dp scale: 0/4/8/12/16/20/24/32/40/48 matches
    // @pyreon/primitives's documented padding/gap token scale.
    val expected = listOf(0, 4, 8, 12, 16, 20, 24, 32, 40, 48)
    check(PyreonTokens.SPACING == expected) {
        "SPACING should be the canonical 4dp scale, got=${PyreonTokens.SPACING}"
    }
}

fun testPyreonTokensSemanticSpacing() {
    // xs/sm/md/lg/xl → 4/8/12/16/24 matches @pyreon/primitives's
    // documented semantic aliases.
    check(PyreonTokens.SEMANTIC_SPACING["xs"] == 4) {
        "SEMANTIC_SPACING['xs'] should be 4, got=${PyreonTokens.SEMANTIC_SPACING["xs"]}"
    }
    check(PyreonTokens.SEMANTIC_SPACING["sm"] == 8) {
        "SEMANTIC_SPACING['sm'] should be 8"
    }
    check(PyreonTokens.SEMANTIC_SPACING["md"] == 12) {
        "SEMANTIC_SPACING['md'] should be 12"
    }
    check(PyreonTokens.SEMANTIC_SPACING["lg"] == 16) {
        "SEMANTIC_SPACING['lg'] should be 16"
    }
    check(PyreonTokens.SEMANTIC_SPACING["xl"] == 24) {
        "SEMANTIC_SPACING['xl'] should be 24"
    }
    check(PyreonTokens.SEMANTIC_SPACING["xxl"] == null) {
        "SEMANTIC_SPACING['xxl'] should be null (alias not defined)"
    }
}

fun main() {
    testPyreonTokensNamespaceReachable()
    testPyreonTokensVersionIsPhase1()
    testPyreonTokensSpacingScale()
    testPyreonTokensSemanticSpacing()
    println("[PyreonTokensTest] all smoke tests passed")
}
