// PyreonQuery cache + stale-while-revalidate — a standalone assertion program
// the co-source verify gate compiles with ../swift/PyreonQuery.swift
// (-parse-as-library) and runs. Not shipped — lives under native/tests/.

import Foundation

@main
struct PyreonQueryTests {
    static func check(_ cond: Bool, _ message: String) {
        if !cond { fatalError("PyreonQueryTests: \(message)") }
    }

    static func main() {
        guard #available(iOS 17.0, macOS 14.0, *) else {
            print("[PyreonQueryTests] skipped (needs iOS 17 / macOS 14 for @Observable)")
            return
        }

        // miss → fetch, then a second instance hydrates from the shared cache
        do {
            let cache = PyreonQueryCache()
            var calls = 0
            let q1 = PyreonQuery<Int>(queryKey: "count", staleSeconds: 60, cache: cache)
            check(q1.data == nil, "no data before first load")
            q1.load { calls += 1; return 42 }
            check(q1.data == 42, "miss fetches")
            check(calls == 1, "fetched once")
            check(!q1.isPending, "settled")
            let q2 = PyreonQuery<Int>(queryKey: "count", staleSeconds: 60, cache: cache)
            check(q2.data == 42, "second instance hydrates from the shared cache")
            q2.load { calls += 1; return 99 }
            check(calls == 1, "a fresh cache hit must NOT refetch")
            check(q2.data == 42, "fresh hit keeps the cached value")
        }

        // stale serves the cached value immediately, then refetches
        do {
            let cache = PyreonQueryCache()
            cache.write("k", 1)
            let q = PyreonQuery<Int>(queryKey: "k", staleSeconds: 0, cache: cache)
            check(q.data == 1, "stale value served immediately (no UI blank)")
            check(q.isStale, "staleSeconds 0 → stale")
            var calls = 0
            q.load { calls += 1; return 2 }
            check(calls == 1, "a stale value triggers a background refetch")
            check(q.data == 2, "refetch updates data")
        }

        // a background refresh of shown data flips only isFetching, never isPending
        do {
            let cache = PyreonQueryCache()
            let q = PyreonQuery<Int>(queryKey: "b", staleSeconds: 0, cache: cache)
            q.load { 7 }
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
            q.load { 5 }
            q.begin()
            struct Boom: Error {}
            q.reject(Boom())
            check(q.error != nil, "error recorded")
            check(q.data == 5, "an error keeps the last good data (stale-while-error)")
        }

        print("[PyreonQueryTests] all assertions passed")
    }
}
