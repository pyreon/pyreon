// PyreonRouter — observable router instance matching @pyreon/router's
// shape. The web side carries a `Router` class with `currentRoute`
// (signal), `push(path)`, `replace(path)`, `back()`, `forward()`,
// `params` (computed from the active route), `query` (typed search
// params). This file mirrors that surface for SwiftUI.
//
// Phase C1 (this PR) is the SCAFFOLD: the @Observable class + the
// minimum surface the compiler-emitted Swift will reference. Real
// route definitions, loader handling, guards, transitions, View
// Transitions, lazy components — those land in later PRs as the
// real-app TodoMVC + counter examples surface concrete needs.

import SwiftUI

/// Routing model that wraps SwiftUI's NavigationStack.
///
/// API parity with `@pyreon/router`'s `Router` class:
/// - `currentPath` ← `router.currentRoute().path`
/// - `push(_:)`    ← `router.push(path)`
/// - `replace(_:)` ← `router.replace(path)`
/// - `back()`      ← `router.back()`
/// - `params`      ← `useParams()`
///
/// The `path` stack drives SwiftUI's `NavigationStack(path:)` binding;
/// changes to it animate transitions per platform convention.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonRouter {
    /// Active route path stack. Drives the NavigationStack(path:)
    /// binding inside RouterProvider's body. Mutating this array
    /// (push / pop / replace) triggers SwiftUI's navigation animation.
    public var path: [String]

    /// Convenience accessor for the top-of-stack path. Mirrors
    /// `router.currentRoute().path` on the web side.
    public var currentPath: String {
        path.last ?? "/"
    }

    /// Path parameter map for the current route (segments matched
    /// against route patterns). Phase C1 ships an empty dictionary —
    /// real pattern-matching lands when route definitions get a
    /// concrete shape (PR C1.x). The compiler-emitted Swift references
    /// `router.params["id"]` so the symbol must exist now even with
    /// no-op behaviour.
    public var params: [String: String] = [:]

    /// Construct with an initial path stack. Most apps pass `[]`
    /// (NavigationStack starts at its root view) or `["/"]` for an
    /// explicit root segment.
    public init(initialPath: [String] = []) {
        self.path = initialPath
    }

    /// Push a new path onto the stack. Matches `router.push(path)`
    /// on the web side — animates the iOS NavigationStack forward.
    public func push(_ path: String) {
        self.path.append(path)
    }

    /// Replace the top-of-stack path. Matches `router.replace(path)`
    /// on the web side — useful for auth redirects so the previous
    /// page isn't in the back stack.
    public func replace(_ path: String) {
        if self.path.isEmpty {
            self.path.append(path)
        } else {
            self.path[self.path.count - 1] = path
        }
    }

    /// Pop the top-of-stack path. Matches `router.back()` on the web
    /// side. No-op if the stack is empty (NavigationStack's root view
    /// has nothing to pop to).
    public func back() {
        guard !self.path.isEmpty else { return }
        self.path.removeLast()
    }

    /// Clear the entire path stack — navigates back to the root view.
    /// Matches the web-side pattern of calling `router.replace('/')`
    /// for "logout / forget everything".
    public func reset() {
        self.path.removeAll()
    }

    /// Phase C5.2 — match an incoming path against a pattern, extracting
    /// named params. Returns the params dict on match, nil on miss.
    ///
    /// Mirrors `@pyreon/router`'s `match.ts` algorithm for `:name`
    /// segments. The compiler emits calls to this helper from inside
    /// the `.navigationDestination(for:)` block when a route's path
    /// contains a `:param` segment.
    ///
    /// Examples:
    ///   matchPath("/users/123", "/users/:id")     → ["id": "123"]
    ///   matchPath("/posts/abc/edit", "/posts/:slug/edit") → ["slug": "abc"]
    ///   matchPath("/users/123", "/posts/:id")     → nil
    ///
    /// Phase 0 semantics:
    ///   - exact segment count (no wildcard / catch-all)
    ///   - param names captured by trimming the leading ":"
    ///   - empty path segments treated as literals
    public static func matchPath(_ path: String, _ pattern: String) -> [String: String]? {
        let pathParts = path.split(separator: "/", omittingEmptySubsequences: false)
        let patternParts = pattern.split(separator: "/", omittingEmptySubsequences: false)
        guard pathParts.count == patternParts.count else { return nil }
        var params: [String: String] = [:]
        for (pathSeg, patternSeg) in zip(pathParts, patternParts) {
            if patternSeg.hasPrefix(":") {
                let name = String(patternSeg.dropFirst())
                params[name] = String(pathSeg)
            } else if pathSeg != patternSeg {
                return nil
            }
        }
        return params
    }
}
