// PyreonPermissionsEnvironment — the SwiftUI environment key that carries a
// `<PermissionsProvider>`'s grants to every `usePermissions()` below it.
//
// Compiler emit:
//   <PermissionsProvider permissions={['posts.read']}>…</PermissionsProvider>
//   ↓
//   Group { … }.environment(\.pyreonPermissions, PyreonPermissions(["posts.read"]))
//
//   const can = usePermissions()
//   ↓
//   @Environment(\.pyreonPermissions) private var can
//
// This used to be emitted INLINE into each generated file that needed it,
// which was wrong three ways:
//   - two such files in one Xcode target each declared
//     `EnvironmentValues.pyreonPermissions` → `invalid redeclaration`;
//   - a file that only PROVIDED the grants (nothing in it read them) did not
//     get the key at all, so it failed to compile on its own;
//   - the key has to be ONE key for the whole app: a provider in the app's
//     root file and a reader on a page in another file must name the same
//     key, which a per-file declaration can never guarantee.
// So it lives here, beside `PyreonPermissions`, declared once.
//
// An unprovided environment is an EMPTY set — a deny, which is the safe
// default for an authorization check.
//
// The validation stubs carry a byte-for-byte copy
// (`@pyreon/native-compiler` swift-stubs.ts); `runtime-stub-parity.test.ts`
// fails the moment the two disagree.

import SwiftUI

// MARK: - stub-mirror

@available(iOS 17.0, macOS 14.0, *)
private struct PyreonPermissionsKey: EnvironmentKey {
    static let defaultValue = PyreonPermissions()
}

@available(iOS 17.0, macOS 14.0, *)
extension EnvironmentValues {
    public var pyreonPermissions: PyreonPermissions {
        get { self[PyreonPermissionsKey.self] }
        set { self[PyreonPermissionsKey.self] = newValue }
    }
}
