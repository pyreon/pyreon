// PyreonTokens — design-system tokens emitted from `@pyreon/ui-theme`.
//
// In Phase 0 this file is a STUB. The actual tokens (spacing scale,
// color palette, typography, breakpoints) are emitted by the compiler
// in PR 7a per the Phase 0 roadmap.
//
// The stub-shape lets PyreonRuntime build and lets downstream PRs
// (Xcode project, counter app) reference the namespace early without
// blocking on the full token emit being ready.

import SwiftUI

/// Namespace for compiler-generated design tokens.
///
/// In a real build, the Pyreon compiler emits a `PyreonTokens.generated.swift`
/// file alongside this stub. The stub provides at least one symbol so
/// downstream code can compile-reference the namespace; PR 7a replaces it
/// with the real generation.
public enum PyreonTokens {
    /// Placeholder version constant. Used in smoke tests to verify the
    /// namespace is reachable.
    public static let version: String = "0.0.0-phase0-scaffold"
}
