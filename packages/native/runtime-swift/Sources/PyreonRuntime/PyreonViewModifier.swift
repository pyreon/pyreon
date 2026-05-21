// PyreonViewModifier — base protocol/extensions for the styler emitter.
//
// In Phase 0 this file defines the minimum API that the styler emitter
// (PR 7b) will target: a `PyreonStylable` protocol that emitter-generated
// `ViewModifier` types conform to, so the consuming SwiftUI code can do:
//
//   Button("Save") { … }
//     .modifier(PyreonButton(state: .primary, size: .medium))
//
// Phase 0 (this file's current shape): the protocol skeleton + a smoke
// implementation. Real ViewModifier emit from `@pyreon/styler` lands in
// PR 7b.

import SwiftUI

/// Marker protocol for compiler-generated style modifiers.
///
/// The compiler's styler emit (PR 7b per the Phase 0 roadmap) generates
/// `struct PyreonButton: PyreonStylable, ViewModifier { … }`, etc.
/// Conformance to this marker is internal-only — it exists so devtools
/// can detect Pyreon-generated modifiers vs hand-written SwiftUI ones
/// without runtime reflection.
public protocol PyreonStylable {
    /// Returns the generator-source identifier (component name + dimension
    /// combo) the modifier was emitted from. Used by debug overlays + the
    /// future per-component perf instrumentation.
    static var pyreonSource: String { get }
}

// Provides a default implementation so emitter output doesn't need to
// hand-write the `pyreonSource` constant. The emitter sets it via a
// per-struct override; the default is a fallback.
public extension PyreonStylable {
    static var pyreonSource: String { "(unspecified)" }
}
