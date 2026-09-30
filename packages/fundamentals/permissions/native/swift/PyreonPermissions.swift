// PyreonPermissions — the SwiftUI side of Pyreon's cross-platform
// authorization story (Phase 4). Mirrors the core `@pyreon/permissions`
// surface and the Kotlin `PyreonPermissions` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive permission set with the RBAC/feature-flag
// checks `@pyreon/permissions` exposes:
//
//     can("posts.edit")     // exact or wildcard match
//     cannot("posts.edit")  // inverse
//     all("a", "b")         // every key granted
//     any("a", "b")         // at least one granted
//
// plus `set` / `grant` / `revoke` to mutate the granted set reactively. A
// SwiftUI view gating UI on `perms.can("admin")` re-renders when the set
// changes — the native analogue of the web `can(key)` reactive check.
//
// ## Wildcards
//
// A granted `"posts.*"` matches any `"posts.<X>"` (the web wildcard rule).
// Matching is segment-prefix: `"posts.*"` → grants `"posts.edit"`,
// `"posts.delete"`, etc., but NOT `"postsX"`.
//
// ## Scope — pure-logic state container
//
// No platform API, no schema libs, no Android-SDK dependency — this is the
// `@pyreon/permissions` logic (which is already framework-agnostic) ported
// as a reactive native container. Unit-testable synchronously. The
// `usePermissions` / `<Can>` compiler emit builds on this contract in a
// follow-up (the PyreonFetch/PyreonForm per-service-port pattern).

import Foundation
import Observation

/// Observable reactive permission set — the SwiftUI half of `usePermissions`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonPermissions {
    /// The currently-granted permission keys — exact, plus the three
    /// wildcard forms `"x.*"` (one segment), `"x.**"` (any depth) and
    /// `"*"` (everything).
    public private(set) var granted: Set<String>

    public init(_ granted: Set<String> = []) {
        self.granted = granted
        self.isUnprovidedFallback = false
    }

    /// True only for the instance a `usePermissions()` reads when NO
    /// `<PermissionsProvider>` sits above it (the environment key's default).
    /// It is an EMPTY set — every check denies — and that is the safe answer
    /// for authorization, but it is indistinguishable from a legitimate
    /// "this user has no grants" set, so a missing provider (typically one in
    /// another file) used to look exactly like a working app that denies
    /// everything. An explicit `usePermissions([])` / `PyreonPermissions()` is
    /// NOT this: it states an intent, and never warns.
    @ObservationIgnored public let isUnprovidedFallback: Bool

    private init(unprovided: Void) {
        self.granted = []
        self.isUnprovidedFallback = true
    }

    /// The environment key's default value. See `isUnprovidedFallback`.
    public static func makeUnprovided() -> PyreonPermissions {
        PyreonPermissions(unprovided: ())
    }

    /// Where the once-per-process dev warning goes. Defaults to `print`;
    /// tests replace it.
    public static var warningSink: (String) -> Void = { print($0) }

    private static let warnedLock = NSLock()
    private static var warned = false

    /// Fires `warningSink` at most once per process. Compiled in ALWAYS (so the
    /// once-semantics are testable without `-DDEBUG`); only the CALL from
    /// `can` is `#if DEBUG`, so a release build never reaches it.
    public static func warnUnprovidedOnce() {
        warnedLock.lock()
        let first = !warned
        warned = true
        warnedLock.unlock()
        if first {
            warningSink(
                "[Pyreon] usePermissions() was read with no <PermissionsProvider> above it, so every permission check DENIES. Wrap the tree in <PermissionsProvider permissions={{…}}> (it can live in another file), or seed at the call site: usePermissions(['posts.edit'])."
            )
        }
    }

    /// Test seam: re-arm the once-per-process warning.
    public static func resetWarningForTesting() {
        warnedLock.lock()
        warned = false
        warnedLock.unlock()
    }

    /// Resolve `key` against the granted set, in the SAME order the web
    /// resolver uses: exact → one-segment wildcard → recursive wildcard
    /// (most-specific ancestor first) → global.
    ///
    /// The previous implementation matched any `"prefix.*"` entry with a
    /// bare `hasPrefix`, which made `.*` behave like the web's `.**`:
    /// granting `"posts.*"` also granted `"posts.comments.edit"`, a key
    /// the web DENIES. That is the wrong direction for a permission
    /// check — the same source granted more on device than in the
    /// browser. It also recognised neither `.**` nor `*`, so the two
    /// wildcards that SHOULD widen a grant were silently ignored.
    public func can(_ key: String) -> Bool {
        #if DEBUG
        if isUnprovidedFallback { PyreonPermissions.warnUnprovidedOnce() }
        #endif
        // 1. Exact match.
        if granted.contains(key) { return true }

        if let dot = key.lastIndex(of: ".") {
            let parent = String(key[key.startIndex ..< dot])
            // 2. One-segment wildcard — "posts.*" covers "posts.edit"
            //    but NOT "posts.comments.edit".
            if granted.contains(parent + ".*") { return true }
            // 3. Recursive wildcard, most-specific ancestor first:
            //    "posts.admin.delete" tries "posts.admin.**" then "posts.**".
            var ancestor = parent
            while true {
                if granted.contains(ancestor + ".**") { return true }
                guard let i = ancestor.lastIndex(of: ".") else { break }
                ancestor = String(ancestor[ancestor.startIndex ..< i])
            }
        }

        // 4. Global wildcard — any key, any depth.
        return granted.contains("*")
    }

    /// Inverse of `can`.
    public func cannot(_ key: String) -> Bool { !can(key) }

    /// Web-API-parity inverse — `@pyreon/permissions` exposes
    /// `can.not("posts.delete")`, so the SAME source must compile
    /// against this port unchanged. `not` is a legal Swift member
    /// name; `cannot` stays as the Swift-flavored alias.
    public func not(_ key: String) -> Bool { !can(key) }

    /// True when every `key` is granted.
    public func all(_ keys: String...) -> Bool { keys.allSatisfy { can($0) } }

    /// True when at least one `key` is granted.
    public func any(_ keys: String...) -> Bool { keys.contains { can($0) } }

    /// `callAsFunction(_:)` enables the same callable shape the web
    /// `@pyreon/permissions` API uses: `can("posts.edit")` instead of
    /// `can.can("posts.edit")`. Mirror of the PyreonMachine `m()`
    /// read-current-state pattern. Closes Gap 4's "partial A —
    /// `.can(...)` lowering needs work" item by making the web's
    /// idiomatic callable shape work unchanged on SwiftUI without
    /// any compiler-side rewriting.
    public func callAsFunction(_ key: String) -> Bool { can(key) }

    /// Replace the entire granted set.
    public func set(_ keys: Set<String>) { granted = keys }

    /// Add a single permission.
    public func grant(_ key: String) { granted.insert(key) }

    /// Remove a single permission.
    public func revoke(_ key: String) { granted.remove(key) }
}
