// PyreonTokens — design-system tokens shipped alongside compiler-emitted
// Compose. KOTLIN PARITY MIRROR of `PyreonTokens.swift`. Phase B3-partial
// (native readiness audit 2026-06): promoted beyond Phase-0 scaffold to
// ship the canonical spacing scale from `@pyreon/primitives` as real
// public constants.
//
// What's HERE (Phase 1):
//   - SPACING — indexed 4dp scale [0..9] = [0,4,8,12,16,20,24,32,40,48]
//   - SEMANTIC_SPACING — xs/sm/md/lg/xl alias map (4/8/12/16/24)
//
// What's NOT here (Phase 2+):
//   - Full `@pyreon/ui-theme` interop (color palette, typography scale,
//     responsive breakpoints) — needs cross-package design + Compose's
//     Color/TextStyle interop with web's hex-string conventions
//   - Compiler-side `<Stack space="md">` → `Column(verticalArrangement = ...)`
//     emit — separately tracked as Phase-B emit work
//
// Cross-target parity is enforced by `scripts/check-native-runtime-parity.ts`:
// VERSION must match `PyreonTokens.version` on the Swift side byte-for-byte.
// Bump them together or the parity CI gate fails.

package com.pyreon.runtime

/**
 * Namespace for compiler-shipped design tokens.
 *
 * The canonical token scale mirrors `@pyreon/primitives`'s documented
 * scale so cross-target code referencing `space="md"` resolves to the
 * SAME visual gap on web (12px) / iOS (12pt) / Android (12dp).
 */
public object PyreonTokens {
    /** Version sentinel — bumped in lockstep with the Swift side. The
     *  cross-target parity script (`scripts/check-native-runtime-parity.ts`)
     *  asserts byte-for-byte match. */
    public const val VERSION: String = "0.1.0-phase1-tokens"

    /** Indexed 4dp spacing scale. Index 0..9 maps to dp values
     *  0/4/8/12/16/20/24/32/40/48. Matches `@pyreon/primitives`'s
     *  `padding={4}` / `gap={4}` convention exactly.
     *
     *  Compose's `Dp` would be the idiomatic type here, but importing
     *  it pulls in androidx.compose.ui — this package intentionally
     *  stays Compose-import-free at the type level (see the package's
     *  README + the audit's Kotlin-runtime story). The values are
     *  Int dp values — call-site converts via `.dp` at usage.
     *
     *  Usage in hand-authored Compose:
     *  ```
     *  Column(
     *      verticalArrangement = Arrangement.spacedBy(PyreonTokens.SPACING[3].dp),
     *  ) { ... }  // 12dp gap
     *  ```
     */
    public val SPACING: List<Int> = listOf(0, 4, 8, 12, 16, 20, 24, 32, 40, 48)

    /** Semantic spacing aliases — xs/sm/md/lg/xl → 4/8/12/16/24. Maps
     *  the `space="md"` shape to a concrete dp value. Map so the
     *  compiler emit can look up via the literal alias string. */
    public val SEMANTIC_SPACING: Map<String, Int> = mapOf(
        "xs" to 4,
        "sm" to 8,
        "md" to 12,
        "lg" to 16,
        "xl" to 24,
    )
}
