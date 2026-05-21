// PyreonReactivity — adapter layer between Pyreon's signal model and
// SwiftUI's reactive primitives.
//
// Per the PMTC plan (#764), the structural mapping is:
//   `signal<T>(initial)`       → `@State private var x: T = initial`
//   `computed(() => f(...))`   → computed property reading @State
//   `effect(() => f(...))`     → `.onChange(of:)` view modifier (in PR 6+)
//
// SwiftUI's `@State` IS the reactive primitive — Pyreon doesn't ship its
// own observable wrapper layer in production. This file exists for the
// FEW cases where the structural mapping needs a small helper:
//   - effect-with-dependency-list tracking (Phase 1)
//   - signal-to-Combine bridging for legacy code consumers (Phase 1+)
//   - debugging hooks (devtools-style; Phase 2+)
//
// Phase 0 (this file's current shape): SCAFFOLD ONLY. The runtime is
// intentionally near-empty — the plan's "almost no runtime code needed"
// claim is structurally accurate; this file's existence is more about
// reserving the API namespace than about shipping behaviour.

import SwiftUI

/// Namespace for compile-emitter helpers that don't fit directly into
/// SwiftUI's primitives.
///
/// The expectation is that this namespace stays small. If it grows past
/// ~500 LOC of Swift, that's a signal the compiler emit shape is wrong
/// (per the Phase 0 roadmap risk register) and we should regroup.
public enum PyreonReactivity {
    /// Placeholder symbol so the namespace is reachable from tests.
    /// Replaced by real helpers as Phase 0 progresses.
    public static let runtimeName: String = "@pyreon/native-runtime-swift"
}
