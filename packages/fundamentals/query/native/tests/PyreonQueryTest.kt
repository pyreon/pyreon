// Smoke tests for PyreonQuery — cache + stale-while-revalidate state
// machine, the Kotlin twin of the Swift PyreonQuery tests. Dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonQuery`.

package com.pyreon.runtime

fun testQueryFetchesOnMissThenServesFromCache() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val q1 = PyreonQuery<Int>("count", staleMillis = 60_000)
    check(q1.data.value == null) { "fresh query starts with no data" }
    q1.load { calls++; 42 }
    check(q1.data.value == 42) { "load resolved the value" }
    check(calls == 1) { "one fetch on a miss" }
    check(!q1.isPending.value) { "not pending after resolve" }
    // Second instance, same key, still fresh: hydrates, NO fetch.
    val q2 = PyreonQuery<Int>("count", staleMillis = 60_000)
    check(q2.data.value == 42) { "second instance hydrated from the shared cache" }
    q2.load { calls++; 99 }
    check(calls == 1) { "a fresh cache hit must NOT refetch" }
    check(q2.data.value == 42) { "still the cached value" }
}

fun testQueryStaleServesCachedThenRefetches() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("k", 1)
    val q = PyreonQuery<Int>("k", staleMillis = 0)
    check(q.data.value == 1) { "stale value served immediately (no UI blank)" }
    check(q.isStale) { "staleMillis 0 means immediately stale" }
    var calls = 0
    q.load { calls++; 2 }
    check(calls == 1) { "a stale value triggers a background refetch" }
    check(q.data.value == 2) { "refetch updated the value" }
}

fun testQueryBackgroundRefreshDoesNotBlankUI() {
    PyreonQueryCache.clearAll()
    val q = PyreonQuery<Int>("b", staleMillis = 0)
    q.load { 7 }
    check(q.data.value == 7)
    q.begin()
    check(!q.isPending.value) { "a refetch of shown data must not flip isPending" }
    check(q.isFetching.value) { "isFetching flips on a background refresh" }
    q.resolve(8)
    check(q.data.value == 8)
    check(!q.isFetching.value)
}

fun testQueryRejectKeepsStaleData() {
    PyreonQueryCache.clearAll()
    val q = PyreonQuery<Int>("e")
    q.load { 5 }
    q.begin()
    q.reject(RuntimeException("boom"))
    check(q.error.value != null) { "error is set" }
    check(q.data.value == 5) { "an error leaves the last good data in place (stale-while-error)" }
}

fun main() {
    testQueryFetchesOnMissThenServesFromCache()
    testQueryStaleServesCachedThenRefetches()
    testQueryBackgroundRefreshDoesNotBlankUI()
    testQueryRejectKeepsStaleData()
    println("[PyreonQueryTest] all smoke tests passed")
}
