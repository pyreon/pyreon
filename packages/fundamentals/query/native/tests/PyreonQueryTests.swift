// PyreonQuery cache + stale-while-revalidate — a standalone assertion program
// the co-source verify gate compiles with ../swift/PyreonQuery.swift
// (-parse-as-library) and runs. Not shipped — lives under native/tests/.

import Foundation

/// Counts fetcher runs. A class with a lock: the fetchers run off the main actor.
final class Calls: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    var count: Int { lock.lock(); defer { lock.unlock() }; return n }
    func next<V>(_ value: V) -> V { lock.lock(); n += 1; lock.unlock(); return value }
}

/// Fetchers that park until the test releases them, in any order — a slow
/// response arriving after a newer one is the stale-promise case.
final class Gates: @unchecked Sendable {
    private let lock = NSLock()
    private var parked: [CheckedContinuation<Int, Error>] = []
    var count: Int { lock.lock(); defer { lock.unlock() }; return parked.count }
    func wait() async throws -> Int {
        try await withCheckedThrowingContinuation { c in lock.lock(); parked.append(c); lock.unlock() }
    }
    func waitUntil(_ n: Int) async {
        while count < n { try? await _Concurrency.Task.sleep(nanoseconds: 1_000_000) }
    }
    func release(_ index: Int, with result: Result<Int, Error>) {
        lock.lock(); let c = parked[index]; lock.unlock()
        c.resume(with: result)
    }
}

@main
struct PyreonQueryTests {
    static func check(_ cond: Bool, _ message: String) {
        if !cond { fatalError("PyreonQueryTests: \(message)") }
    }

    static func main() async {
        guard #available(iOS 17.0, macOS 14.0, *) else {
            print("[PyreonQueryTests] skipped (needs iOS 17 / macOS 14 for @Observable)")
            return
        }

        // miss → fetch, then a second instance hydrates from the shared cache
        do {
            let cache = PyreonQueryCache()
            let calls = Calls()
            let q1 = PyreonQuery<Int>(queryKey: "count", staleSeconds: 60, cache: cache)
            check(q1.data == nil, "no data before first load")
            await q1.run { calls.next(42) }
            check(q1.data == 42, "miss fetches")
            check(calls.count == 1, "fetched once")
            check(!q1.isPending, "settled")
            let q2 = PyreonQuery<Int>(queryKey: "count", staleSeconds: 60, cache: cache)
            check(q2.data == 42, "second instance hydrates from the shared cache")
            await q2.run { calls.next(99) }
            check(calls.count == 1, "a fresh cache hit must NOT refetch")
            check(q2.data == 42, "fresh hit keeps the cached value")
        }

        // stale serves the cached value immediately, then refetches
        do {
            let cache = PyreonQueryCache()
            cache.write("k", 1)
            let q = PyreonQuery<Int>(queryKey: "k", staleSeconds: 0, cache: cache)
            check(q.data == 1, "stale value served immediately (no UI blank)")
            check(q.isStale, "staleSeconds 0 → stale")
            let calls = Calls()
            await q.run { calls.next(2) }
            check(calls.count == 1, "a stale value triggers a background refetch")
            check(q.data == 2, "refetch updates data")
        }

        // a background refresh of shown data flips only isFetching, never isPending
        do {
            let cache = PyreonQueryCache()
            let q = PyreonQuery<Int>(queryKey: "b", staleSeconds: 0, cache: cache)
            await q.run { 7 }
            check(q.data == 7, "loaded")
            q.begin()
            check(!q.isPending, "a refetch of shown data must not flip isPending")
            check(q.isFetching, "isFetching flips")
            q.resolve(8)
            check(q.data == 8, "resolved")
            check(!q.isFetching, "settled")
        }

        // an error leaves the last good data in place (stale-while-error)
        do {
            let cache = PyreonQueryCache()
            let q = PyreonQuery<Int>(queryKey: "e", cache: cache)
            await q.run { 5 }
            q.begin()
            struct Boom: Error {}
            q.reject(Boom())
            check(q.error != nil, "error recorded")
            check(q.data == 5, "an error keeps the last good data (stale-while-error)")
        }

        // bounded: past maxEntries the least recently USED entry goes, so a
        // runtime key (one entry per route param) cannot grow the cache forever
        do {
            let cache = PyreonQueryCache(maxEntries: 2)
            cache.write("a", 1)
            cache.write("b", 2)
            check(cache.lookup("a", as: Int.self) != nil, "a is cached")
            cache.write("c", 3) // a was just used, so b is the least recent
            check(cache.count == 2, "the cache stays at maxEntries")
            check(cache.lookup("b", as: Int.self) == nil, "the least recently used key was evicted")
            check(cache.lookup("a", as: Int.self)?.value == 1, "a recently read key survives")
            check(cache.lookup("c", as: Int.self)?.value == 3, "the new key is cached")
            for i in 0..<50 { cache.write("k\(i)", i) }
            check(cache.count == 2, "a burst of distinct keys never exceeds the bound")
            cache.maxEntries = 1
            cache.write("z", 9)
            check(cache.count == 1, "lowering maxEntries sheds down to the new bound")
        }

        // refetch() re-runs the REGISTERED request, ignoring freshness: the
        // harness handed `run` the request, and a tap long after it returned
        // must fetch again even though the cache is fresh.
        do {
            let cache = PyreonQueryCache()
            let calls = Calls()
            let q = PyreonQuery<Int>(queryKey: "r", staleSeconds: 60, cache: cache)
            await q.run { calls.next(calls.count + 1) }
            check(q.data == 1 && calls.count == 1, "the first run fetches on a miss")
            check(!q.isStale, "the cache is fresh after the first fetch")
            await q.refetch()?.value
            check(calls.count == 2, "refetch re-runs the registered request even when the cache is fresh")
            check(q.data == 2, "refetch replaces data on success")
            check(!q.isFetching && !q.isPending, "refetch settles its flags")
            check(cache.lookup("r", as: Int.self)?.value == 2, "refetch writes through to the cache")
        }

        // refetch before any request was registered is a no-op, not a crash
        do {
            let q = PyreonQuery<Int>(queryKey: "none", cache: PyreonQueryCache())
            check(q.refetch() == nil, "nothing to refetch before run registered a request")
        }

        // isFetching is true while a refetch is in flight; a failure sets error and keeps data
        do {
            let cache = PyreonQueryCache()
            let gates = Gates()
            cache.write("f", 1)
            let hydrated = PyreonQuery<Int>(queryKey: "f", staleSeconds: 60, cache: cache)
            check(hydrated.data == 1, "hydrated")
            await hydrated.run { try await gates.wait() } // fresh: registers, no fetch
            check(gates.count == 0, "a fresh hit does not fetch")
            let task = hydrated.refetch()
            await gates.waitUntil(1)
            check(hydrated.isFetching, "isFetching while the refetch is in flight")
            check(!hydrated.isPending, "a refetch of shown data never flips isPending")
            struct Boom: Error {}
            gates.release(0, with: .failure(Boom()))
            await task?.value
            check(hydrated.error != nil, "a failed refetch sets error")
            check(hydrated.data == 1, "a failed refetch keeps the last good data")
            check(!hydrated.isFetching, "a failed refetch settles isFetching")
        }

        // a slow, superseded response never overwrites a newer one (class F)
        do {
            let cache = PyreonQueryCache()
            let gates = Gates()
            cache.write("s", 0)
            let live = PyreonQuery<Int>(queryKey: "s", staleSeconds: 60, cache: cache)
            await live.run { try await gates.wait() }
            let older = live.refetch()
            await gates.waitUntil(1)
            let newer = live.refetch()
            await gates.waitUntil(2)
            gates.release(1, with: .success(2)) // the newer request answers first
            await newer?.value
            check(live.data == 2, "the newer response is applied")
            check(!live.isFetching, "settled by the newer response")
            gates.release(0, with: .success(1)) // the slow, older one arrives late
            await older?.value
            check(live.data == 2, "a stale response must not overwrite a newer one")
            check(cache.lookup("s", as: Int.self)?.value == 2, "nor overwrite the cache")
        }

        // a key change abandons the old key's fetch: its response is neither shown nor cached under the new key
        do {
            let cache = PyreonQueryCache()
            let gates = Gates()
            let q = PyreonQuery<Int>(queryKey: "", cache: cache)
            q.setKey("a")
            let first = _Concurrency.Task { @MainActor in await q.run { try await gates.wait() } }
            await gates.waitUntil(1)
            check(q.isFetching, "fetching key a")
            q.setKey("b")
            check(!q.isFetching, "a key change abandons the old key's fetch")
            gates.release(0, with: .success(1))
            await first.value
            check(q.data == nil, "the old key's response is not shown for the new key")
            check(cache.lookup("b", as: Int.self) == nil, "nor cached under the new key")
        }

        print("[PyreonQueryTests] all assertions passed")
        // The package's other suites share this one entry point (the gate compiles every test file together).
        await runPyreonMutationTests()
        await runPyreonInfiniteQueryTests()
    }
}
