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

    /// Phase 3 (loaders) — per-route loaded data, keyed by full path. A
    /// route's loader stores its result here on navigation; `useLoaderData()`
    /// reads the current path's entry. Type-erased (`Any`) because loader
    /// payloads are per-route; `useLoaderData<T>()` casts to the expected type.
    /// Empty until a loader harness populates it (the harness emit is a
    /// follow-up — this is the runtime contract it targets).
    public var loaderData: [String: Any] = [:]

    /// Round-1 audit fix: insertion-order parallel-array for the LRU
    /// bound on `loaderData`. Swift's `Dictionary` is UNORDERED (unlike
    /// Kotlin's default `mapOf`-backed LinkedHashMap), so `loaderData.keys.first`
    /// returns an arbitrary key — not the oldest insertion. To evict
    /// the OLDEST entry deterministically we track insertion order
    /// explicitly. Internal to the LRU machinery; not part of the
    /// public contract.
    @ObservationIgnored
    private var loaderDataOrder: [String] = []

    /// Global router-level guards (`beforeEach: [fn]` on createRouter).
    /// Each is `(path: String) -> Bool` — return `false` to BLOCK the
    /// navigation. Chains: if ANY guard returns false, the navigation
    /// is dropped. Runs BEFORE the `push`/`replace` mutates the path.
    /// PMTC-emitted apps configure these from `createRouter({
    /// beforeEach: [authGuard, logGuard] })` config.
    public var beforeEachGuards: [(String) -> Bool] = []

    /// Global router-level afterEach hooks (`afterEach: [fn]` on
    /// createRouter). Each is `(path: String) -> Void` — runs AFTER
    /// the path commits. Fan-out (no short-circuit); side effects
    /// only. Typical use: analytics, page-view logging.
    public var afterEachHooks: [(String) -> Void] = []

    /// Construct with an initial path stack. Most apps pass `[]`
    /// (NavigationStack starts at its root view) or `["/"]` for an
    /// explicit root segment.
    public init(initialPath: [String] = []) {
        self.path = initialPath
    }

    /// Run the beforeEach chain against `candidate`; any false →
    /// navigation BLOCKED. Returns true iff every guard allowed.
    /// Internal helper called by push/replace.
    private func allowNavigation(to candidate: String) -> Bool {
        for guardFn in beforeEachGuards {
            if !guardFn(candidate) { return false }
        }
        return true
    }

    /// Run the afterEach fan-out for `committed`. Side effects only;
    /// no short-circuit. Internal helper called by push/replace.
    private func runAfterEach(_ committed: String) {
        for hook in afterEachHooks { hook(committed) }
    }

    /// Push a new path onto the stack. Matches `router.push(path)`
    /// on the web side — animates the iOS NavigationStack forward.
    ///
    /// Round-2 follow-up: chains `beforeEachGuards` (any false →
    /// no-op) before the path mutation, fans out `afterEachHooks`
    /// after the commit.
    public func push(_ path: String) {
        if !allowNavigation(to: path) { return }
        self.path.append(path)
        runAfterEach(path)
    }

    /// Replace the top-of-stack path. Matches `router.replace(path)`
    /// on the web side — useful for auth redirects so the previous
    /// page isn't in the back stack.
    ///
    /// Round-2 follow-up: same guard chain as `push`.
    public func replace(_ path: String) {
        if !allowNavigation(to: path) { return }
        if self.path.isEmpty {
            self.path.append(path)
        } else {
            self.path[self.path.count - 1] = path
        }
        runAfterEach(path)
    }

    /// Pop the top-of-stack path. Matches `router.back()` on the web
    /// side. No-op if the stack is empty (NavigationStack's root view
    /// has nothing to pop to).
    public func back() {
        guard !self.path.isEmpty else { return }
        self.path.removeLast()
    }

    /// Store a route's loaded data under its path. Called by the loader
    /// harness the compiler emits; idempotent overwrite. Mutating `loaderData`
    /// triggers SwiftUI observation so views reading `useLoaderData()`
    /// re-render when the data arrives.
    ///
    /// Round-1 audit fix: applies an LRU bound (cap = `Self.MAX_LOADER_ENTRIES`,
    /// matches the web router's prefetch-cache convention) to prevent
    /// unbounded growth across many navigations. Pre-fix this dictionary
    /// grew monotonically — every visited path retained its loader payload
    /// forever, anti-pattern Class C (unbounded cache).
    ///
    /// Update semantics: re-storing an existing key NEVER evicts (it's an
    /// in-place value swap, not a fresh insertion). Eviction only fires
    /// when adding a NEW key would exceed the cap — the oldest entry
    /// (Swift dictionaries preserve insertion order since Swift 5) is
    /// dropped.
    public func setLoaderData(_ path: String, _ value: Any) {
        if loaderData[path] == nil {
            // NEW key: cap-evict the oldest insertion first, then track
            // this path as the newest.
            if loaderData.count >= Self.MAX_LOADER_ENTRIES, !loaderDataOrder.isEmpty {
                let oldest = loaderDataOrder.removeFirst()
                loaderData.removeValue(forKey: oldest)
            }
            loaderDataOrder.append(path)
        }
        // Existing keys: pure in-place swap. The order tracker is not
        // touched — re-storing doesn't reset recency, matching the
        // "overwrite doesn't evict" Kotlin contract one-for-one.
        loaderData[path] = value
    }

    /// LRU bound for `loaderData`. 50 mirrors the web router's
    /// prefetch-cache cap — empirically large enough for normal app
    /// navigation patterns (tab-bar apps, deep flows) without retaining
    /// hundreds of stale payloads.
    static let MAX_LOADER_ENTRIES: Int = 50

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
    ///   matchPath("/blog/2026/may", "/blog/:rest*") → ["rest": "2026/may"]
    ///   matchPath("/about/", "/about")            → [:]  (trailing slash ignored)
    ///
    /// Semantics (mirrors `@pyreon/router`'s `match.ts`):
    ///   - empty segments are filtered, so leading / trailing slashes are
    ///     tolerated (`/about/` matches `/about`; `/` matches `/`)
    ///   - `:name` captures one segment
    ///   - `:name*` (splat / catch-all) captures the remaining path tail
    ///     joined by "/"; it must be the last pattern segment and matches
    ///     one-or-more trailing segments (web parity: `pathLen >= segCount`)
    ///   - `:name?` (optional) — a TRAILING optional segment may be omitted
    ///     by the path (`/users/:id?` matches both `/users` and `/users/7`)
    ///   - non-splat / non-optional patterns require an exact segment count
    public static func matchPath(_ path: String, _ pattern: String) -> [String: String]? {
        // Filter empty subsequences → leading/trailing slashes ignored,
        // matching the web router's `.split('/').filter(Boolean)`.
        let pathParts = path.split(separator: "/").map(String.init)
        let patternParts = pattern.split(separator: "/").map(String.init)
        var params: [String: String] = [:]
        for (i, patternSeg) in patternParts.enumerated() {
            // Splat / catch-all `:name*` — captures the remaining tail.
            if patternSeg.hasPrefix(":") && patternSeg.hasSuffix("*") {
                let name = String(patternSeg.dropFirst().dropLast())
                // One-or-more: the splat position must have a segment.
                guard i < pathParts.count else { return nil }
                params[name] = pathParts[i...].joined(separator: "/")
                return params
            }
            let isOptional = patternSeg.hasPrefix(":") && patternSeg.hasSuffix("?")
            // Path exhausted at this index — OK only if the segment is
            // optional (and, by extension, every remaining one is too, since
            // they all hit this same exhausted branch).
            guard i < pathParts.count else {
                if isOptional { continue }
                return nil
            }
            let pathSeg = pathParts[i]
            if patternSeg.hasPrefix(":") {
                let name = isOptional
                    ? String(patternSeg.dropFirst().dropLast())
                    : String(patternSeg.dropFirst())
                params[name] = pathSeg
            } else if pathSeg != patternSeg {
                return nil
            }
        }
        // No splat consumed the tail. The path may be SHORTER than the
        // pattern only when the missing tail was all optional (handled by the
        // exhausted-branch `continue` above); it must never be LONGER.
        guard pathParts.count <= patternParts.count else { return nil }
        return params
    }
}
