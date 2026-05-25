// Link — declarative navigation match for @pyreon/router's
// `<Link to="/path">Label</Link>` component.
//
// Compiler emit:
//   <Link to="/users/123">Profile</Link>
//   ↓
//   PyreonLink("/users/123") { Text("Profile") }
//
// Named `PyreonLink` (not just `Link`) to avoid colliding with
// SwiftUI's own `Link` type (which opens external URLs). The compiler
// emits the prefixed name explicitly so there's no ambiguity at the
// call site.
//
// Phase C1 ships the SCAFFOLD: a Button that pushes the path onto
// the active router's stack. Phase C2+ adds active-link styling,
// prefetch hints, view-transition opt-in, and named-route support.

import SwiftUI

/// Declarative navigation. Tapping the link pushes the target path
/// onto the active PyreonRouter's stack.
///
/// Usage:
/// ```swift
/// PyreonLink("/users/123") {
///     Text("View Profile")
/// }
/// ```
///
/// Equivalent to `@pyreon/router`'s `<Link to="/users/123">View Profile</Link>`.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonLink<Label: View>: View {
    @Environment(\.pyreonRouter) private var router

    private let to: String
    private let label: () -> Label

    public init(_ to: String, @ViewBuilder label: @escaping () -> Label) {
        self.to = to
        self.label = label
    }

    public var body: some View {
        Button(action: { router?.push(to) }) {
            label()
        }
    }
}
