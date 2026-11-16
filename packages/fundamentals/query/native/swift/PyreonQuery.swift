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
// ## The query OWNS its request
//
// The compiler-emitted `.task { }` harness hands the request it built to
// `run(_:)`, which keeps it and fetches when the cache is stale. Keeping it
// is what makes `refetch()` work: it re-runs that same request, ignoring
// staleness, from a button tap or pull-to-refresh long after the harness
// returned. Every fetch takes a generation number, so a slow response that
// a newer fetch (or a key change) superseded never overwrites the newer
// state. The network call itself stays INJECTED — the runtime never builds
// a request — so the tests drive it with stub fetchers, and the Kotlin twin
// stays one-for-one. Deferred to follow-ups (disclosed, not implied away):
// prefetch, retries/backoff, and persistence.
//
// ## The cache is process-global and keyed by `queryKey`
//
// A single `PyreonQueryCache` shared across every `PyreonQuery` instance,
// so two screens reading `["todos"]` hit the same entry — the behaviour
// that makes a query cache a cache. Entries store the decoded value as
// `Any` (the queryKey implies the type; a mismatched cast is treated as a
// miss). The cache is BOUNDED: past `maxEntries` the least recently used
// entry is evicted. A runtime key (a route param, a prop) adds one entry per
// distinct value, so an unbounded cache grows for the life of the process.
// Evicting is always safe: a live `PyreonQuery` keeps its own `data`, so an
// evicted key costs only a refetch on its next stale check.
//
// ## The cache is also the query CLIENT: invalidation across instances
//
// The web's `queryClient.invalidateQueries({ queryKey: [root] })` marks every
// query under `root` stale and refetches the ones a component is observing.
// The native analogue lives here, because every `PyreonQuery` already holds
// its cache: a query that registered a request (`run`) is LIVE, and
// `invalidateQueries(root)` marks every cached entry under `root` stale and
// refetches every live query under it. Keys are the colon-joined web keys
// (`['todo', 5]` → `todo:5`), so "under `root`" is `root` itself or a key that
// starts with `root:`. `setQueryData` is `queryClient.setQueryData` for an
// optimistic write, returning the rollback; `settleMutation` runs a
// mutation's request and applies both on its outcome.
//
// The live registry holds WEAK references keyed by identity, and a query
// removes itself in `deinit` — so a screen that goes away never stays
// reachable through the registry (and a dead weak entry is pruned on the
// next scan as a backstop).

import Foundation
import Observation

/// Process-global query cache. Not `@Observable` — instances observe their
/// own fields; the cache is plumbing.
public final class PyreonQueryCache: @unchecked Sendable {
    public static let shared = PyreonQueryCache()

    private struct Entry {
        let value: Any
        let at: Date
        /// Set by `invalidateQueries`: the value is still served (no blank),
        /// but it is stale whatever its age, so the next check refetches.
        var invalidated = false
    }

    /// A query that registered a request — what `invalidateQueries` refetches.
    private struct Live {
        weak var query: (any PyreonLiveQuery)?
        var key: String
    }
    /// Live queries by identity. Weak, and removed by the query's `deinit`.
    private var live: [ObjectIdentifier: Live] = [:]
    private var store: [String: Entry] = [:]
    /// Keys from least to most recently used. Bounded by `maxEntries`, so the
    /// linear moves stay small.
    private var recency: [String] = []
    private let lock = NSLock()

    /// The most entries kept before the least recently used is evicted.
    /// Settable per app (`PyreonQueryCache.shared.maxEntries = 500`); lowering
    /// it evicts down to the new bound on the next write.
    public var maxEntries: Int {
        get { lock.lock(); defer { lock.unlock() }; return _maxEntries }
        set { lock.lock(); defer { lock.unlock() }; _maxEntries = max(1, newValue) }
    }
    private var _maxEntries: Int

    public init(maxEntries: Int = 100) {
        _maxEntries = max(1, maxEntries)
    }

    /// The cached value for `key` and its age in seconds, or nil on a miss.
    /// A hit counts as a use for eviction. An invalidated entry is infinitely
    /// old, so it is stale whatever the query's `staleSeconds`.
    func lookup<T>(_ key: String, as _: T.Type) -> (value: T, ageSeconds: TimeInterval)? {
        lock.lock(); defer { lock.unlock() }
        guard let e = store[key], let typed = e.value as? T else { return nil }
        touch(key)
        return (typed, e.invalidated ? .infinity : Date().timeIntervalSince(e.at))
    }

    func write(_ key: String, _ value: Any) {
        lock.lock(); defer { lock.unlock() }
        store[key] = Entry(value: value, at: Date())
        touch(key)
        while store.count > _maxEntries, let oldest = recency.first {
            recency.removeFirst()
            store.removeValue(forKey: oldest)
        }
    }

    /// Number of cached entries (for tests and diagnostics).
    public var count: Int {
        lock.lock(); defer { lock.unlock() }
        return store.count
    }

    /// Drop a key (invalidation). Public so an app can force a refetch path.
    public func invalidate(_ key: String) {
        lock.lock(); defer { lock.unlock() }
        store.removeValue(forKey: key)
        recency.removeAll { $0 == key }
    }

    /// Test seam — clear everything between cases.
    public func clearAll() {
        lock.lock(); defer { lock.unlock() }
        store.removeAll()
        recency.removeAll()
        live.removeAll()
    }

    // MARK: - The query client: live queries, invalidation, optimistic writes

    /// Number of live (registered) queries — for tests and diagnostics.
    public var liveCount: Int {
        lock.lock(); defer { lock.unlock() }
        live = live.filter { $0.value.query != nil }
        return live.count
    }

    func register(_ query: any PyreonLiveQuery, key: String) {
        lock.lock(); defer { lock.unlock() }
        live[ObjectIdentifier(query)] = Live(query: query, key: key)
    }

    /// A registered query changed its key; an unregistered one stays out.
    func rekey(_ query: any PyreonLiveQuery, key: String) {
        lock.lock(); defer { lock.unlock() }
        live[ObjectIdentifier(query)]?.key = key
    }

    func unregister(_ id: ObjectIdentifier) {
        lock.lock(); defer { lock.unlock() }
        live.removeValue(forKey: id)
    }

    /// The live queries whose key passes `matches`, as strong references.
    /// Prunes dead weak entries. Caller holds the lock.
    private func liveLocked(_ matches: (String) -> Bool) -> [any PyreonLiveQuery] {
        var out: [any PyreonLiveQuery] = []
        for (id, entry) in live {
            guard let query = entry.query else { live.removeValue(forKey: id); continue }
            if matches(entry.key) { out.append(query) }
        }
        return out
    }

    /// `queryClient.invalidateQueries({ queryKey: [root] })`: every cached
    /// entry under `root` (the key `root`, or one starting with `root:`) is
    /// marked stale — still served, refetched on its next check — and every
    /// LIVE query under it refetches now. Callable from any thread; the
    /// refetches start on the main actor. The returned task settles when
    /// they all have (the emitted code ignores it).
    @discardableResult
    public func invalidateQueries(_ root: String) -> _Concurrency.Task<Void, Never> {
        let prefix = root + ":"
        let matches: (String) -> Bool = { $0 == root || $0.hasPrefix(prefix) }
        lock.lock()
        for key in store.keys where matches(key) { store[key]?.invalidated = true }
        let queries = liveLocked(matches)
        lock.unlock()
        return _Concurrency.Task { @MainActor in
            let running = queries.compactMap { $0.refetch() }
            for task in running { await task.value }
        }
    }

    /// `queryClient.setQueryData(key, updater)` for an optimistic write: the
    /// cached value under exactly `key` (or, when the cache evicted it, a live
    /// query's data) is passed to `update`, and the result is written to the
    /// cache and shown by every live query on that key. A fetch those queries
    /// have in flight is dropped (`cancelQueries`), so it cannot overwrite the
    /// optimistic value. Returns the rollback, or nil when there was no value
    /// to update — the web writes the PARTIAL patch then, which no typed
    /// record can hold, so nothing is written. Call on the main thread.
    @available(iOS 17.0, macOS 14.0, *)
    public func setQueryData<T>(_ key: String, as _: T.Type, _ update: (T) -> T) -> PyreonQueryRollback? {
        lock.lock()
        let previous = store[key]
        let holders = liveLocked { $0 == key }.compactMap { $0 as? PyreonQuery<T> }
        lock.unlock()
        guard let base = (previous?.value as? T) ?? holders.lazy.compactMap({ $0.data }).first else { return nil }
        let next = update(base)
        write(key, next)
        var restores: [() -> Void] = []
        for query in holders {
            let before = query.data
            query.cancelFetch()
            query.setData(next)
            restores.append { [weak query] in query?.setData(before) }
        }
        return PyreonQueryRollback { [weak self] in
            guard let self else { return }
            self.lock.lock()
            if let previous {
                self.store[key] = previous
                self.touch(key)
            } else {
                self.store.removeValue(forKey: key)
                self.recency.removeAll { $0 == key }
            }
            self.lock.unlock()
            for restore in restores { restore() }
        }
    }

    /// A mutation's request, settled the way the web's `onSuccess` /
    /// `onError` settle the queries: success invalidates every query under
    /// `root`; a failure rolls the optimistic write back and invalidates
    /// nothing. A CANCELLED request rolls back AND invalidates — whether the
    /// server applied the write is unknown, so the queries ask it.
    public func settleMutation<T>(
        invalidating root: String,
        rollback: PyreonQueryRollback? = nil,
        _ operation: () async throws -> T
    ) async throws -> T {
        do {
            let value = try await operation()
            invalidateQueries(root)
            return value
        } catch {
            if let rollback { await rollback.rollback() }
            if error is CancellationError { invalidateQueries(root) }
            throw error
        }
    }

    /// Move `key` to the most-recently-used end. Caller holds the lock.
    private func touch(_ key: String) {
        if let i = recency.firstIndex(of: key) { recency.remove(at: i) }
        recency.append(key)
    }
}

/// What the cache's live registry can do with a query of any type.
protocol PyreonLiveQuery: AnyObject {
    @discardableResult func refetch() -> _Concurrency.Task<Void, Never>?
}

/// Undo of one optimistic `setQueryData`: restores the cached value and every
/// live query's data as they were. Runs at most once.
public final class PyreonQueryRollback: @unchecked Sendable {
    private var restore: (() -> Void)?

    init(_ restore: @escaping () -> Void) {
        self.restore = restore
    }

    @MainActor
    public func rollback() {
        let run = restore
        restore = nil
        run?()
    }
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonQuery<T>: PyreonLiveQuery {
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

    @ObservationIgnored public private(set) var queryKey: String
    @ObservationIgnored public let staleSeconds: TimeInterval
    /// The request the harness registered through `run(_:)`; `refetch()` re-runs it.
    @ObservationIgnored private var fetcher: (() async throws -> T)?
    /// Bumped by every fetch and every key change: a response settles state only
    /// while its own generation is still the latest (no stale-promise overwrite).
    @ObservationIgnored private var generation = 0
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

    // A query leaves the live registry with the view that owned it.
    deinit {
        cache.unregister(ObjectIdentifier(self))
    }

    /// Re-point this query at a RUNTIME-computed cache key (a `queryKey` built
    /// from a prop / route-param / signal). The compiler-emitted
    /// `.task(id: key)` calls this before the staleness check, so a key change
    /// (a new prop/signal value) re-keys the cache lookup + write. Idempotent
    /// when the key is unchanged; on a change, re-hydrates `data` from the
    /// shared cache for the NEW key (a hit paints without a refetch; a miss
    /// clears the stale value so `isPending` is honest). Constructed keyless
    /// (`queryKey: ""`) because SwiftUI's `@State` default can't reference the
    /// component's other properties.
    public func setKey(_ key: String) {
        guard key != queryKey else { return }
        // A fetch still in flight belongs to the OLD key: drop its result
        // (it must not be cached under the new key) and its in-flight flags.
        generation += 1
        isFetching = false
        isPending = false
        queryKey = key
        data = cache.lookup(key, as: T.self)?.value
        cache.rekey(self, key: key)
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

    /// Register the request and fetch it when the cache is stale (a fresh
    /// hit keeps the hydrated value and skips the network). The emitted
    /// `.task` harness calls this with the request it builds; the query keeps
    /// it so `refetch()` can re-run it later.
    @MainActor
    public func run(_ fetcher: @escaping () async throws -> T) async {
        self.fetcher = fetcher
        // Holding a request makes it LIVE: an invalidation of its key refetches it.
        cache.register(self, key: queryKey)
        guard isStale else { return }
        await fetch(fetcher)
    }

    /// Force a fetch of the registered request, ignoring staleness (the user
    /// pulled to refresh). `isFetching` is true until it settles; on success
    /// `data` is replaced, on failure `error` is set and `data` kept. A no-op
    /// before the harness registered a request. Returns the running task so a
    /// caller can await it; the emitted code ignores it.
    @discardableResult
    public func refetch() -> _Concurrency.Task<Void, Never>? {
        guard let fetcher else { return nil }
        return _Concurrency.Task { @MainActor [weak self] in
            await self?.fetch(fetcher)
        }
    }

    /// An optimistic write (`PyreonQueryCache.setQueryData`) or its rollback.
    func setData(_ value: T?) {
        data = value
    }

    /// `cancelQueries`: a fetch in flight settles nothing (its response would
    /// overwrite an optimistic value), and the in-flight flags clear.
    func cancelFetch() {
        generation += 1
        isFetching = false
        isPending = false
    }

    @MainActor
    private func fetch(_ fetcher: () async throws -> T) async {
        generation += 1
        let mine = generation
        begin()
        do {
            let value = try await fetcher()
            guard mine == generation else { return } // superseded: a newer fetch owns the state
            resolve(value)
        } catch let failure {
            guard mine == generation else { return }
            if _Concurrency.Task.isCancelled {
                // The view went away (or its key changed): not a failure to show.
                isFetching = false
                isPending = false
            } else {
                reject(failure)
            }
        }
    }
}
