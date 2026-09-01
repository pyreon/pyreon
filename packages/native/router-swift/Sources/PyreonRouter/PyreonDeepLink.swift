// Inbound deep links — the path an app is OPENED at, and the paths it is sent
// to while already running.
//
// ## Why this exists
//
// `useLinking()` is OUTBOUND only (`openUrl`). Nothing carried a URL the other
// way, so an app could not be opened at a route — the capability every real
// app needs for universal links, notification taps and share targets. Both
// routers already accept an `initialPath`; the only missing piece was a
// channel from the platform's URL callback to the router. This is that
// channel, and it is deliberately runtime-only: no compiler change is needed
// because `PyreonRouter.init` consumes it through a default argument.
//
// ## Two arrival shapes, both handled
//
//   COLD  — the app is launched by the URL. The host forwards it before (or
//           around) the first router being constructed, so the value is held
//           as `pending` and the next router to initialise consumes it.
//   WARM  — the app is already running and is handed another URL. A router
//           exists, so the link is delivered straight to it.
//
// ## Listener lifecycle
//
// Exactly ONE listener slot, not a list. A router registers on init and
// releases on deinit, and registering replaces whatever was there. That is
// deliberate: an append-only listener list on a global is the classic
// unbounded-growth shape (every screen that ever built a router leaks one
// closure, and stale routers keep receiving links). One slot makes the
// invariant "the newest live router owns inbound links", which is also the
// correct semantic — the same rule the router uses for shared history.

import Foundation

/// Process-wide inbound deep-link channel.
///
/// Lock-protected rather than `@MainActor`: `PyreonRouter.init` is nonisolated
/// (it is called from a SwiftUI `@State` initialiser), so a main-actor store
/// cannot be read from its default argument — the compiler rejects it under
/// strict concurrency. In practice every producer and consumer runs on the
/// main thread anyway; the lock costs nothing uncontended and makes the type
/// honestly `Sendable` instead of relying on a convention the compiler cannot
/// see.
public enum PyreonDeepLink {
    private static let lock = NSLock()
    /// A link that arrived with no router listening — consumed by the next one
    /// to initialise. Only the most recent is kept: if two links arrive before
    /// any router exists, the app should open at the latest, exactly as it
    /// would if the second had arrived a moment later.
    nonisolated(unsafe) private static var pending: String?

    /// The single live listener (the newest router), or nil.
    nonisolated(unsafe) private static var listener: ((String) -> Void)?

    /// Forward an inbound URL. The host calls this from `onOpenURL` /
    /// `application(_:open:options:)`.
    ///
    /// Only the PATH is used: a deep link's host/scheme identify the app, not
    /// the destination, so `pyreon://app/users/42` and
    /// `https://example.com/users/42` both route to `/users/42`. A URL that
    /// yields no path routes to `/` rather than being dropped — landing on the
    /// home screen is the correct degradation for a malformed link.
    public static func receive(_ url: URL) {
        receive(path: normalizedPath(from: url))
    }

    /// Path-level entry point (tests, and hosts that already resolved a path).
    public static func receive(path: String) {
        lock.lock()
        let live = listener
        if live == nil { pending = path }
        lock.unlock()
        // Deliver OUTSIDE the lock: the listener navigates, which can build a
        // view tree and re-enter this type. Holding the lock across it would
        // deadlock on the same thread.
        live?(path)
    }

    /// Consume a link that arrived before any router existed. Returns the path
    /// as a single-element stack, or empty — which is exactly the shape
    /// `PyreonRouter.init(initialPath:)` wants, so it can be a default
    /// argument.
    ///
    /// Consuming CLEARS it: a deep link opens the app once. Leaving it set
    /// would re-navigate every router built later in the session.
    public static func takePendingPath() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        guard let path = pending else { return [] }
        pending = nil
        return [path]
    }

    /// Register the live router. Replaces any previous listener and returns a
    /// release handle; the router calls it on deinit.
    public static func setListener(_ onLink: @escaping (String) -> Void) -> () -> Void {
        lock.lock()
        listenerToken &+= 1
        let token = listenerToken
        listener = onLink
        lock.unlock()
        // Release by IDENTITY, not by position. The disposer used to nil the
        // slot unconditionally, so a router that registered EARLIER and
        // deallocated LATER cleared the slot belonging to the router that had
        // replaced it — warm deep links then died silently for the rest of the
        // session, and because the slot is nil the next link is stashed to
        // `pending` for a router that may never be constructed.
        //
        // This is leak class A, and the fix is the one this repo's own
        // `_disposableBeforeEachGuards` already uses: compare a token taken at
        // registration and clear only if it is still the live one.
        return {
            lock.lock()
            if listenerToken == token { listener = nil }
            lock.unlock()
        }
    }

    /// Identifies the CURRENT registration, so a stale disposer is a no-op.
    private static var listenerToken: UInt64 = 0

    /// Test seam — clears both slots so one test's link cannot leak into the
    /// next.
    public static func reset() {
        lock.lock()
        pending = nil
        listener = nil
        lock.unlock()
    }

    /// The route path a URL denotes.
    ///
    /// `URL.path` is empty for a custom scheme whose destination sits in the
    /// HOST position (`pyreon://about`), which is the shape most apps use, so
    /// the host is folded in when the path is empty. Query and fragment are
    /// dropped — the router owns its own search-param handling.
    static func normalizedPath(from url: URL) -> String {
        let rawPath = url.path
        if rawPath.isEmpty || rawPath == "/" {
            if let host = url.host, !host.isEmpty { return "/\(host)" }
            return "/"
        }
        return rawPath.hasPrefix("/") ? rawPath : "/\(rawPath)"
    }
}
