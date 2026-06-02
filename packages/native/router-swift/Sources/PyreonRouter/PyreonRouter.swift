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

/// A single route definition — Phase A4 of the 2026-06 native readiness
/// audit (closes CRIT-2 partial + CRIT-3 partial). Apps populate
/// `PyreonRouter.routes` with a list of these; the router's
/// `push`/`replace` runs `matchPath` against each pattern in declaration
/// order, populates `params` from the first match, and `RouterView`
/// renders the matched component.
///
/// Apps that DON'T configure `routes` keep the pre-A4 behavior: `params`
/// stays `[:]`, `RouterView` renders `EmptyView()`, host wires its own
/// `.navigationDestination(for:)`. Strictly additive.
@available(iOS 17.0, macOS 14.0, *)
public struct RouteRecord {
    /// Path pattern. Supports the same shapes `PyreonRouter.matchPath`
    /// accepts — literal segments, `:name`, `:name?`, `:name*` splat.
    public let path: String
    /// Factory producing the View when this route matches. Lazy: a route
    /// that's never visited doesn't pay component-construction cost.
    public let component: () -> AnyView

    public init(path: String, component: @escaping () -> AnyView) {
        self.path = path
        self.component = component
    }
}

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
    /// against route patterns).
    ///
    /// Phase A4 (native readiness audit, 2026-06): populated by
    /// `push`/`replace` when the candidate path matches a `routes` entry
    /// via `matchPath`. Apps that DON'T configure `routes` keep the
    /// pre-A4 behavior — `params` stays `[:]` and host code reads
    /// segments directly from `currentPath`.
    public var params: [String: String] = [:]

    /// Route table — declaration-order list of `RouteRecord` patterns.
    /// `push`/`replace` walk this list and pick the FIRST match;
    /// declaration order IS precedence. `RouterView` renders the matched
    /// record's component (or `notFoundComponent` when no match — see
    /// the wildcard-404 catch-all below; or `EmptyView()` when neither
    /// is configured — the original backward-compat fallback).
    ///
    /// Phase A4 ships a flat list; nested-route depth indexing
    /// (`RouteRecord.children`) lands as A4.5 — separate PR to limit
    /// blast radius.
    public var routes: [RouteRecord] = []

    /// Wildcard-404 catch-all — Phase A6 of the readiness audit. When
    /// `push`/`replace` lands a path that NO `routes` entry matches,
    /// `RouterView` renders this component instead of the backward-compat
    /// `EmptyView()` fallback. `nil` (the default) preserves pre-A6
    /// behavior; apps adopting catch-all 404s set this at construction
    /// or via `router.notFoundComponent = …`.
    ///
    /// The web router exposes this as a `'*'` / `(.*)` wildcard route
    /// in the routes config; the native runtime keeps it as a separate
    /// field because the route table walks declaration-order — a `'*'`
    /// pattern in `routes` would ALWAYS win (matches everything),
    /// forcing apps into precedence-by-declaration-order traps. A
    /// dedicated `notFoundComponent` field is the structurally simpler
    /// design.
    public var notFoundComponent: (() -> AnyView)? = nil

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

    /// Re-entry flag for the redirect pattern. When a beforeEach guard
    /// calls `router.replace("/login")` (the canonical "throw redirect"
    /// shape on native — see `redirect(_:)` below), the inner `replace`
    /// would otherwise re-run the guard chain and recurse infinitely.
    /// `_inGuard` is set true while a guard chain is running; any nested
    /// `push`/`replace` SKIPS its own guard chain (and afterEach fan-
    /// out — fired by the outer level).
    @ObservationIgnored
    private var _inGuard: Bool = false

    /// Construct with an initial path stack, optional route table, and
    /// optional wildcard-404 catch-all. Most apps pass `[]`
    /// (NavigationStack starts at its root view) or `["/"]` for an
    /// explicit root segment.
    ///
    /// `routes` and `notFoundComponent` both default to empty/nil for
    /// backward-compat — pre-A4 apps that use `.navigationDestination(for:)`
    /// directly keep working without changes. Apps adopting the new
    /// dispatcher pass a `[RouteRecord]` and (optionally) a
    /// `notFoundComponent` for the wildcard catch-all (Phase A6).
    public init(
        initialPath: [String] = [],
        routes: [RouteRecord] = [],
        notFoundComponent: (() -> AnyView)? = nil,
    ) {
        self.path = initialPath
        self.routes = routes
        self.notFoundComponent = notFoundComponent
        // Resolve any params that the initial top-of-stack path produces,
        // so apps that start on `/users/42` have `params["id"] == "42"`
        // immediately — no need to call push/replace just to populate.
        if !initialPath.isEmpty, let resolved = self.resolve(initialPath.last!) {
            self.params = resolved.params
        }
    }

    /// Walk `routes` in declaration order against `candidate`, returning
    /// the first matching record + its extracted params. Internal helper
    /// called by push/replace AND by the initializer (for the
    /// initial-path case). Pure — does NOT mutate state.
    private func resolve(_ candidate: String) -> (route: RouteRecord, params: [String: String])? {
        for record in routes {
            if let params = Self.matchPath(candidate, record.path) {
                return (record, params)
            }
        }
        return nil
    }

    /// Resolve the CURRENT top-of-stack path against the route table.
    /// Public so `RouterView` can call it during render — treat as an
    /// internal-API surface on the package.
    public func resolveCurrentRoute() -> (route: RouteRecord, params: [String: String])? {
        return resolve(currentPath)
    }

    /// Recompute `params` from `committed` against the route table.
    /// Called by push/replace AFTER the path mutation so the params
    /// signal updates in lockstep with the path (readers observing
    /// either field see a consistent snapshot). No-match → `params`
    /// is cleared (don't leak stale params from a previous route).
    private func updateParamsFromPath(_ committed: String) {
        params = resolve(committed)?.params ?? [:]
    }

    /// Run the beforeEach chain against `candidate`; any false →
    /// navigation BLOCKED. Returns true iff every guard allowed.
    /// Internal helper called by push/replace. Sets `_inGuard` so
    /// `router.replace`/`router.redirect` calls from inside a guard
    /// don't recurse through the chain.
    private func allowNavigation(to candidate: String) -> Bool {
        _inGuard = true
        defer { _inGuard = false }
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
    /// after the commit. Nested push/replace calls from inside a
    /// guard (the redirect pattern) skip the guard chain via
    /// `_inGuard`.
    public func push(_ path: String) {
        if _inGuard {
            // Re-entry from a guard's redirect — bypass the guard
            // chain (the guard is the active gate; the nested
            // mutation IS the chain's outcome) and the afterEach
            // fan-out (the outer level fires it).
            self.path.append(path)
            updateParamsFromPath(path)
            return
        }
        if !allowNavigation(to: path) { return }
        self.path.append(path)
        // Phase A4: resolve the matched route + extract params atomically
        // with the path mutation, so observers see a consistent snapshot
        // (params + path always describe the same route).
        updateParamsFromPath(path)
        runAfterEach(path)
    }

    /// Replace the top-of-stack path. Matches `router.replace(path)`
    /// on the web side — useful for auth redirects so the previous
    /// page isn't in the back stack.
    ///
    /// Round-2 follow-up: same guard chain as `push`. Re-entry-safe
    /// for the redirect pattern (`router.replace("/login")` from
    /// inside a beforeEach guard).
    public func replace(_ path: String) {
        if _inGuard {
            // Re-entry from a guard's redirect — skip the chain.
            if self.path.isEmpty {
                self.path.append(path)
            } else {
                self.path[self.path.count - 1] = path
            }
            updateParamsFromPath(path)
            return
        }
        if !allowNavigation(to: path) { return }
        if self.path.isEmpty {
            self.path.append(path)
        } else {
            self.path[self.path.count - 1] = path
        }
        // Phase A4: same params-after-path contract as `push`.
        updateParamsFromPath(path)
        runAfterEach(path)
    }

    /// "Throw redirect" — the canonical native equivalent of the
    /// web router's `throw redirect("/login")` pattern. A beforeEach
    /// guard that wants to redirect (vs just block) calls
    /// `router.redirect("/login")` then returns `false`:
    ///
    ///     router.beforeEachGuards.append { path in
    ///         if !isAuthed() && path != "/login" {
    ///             router.redirect("/login")
    ///             return false  // block the current navigation
    ///         }
    ///         return true
    ///     }
    ///
    /// Implementation is a thin wrapper around `replace` — the
    /// `_inGuard` flag breaks the recursion so the inner replace
    /// doesn't re-run the guard chain (which would infinite-loop
    /// or block the redirect itself).
    public func redirect(_ path: String) {
        // Delegate to replace. When called from inside a guard,
        // `_inGuard` is true → the inner replace skips its own
        // guard chain. When called from outside (e.g. an event
        // handler that wants to "redirect" with no back-stack
        // entry), behaves identically to `replace`.
        self.replace(path)
    }

    /// Pop the top-of-stack path. Matches `router.back()` on the web
    /// side. No-op if the stack is empty (NavigationStack's root view
    /// has nothing to pop to).
    ///
    /// Phase A4: also recomputes `params` from the newly-exposed
    /// top-of-stack path, so views observing `params` after a `back()`
    /// see the previous route's values (not stale params from the
    /// popped route). When the stack becomes empty, `currentPath`
    /// falls back to `"/"` and the resolver runs against that.
    public func back() {
        guard !self.path.isEmpty else { return }
        self.path.removeLast()
        updateParamsFromPath(currentPath)
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
