// PyreonTokens — design-system tokens shipped alongside compiler-emitted
// SwiftUI. Phase B3-partial (native readiness audit 2026-06): promoted
// beyond Phase-0 scaffold to ship the canonical spacing scale from
// `@pyreon/primitives` as real public constants.
//
// What's HERE (Phase 1):
//   - SPACING — indexed 4px scale [0..9] = [0,4,8,12,16,20,24,32,40,48]
//   - SEMANTIC_SPACING — xs/sm/md/lg/xl alias map (4/8/12/16/24)
//
// What's NOT here (Phase 2+):
//   - Full `@pyreon/ui-theme` interop (color palette, typography scale,
//     responsive breakpoints) — needs cross-package design + Swift's
//     Color/Font interop with the web's hex-string conventions
//   - Compiler-side `<Stack space="md">` → `VStack(spacing: PyreonTokens.SEMANTIC_SPACING["md"])`
//     emit — separately tracked as Phase-B emit work
//
// Cross-target parity is enforced by `scripts/check-native-runtime-parity.ts`:
// `version` must match `PyreonTokens.VERSION` on the Kotlin side
// byte-for-byte. Bump them together or the parity CI gate fails.

import SwiftUI

/// Namespace for compiler-shipped design tokens.
///
/// The canonical token scale mirrors `@pyreon/primitives`'s documented
/// scale so cross-target code referencing `space="md"` resolves to the
/// SAME visual gap on web (12px) / iOS (12pt) / Android (12dp).
public enum PyreonTokens {
    /// Version sentinel — bumped in lockstep with the Kotlin side. The
    /// cross-target parity script (`scripts/check-native-runtime-parity.ts`)
    /// asserts byte-for-byte match.
    public static let version: String = "0.1.0-phase1-tokens"

    /// Indexed 4px spacing scale. Index 0..9 maps to pixel values
    /// 0/4/8/12/16/20/24/32/40/48. Matches `@pyreon/primitives`'s
    /// `padding={4}` / `gap={4}` convention exactly.
    ///
    /// Usage in hand-authored Swift (consumers of the runtime):
    /// ```
    /// VStack(spacing: PyreonTokens.SPACING[3]) { ... }  // 12pt gap
    /// ```
    ///
    /// Note: SwiftUI's `spacing:` is `CGFloat`; the values are unitless
    /// since iOS uses logical points that match web's CSS pixels at 1×
    /// density (Retina handles scaling).
    public static let SPACING: [CGFloat] = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48]

    /// Semantic spacing aliases — xs/sm/md/lg/xl → 4/8/12/16/24. Maps
    /// the `space="md"` shape to a concrete value. Dictionary so the
    /// compiler emit can look up via the literal alias string.
    public static let SEMANTIC_SPACING: [String: CGFloat] = [
        "xs": 4,
        "sm": 8,
        "md": 12,
        "lg": 16,
        "xl": 24,
    ]
}
