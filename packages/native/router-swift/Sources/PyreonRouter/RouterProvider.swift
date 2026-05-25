// RouterProvider — top-level container that wires a PyreonRouter
// instance into a SwiftUI NavigationStack. Matches @pyreon/router's
// `<RouterProvider router={router}>` component on the web.
//
// Compiler emit (Phase B + canonical-primitives):
//   <RouterProvider router={router}>
//     <RouterView />
//   </RouterProvider>
//   ↓
//   RouterProvider(router: router) {
//     RouterView()
//   }

import SwiftUI

/// SwiftUI environment key for the active PyreonRouter instance.
/// `useNavigate()` and `useParams()` resolve via `@Environment(\.pyreonRouter)`
/// so any view in the tree can read the router without prop drilling
/// — matches the React/Pyreon context pattern.
@available(iOS 17.0, macOS 14.0, *)
private struct PyreonRouterKey: EnvironmentKey {
    static let defaultValue: PyreonRouter? = nil
}

@available(iOS 17.0, macOS 14.0, *)
extension EnvironmentValues {
    /// Active PyreonRouter for the current view tree. `nil` if no
    /// RouterProvider is mounted — mirrors the web side's
    /// `useRouter()` throwing "no RouterProvider in scope".
    public var pyreonRouter: PyreonRouter? {
        get { self[PyreonRouterKey.self] }
        set { self[PyreonRouterKey.self] = newValue }
    }
}

/// Top-level routing container. Wraps the given PyreonRouter into a
/// NavigationStack and exposes it via the environment so descendants
/// can call `useNavigate()` / `useParams()` / `<RouterView />`.
///
/// Usage:
/// ```swift
/// struct TodoApp: View {
///     @State private var router = PyreonRouter()
///
///     var body: some View {
///         RouterProvider(router: router) {
///             RouterView()
///         }
///     }
/// }
/// ```
@available(iOS 17.0, macOS 14.0, *)
public struct RouterProvider<Content: View>: View {
    @Bindable private var router: PyreonRouter
    private let content: () -> Content

    public init(router: PyreonRouter, @ViewBuilder content: @escaping () -> Content) {
        self.router = router
        self.content = content
    }

    public var body: some View {
        // NavigationStack(path:) binds the router's path stack directly.
        // SwiftUI handles back-swipe gestures, animation, and stack-state
        // preservation automatically — Pyreon doesn't reimplement any of it.
        NavigationStack(path: $router.path) {
            content()
                .environment(\.pyreonRouter, router)
        }
    }
}
