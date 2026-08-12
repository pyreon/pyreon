// PyreonQuery — the SwiftUI side of Pyreon's cross-platform CACHED
// data-fetching story (`useQuery`). The delta over `PyreonFetch` is the
// one thing a query library adds over a bare fetch: a KEYED CACHE with
// stale-while-revalidate, so the same `queryKey` shared across screens
// serves instantly and refetches in the background.
//
// `@pyreon/query` on the web wraps `@tanstack/query-core` — an npm library
// PMTC cannot compile — so, exactly like `PyreonFetch` reimplements the
// fetch state machine natively, this reimplements the QUERY state machine:
// cache lookup → (fresh: serve; stale: serve + refetch; miss: fetch).
//
// ## Result contract (mirrors the web `useQuery`)
//
//     query.data        // decoded result, nil until the first success
//     query.error       // last failure, nil on success
//     query.isPending   // true when there is NO data yet AND a fetch is running
//     query.isFetching  // true whenever a fetch is in flight (incl. background)
//     query.refetch()   // force a fetch, ignoring staleness
//
// The isPending / isFetching split is the whole point of a cache: a
// background refresh of already-shown data must NOT blank the UI
// (isPending stays false; only isFetching flips).
//
// ## Scope — state + cache, NOT the async orchestrator
//
// Like `PyreonFetch`, the actual network call is INJECTED (or driven by
// the compiler-emitted `.task { }` harness through begin/resolve/reject).
// This keeps the port dependency-light and synchronously unit-testable —
// inject a stub fetcher, assert the cache + state transitions — and keeps
// the Kotlin twin one-for-one. Deferred to follow-ups (disclosed, not
// implied away): mutations, infinite queries, prefetch, query
// invalidation across instances, retries/backoff, and persistence.
//
// ## The cache is process-global and keyed by `queryKey`
//
// A single `PyreonQueryCache` shared across every `PyreonQuery` instance,
// so two screens reading `["todos"]` hit the same entry — the behaviour
// that makes a query cache a cache. Entries store the decoded value as
// `Any` (the queryKey implies the type; a mismatched cast is treated as a
// miss). Bounded eviction is a follow-up; v1 keeps every key (the same
// starting point every query cache had).

import Foundation
import Observation

/// Process-global query cache. Not `@Observable` — instances observe their
/// own fields; the cache is plumbing.
public final class PyreonQueryCache: @unchecked Sendable {
    public static let shared = PyreonQueryCache()

    private struct Entry {
        let value: Any
        let at: Date
    }
    private var store: [String: Entry] = [:]
    private let lock = NSLock()

    /// The cached value for `key` and its age in seconds, or nil on a miss.
    func lookup<T>(_ key: String, as _: T.Type) -> (value: T, ageSeconds: TimeInterval)? {
        lock.lock(); defer { lock.unlock() }
        guard let e = store[key], let typed = e.value as? T else { return nil }
        return (typed, Date().timeIntervalSince(e.at))
    }

    func write(_ key: String, _ value: Any) {
        lock.lock(); defer { lock.unlock() }
        store[key] = Entry(value: value, at: Date())
    }

    /// Drop a key (invalidation). Public so an app can force a refetch path.
    public func invalidate(_ key: String) {
        lock.lock(); defer { lock.unlock() }
        store.removeValue(forKey: key)
    }

    /// Test seam — clear everything between cases.
    public func clearAll() {
        lock.lock(); defer { lock.unlock() }
        store.removeAll()
    }
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonQuery<T> {
    /// The decoded result, or nil before the first successful load.
    public private(set) var data: T?
    /// The most recent failure, or nil on success / before first load.
    public private(set) var error: Error?
    /// True when there is NO data yet AND a fetch is in flight. A background
    /// refresh of already-cached data does NOT flip this — the UI keeps its
    /// content. This is the cache's reason to exist.
    public private(set) var isPending: Bool = false
    /// True whenever a fetch is in flight, foreground or background.
    public private(set) var isFetching: Bool = false

    @ObservationIgnored public let queryKey: String
    @ObservationIgnored public let staleSeconds: TimeInterval
    @ObservationIgnored private var lastFetcher: (() throws -> T)?
    @ObservationIgnored private let cache: PyreonQueryCache

    /// `staleSeconds` — how long a cached value is served WITHOUT a refetch
    /// (default 0: always revalidate, but serve the stale value instantly
    /// while it runs, never blanking the UI).
    public init(queryKey: String, staleSeconds: TimeInterval = 0, cache: PyreonQueryCache = .shared) {
        self.queryKey = queryKey
        self.staleSeconds = staleSeconds
        self.cache = cache
        // Hydrate synchronously from the shared cache so a second screen
        // reading the same key paints immediately.
        if let hit = cache.lookup(queryKey, as: T.self) {
            data = hit.value
        }
    }

    /// Whether a fetch is needed right now: no cached value, or the cached
    /// value is older than `staleSeconds`. The emit's `.task` guards on this
    /// so a fresh cache hit skips the network entirely.
    public var isStale: Bool {
        guard let hit = cache.lookup(queryKey, as: T.self) else { return true }
        return hit.ageSeconds >= staleSeconds
    }

    // MARK: - async-harness transitions (mirror PyreonFetch)

    /// Enter the in-flight state. `isPending` is true ONLY when there is no
    /// data to show; a background refresh flips just `isFetching`.
    public func begin() {
        isFetching = true
        if data == nil { isPending = true }
        error = nil
    }

    /// Complete with a value: set `data`, WRITE THROUGH to the shared cache,
    /// clear pending/fetching.
    public func resolve(_ value: T) {
        data = value
        error = nil
        isPending = false
        isFetching = false
        cache.write(queryKey, value)
    }

    /// Complete with a failure: leaves any prior/cached `data` in place
    /// (stale-while-error), matching the web contract.
    public func reject(_ failure: Error) {
        error = failure
        isPending = false
        isFetching = false
    }

    /// Run a SYNCHRONOUS fetcher through begin → (resolve | reject). Skips
    /// the fetch when the cache is fresh (serving the hydrated value).
    /// Retains the fetcher so `refetch()` re-runs it.
    public func load(_ fetcher: @escaping () throws -> T) {
        lastFetcher = fetcher
        guard isStale else { return } // fresh cache hit — data already set
        reload()
    }

    /// Force a fetch, ignoring staleness (the user pulled to refresh).
    public func refetch() {
        reload()
    }

    private func reload() {
        guard let fetcher = lastFetcher else { return }
        begin()
        do { resolve(try fetcher()) } catch let caught { reject(caught) }
    }
}
