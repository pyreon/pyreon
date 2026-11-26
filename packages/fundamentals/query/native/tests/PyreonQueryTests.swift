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

/// Wait (bounded) for work an invalidation started on the main actor.
@MainActor
func waitFor(_ condition: () -> Bool) async {
    for _ in 0..<500 {
        if condition() { return }
        try? await _Concurrency.Task.sleep(nanoseconds: 1_000_000)
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

        // invalidateQueries(root) refetches every LIVE query under root — the
        // key `root` or a `root:` key — and leaves every other key alone.
        do {
            let cache = PyreonQueryCache()
            let calls = Calls()
            let list = PyreonQuery<Int>(queryKey: "todo:list", staleSeconds: 60, cache: cache)
            let one = PyreonQuery<Int>(queryKey: "todo:7", staleSeconds: 60, cache: cache)
            let other = PyreonQuery<Int>(queryKey: "todos:list", staleSeconds: 60, cache: cache)
            await list.run { calls.next(1) }
            await one.run { calls.next(2) }
            await other.run { calls.next(3) }
            check(calls.count == 3 && cache.liveCount == 3, "three live queries, each fetched once")
            await cache.invalidateQueries("todo").value
            check(calls.count == 5, "both `todo` queries refetched, ignoring their fresh cache")
            check(!list.isFetching && !one.isFetching, "the refetches settled")
            check(other.data == 3, "`todos` is not under `todo`")
            // An unrelated root refetches nothing.
            await cache.invalidateQueries("user").value
            check(calls.count == 5, "no live query under `user`")
        }

        // An invalidated entry with no live query is still SERVED (no blank)
        // but stale whatever its age: the next screen to mount refetches it.
        do {
            let cache = PyreonQueryCache()
            cache.write("todo:list", 1)
            let before = PyreonQuery<Int>(queryKey: "todo:list", staleSeconds: 60, cache: cache)
            check(!before.isStale, "fresh before the invalidation")
            await cache.invalidateQueries("todo").value
            let after = PyreonQuery<Int>(queryKey: "todo:list", staleSeconds: 60, cache: cache)
            check(after.data == 1, "an invalidated value is still served on mount")
            check(after.isStale, "but it is stale whatever staleSeconds says")
            let calls = Calls()
            await after.run { calls.next(2) }
            check(calls.count == 1 && after.data == 2, "so mounting refetches it")
            check(!after.isStale, "and the refetched value is fresh again")
        }

        // A query is live only once it holds a request, and leaves the
        // registry when it is released (the view that owned it went away).
        do {
            let cache = PyreonQueryCache()
            let calls = Calls()
            do {
                let idle = PyreonQuery<Int>(queryKey: "todo:list", cache: cache)
                check(cache.liveCount == 0, "a query that never ran is not live")
                await idle.run { calls.next(1) }
                check(cache.liveCount == 1, "running registers it")
                idle.setKey("todo:8")
                await cache.invalidateQueries("todo:8").value
                check(calls.count == 2, "the registry follows a key change")
            }
            check(cache.liveCount == 0, "a released query is unregistered")
            await cache.invalidateQueries("todo").value
            check(calls.count == 2, "and an invalidation no longer reaches it")
        }

        // settleMutation: success invalidates the root; a failure does not.
        do {
            let cache = PyreonQueryCache()
            let calls = Calls()
            let list = PyreonQuery<Int>(queryKey: "todo:list", staleSeconds: 60, cache: cache)
            await list.run { calls.next(calls.count + 1) }
            struct Boom: Error {}
            do {
                _ = try await cache.settleMutation(invalidating: "todo") { () async throws -> Int in throw Boom() }
                check(false, "a failed mutation rethrows")
            } catch {}
            for _ in 0..<5 { await _Concurrency.Task.yield() }
            check(calls.count == 1, "a failed mutation invalidates nothing")
            let saved = try? await cache.settleMutation(invalidating: "todo") { 42 }
            check(saved == 42, "a successful mutation returns its value")
            await waitFor { calls.count == 2 && !list.isFetching }
            check(calls.count == 2 && list.data == 2, "a successful mutation refetches the live `todo` query")
        }

        // A URL root covers the paths below it and its query strings, segment-safe,
        // so invalidating `GET:<list url>` refreshes the list AND its detail queries.
        do {
            let root = "GET:https://h/books"
            check(PyreonQueryCache.under(root, root), "a root covers itself")
            check(PyreonQueryCache.under(root, root + "/1"), "a URL root covers a path below it")
            check(PyreonQueryCache.under(root, root + "?q=a"), "a URL root covers its query strings")
            check(!PyreonQueryCache.under(root, "GET:https://h/bookshelf"), "segment-safe")
            check(PyreonQueryCache.under("todo", "todo:8") && !PyreonQueryCache.under("todo", "todos"), "`:` scoping unchanged")
            let cache = PyreonQueryCache()
            let calls = Calls()
            let detail = PyreonQuery<Int>(queryKey: root + "/7", staleSeconds: 60, cache: cache)
            await detail.run { calls.next(calls.count + 1) }
            _ = try? await cache.settleMutation(invalidating: root) { 1 }
            await waitFor { calls.count == 2 && !detail.isFetching }
            check(calls.count == 2, "a mutation invalidating the list root refetches a live detail query")
        }

        // setQueryData: the optimistic write reaches the cache and every live
        // query on the key, drops their in-flight fetch, and rolls back.
        do {
            let cache = PyreonQueryCache()
            let gates = Gates()
            cache.write("todo:1", 10)
            let one = PyreonQuery<Int>(queryKey: "todo:1", staleSeconds: 60, cache: cache)
            let twin = PyreonQuery<Int>(queryKey: "todo:1", staleSeconds: 60, cache: cache)
            let other = PyreonQuery<Int>(queryKey: "todo:2", staleSeconds: 60, cache: cache)
            await one.run { try await gates.wait() }
            await twin.run { 10 }
            await other.run { 20 }
            let inFlight = one.refetch()
            await gates.waitUntil(1)
            check(one.isFetching, "a fetch is in flight")
            let rollback = cache.setQueryData("todo:1", as: Int.self) { $0 + 1 }
            check(rollback != nil, "a cached value was patched")
            check(one.data == 11 && twin.data == 11, "every live query on the key shows the optimistic value")
            check(other.data == 20, "another key is untouched")
            check(cache.lookup("todo:1", as: Int.self)?.value == 11, "the cache holds the optimistic value")
            check(!one.isFetching, "the in-flight fetch is cancelled")
            gates.release(0, with: .success(99))
            await inFlight?.value
            check(one.data == 11, "the cancelled fetch cannot overwrite the optimistic value")
            rollback?.rollback()
            check(one.data == 10 && twin.data == 10, "rollback restores every query")
            check(cache.lookup("todo:1", as: Int.self)?.value == 10, "and the cache")
            rollback?.rollback()
            check(one.data == 10, "a second rollback is a no-op")
            check(cache.setQueryData("todo:3", as: Int.self) { $0 + 1 } == nil, "nothing cached: nothing to patch")
            check(cache.lookup("todo:3", as: Int.self) == nil, "and nothing is written")
        }

        // settleMutation with a rollback: a failure rolls back; success keeps the
        // optimistic value until the refetch replaces it with the server's.
        do {
            let cache = PyreonQueryCache()
            cache.write("todo:1", 10)
            let one = PyreonQuery<Int>(queryKey: "todo:1", staleSeconds: 60, cache: cache)
            await one.run { 10 }
            struct Boom: Error {}
            let failed = cache.setQueryData("todo:1", as: Int.self) { _ in 11 }
            do {
                _ = try await cache.settleMutation(invalidating: "todo", rollback: failed) { () async throws -> Int in throw Boom() }
            } catch {}
            check(one.data == 10, "a failed mutation rolls the optimistic value back")
            let kept = cache.setQueryData("todo:1", as: Int.self) { _ in 12 }
            _ = try? await cache.settleMutation(invalidating: "todo", rollback: kept) { 12 }
            check(one.data == 12, "success keeps the optimistic value until the refetch answers")
            await waitFor { one.data == 10 && !one.isFetching }
            check(one.data == 10, "success refetches: the server's value replaces the optimistic one")
        }

        // The EMITTED shape end to end (what `@pyreon/feature`'s `useUpdate` lowers to):
        // PyreonMutation with the request + the call-site optimistic write as its
        // input, settled through settleMutation — against the real runtimes.
        do {
            struct Rec: Equatable { var id = "1"; var done = false }
            let cache = PyreonQueryCache.shared
            cache.clearAll()
            let one = PyreonQuery<Rec>(queryKey: "todo:1", staleSeconds: 60)
            let server = Calls()
            await one.run { server.next(Rec(done: server.count >= 1)) }
            check(one.data == Rec(done: false), "loaded")
            let update = PyreonMutation<Rec>()
            let id = "1"
            update.mutate(("PUT /todos/1", cache.setQueryData("todo:\(id)", as: Rec.self, { __old in var __new = __old; __new.done = true; return __new })), { __input in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo", rollback: __input.1) { Rec(done: true) } })
            check(one.data == Rec(done: true), "the optimistic write shows before the request settles")
            await waitFor { update.isSuccess && server.count == 2 && !one.isFetching }
            check(server.count == 2, "the success refetched the record")
            struct Boom: Error {}
            let failing = PyreonMutation<Rec>()
            failing.mutate(("PUT /todos/1", cache.setQueryData("todo:\(id)", as: Rec.self, { __old in var __new = __old; __new.done = false; return __new })), { __input in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo", rollback: __input.1) { () async throws -> Rec in throw Boom() } })
            check(one.data == Rec(done: false), "optimistic")
            await waitFor { failing.isError }
            check(one.data == Rec(done: true), "a failed update rolls the optimistic write back")
            check(server.count == 2, "and refetches nothing")
            cache.clearAll()
        }

        print("[PyreonQueryTests] all assertions passed")
        // The package's other suites share this one entry point (the gate compiles every test file together).
        await runPyreonMutationTests()
        await runPyreonInfiniteQueryTests()
    }
}
