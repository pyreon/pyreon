// Hooks — programmatic navigation + param-reading entry points.
// Match @pyreon/router's `useNavigate()` / `useParams()` hooks on web.
//
// Compiler emit:
//   const navigate = useNavigate()
//   navigate('/login')
//   ↓
//   let navigate = useNavigate()
//   navigate("/login")
//
//   const { id } = useParams<{ id: string }>()
//   ↓
//   let params = useParams()
//   let id = params["id"] ?? ""
//
// Implemented as SwiftUI Views' methods rather than free functions
// because Environment access requires a View context. The compiler
// emit threads them through component-level View bodies (everything
// is a View in SwiftUI; even handlers live in a Button's closure
// which still has access to its View's @Environment).

import SwiftUI

/// Programmatic navigation — returns a closure that pushes a path
/// onto the active router's stack. Mirrors `@pyreon/router`'s
/// `useNavigate()` hook.
///
/// Usage (in a View body or modifier):
/// ```swift
/// struct LoginButton: View {
///     @Environment(\.pyreonRouter) private var router
///
///     var body: some View {
///         Button("Log in") {
///             router?.push("/dashboard")
///         }
///     }
/// }
/// ```
///
/// The compiler emit produces the equivalent shape from a JSX source:
/// ```tsx
/// const navigate = useNavigate()
/// <Button onPress={() => navigate('/dashboard')}>Log in</Button>
/// ```
///
/// For now, prefer direct `@Environment(\.pyreonRouter)` access in
/// hand-written Swift — the compiler will use `useNavigate()` for
/// JSX-source emits.
@available(iOS 17.0, macOS 14.0, *)
public func useNavigate(router: PyreonRouter?) -> (String) -> Void {
    return { path in
        router?.push(path)
    }
}

/// Read path parameters for the current route. Mirrors
/// `@pyreon/router`'s `useParams()` hook.
///
/// Phase C1 ships SCAFFOLD: returns the active router's `params`
/// dictionary directly. Real pattern-matching against route
/// definitions lands in Phase C2+ once route configs settle.
@available(iOS 17.0, macOS 14.0, *)
public func useParams(router: PyreonRouter?) -> [String: String] {
    router?.params ?? [:]
}

/// Read the current route's loaded data. Mirrors `@pyreon/router`'s
/// `useLoaderData()` hook.
///
/// The router's `loaderData` store is type-erased (`[String: Any]`) because
/// loader payloads are per-route; this hook casts the current path's entry to
/// the caller's expected `T`. Returns nil when no data is stored for the
/// current path, the cast fails, or the router is absent — the defensive
/// default matching the web side's missing-data behaviour.
///
/// Compiler emit (a follow-up to this runtime contract):
/// ```tsx
/// const user = useLoaderData<User>()
/// ↓
/// let user: User? = useLoaderData(router: pyreonRouter)
/// ```
@available(iOS 17.0, macOS 14.0, *)
public func useLoaderData<T>(router: PyreonRouter?) -> T? {
    guard let router else { return nil }
    return router.loaderData[router.currentPath] as? T
}
