// Smoke tests for PyreonQuery — cache + stale-while-revalidate state
// machine, the Kotlin twin of the Swift PyreonQuery tests. Dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonQuery`.

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine

/** Start a suspend block on the calling thread; it runs until its first suspension. */
private fun start(block: suspend () -> Unit) {
    block.startCoroutine(Continuation(EmptyCoroutineContext) { it.getOrThrow() })
}

/** The launcher the emitted harness passes (`scope.launch`), stood in by [start]. */
private val launchNow: (suspend () -> Unit) -> Unit = { start(it) }

/** `run` with stub fetchers that never suspend, driven to completion here. */
private fun <T> PyreonQuery<T>.runNow(fetcher: suspend () -> T) = start { run(launchNow, fetcher) }

/** Fetchers that park until the test releases them, in any order. */
private class Gates {
    val parked = ArrayList<Continuation<Int>>()
    suspend fun wait(): Int = suspendCoroutine { parked.add(it) }
}

fun testQueryFetchesOnMissThenServesFromCache() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val q1 = PyreonQuery<Int>("count", staleMillis = 60_000)
    check(q1.data.value == null) { "fresh query starts with no data" }
    q1.runNow { calls++; 42 }
    check(q1.data.value == 42) { "load resolved the value" }
    check(calls == 1) { "one fetch on a miss" }
    check(!q1.isPending.value) { "not pending after resolve" }
    // Second instance, same key, still fresh: hydrates, NO fetch.
    val q2 = PyreonQuery<Int>("count", staleMillis = 60_000)
    check(q2.data.value == 42) { "second instance hydrated from the shared cache" }
    q2.runNow { calls++; 99 }
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
    q.runNow { calls++; 2 }
    check(calls == 1) { "a stale value triggers a background refetch" }
    check(q.data.value == 2) { "refetch updated the value" }
}

fun testQueryBackgroundRefreshDoesNotBlankUI() {
    PyreonQueryCache.clearAll()
    val q = PyreonQuery<Int>("b", staleMillis = 0)
    q.runNow { 7 }
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
    q.runNow { 5 }
    q.begin()
    q.reject(RuntimeException("boom"))
    check(q.error.value != null) { "error is set" }
    check(q.data.value == 5) { "an error leaves the last good data in place (stale-while-error)" }
}

fun testQueryCacheEvictsLeastRecentlyUsed() {
    PyreonQueryCache.clearAll()
    val before = PyreonQueryCache.maxEntries
    try {
        PyreonQueryCache.maxEntries = 2
        PyreonQueryCache.write("a", 1)
        PyreonQueryCache.write("b", 2)
        check(PyreonQueryCache.lookup<Int>("a") != null) { "a is cached" }
        PyreonQueryCache.write("c", 3) // a was just used, so b is the least recent
        check(PyreonQueryCache.count == 2) { "the cache stays at maxEntries" }
        check(PyreonQueryCache.lookup<Int>("b") == null) { "the least recently used key was evicted" }
        check(PyreonQueryCache.lookup<Int>("a")?.first == 1) { "a recently read key survives" }
        check(PyreonQueryCache.lookup<Int>("c")?.first == 3) { "the new key is cached" }
        for (i in 0 until 50) PyreonQueryCache.write("k$i", i)
        check(PyreonQueryCache.count == 2) { "a burst of distinct keys never exceeds the bound" }
        PyreonQueryCache.maxEntries = 1
        PyreonQueryCache.write("z", 9)
        check(PyreonQueryCache.count == 1) { "lowering maxEntries sheds down to the new bound" }
    } finally {
        PyreonQueryCache.maxEntries = before
        PyreonQueryCache.clearAll()
    }
}

fun testQueryRefetchRerunsTheRegisteredRequestIgnoringFreshness() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val q = PyreonQuery<Int>("r", staleMillis = 60_000)
    q.runNow { calls++; calls }
    check(q.data.value == 1 && calls == 1) { "the first run fetches on a miss" }
    check(!q.isStale) { "the cache is fresh after the first fetch" }
    q.refetch()
    check(calls == 2) { "refetch re-runs the registered request even when the cache is fresh" }
    check(q.data.value == 2) { "refetch replaces data on success" }
    check(!q.isFetching.value && !q.isPending.value) { "refetch settles its flags" }
    check(PyreonQueryCache.lookup<Int>("r")?.first == 2) { "refetch writes through to the cache" }
}

fun testQueryRefetchBeforeRunIsANoop() {
    PyreonQueryCache.clearAll()
    val q = PyreonQuery<Int>("none")
    q.refetch()
    check(!q.isFetching.value && q.data.value == null) { "nothing to refetch before run registered a request" }
}

fun testQueryRefetchInFlightThenFailureKeepsData() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("f", 1)
    val gates = Gates()
    val q = PyreonQuery<Int>("f", staleMillis = 60_000)
    q.runNow { gates.wait() }
    check(gates.parked.isEmpty()) { "a fresh hit does not fetch" }
    q.refetch()
    check(gates.parked.size == 1) { "refetch started the request" }
    check(q.isFetching.value) { "isFetching while the refetch is in flight" }
    check(!q.isPending.value) { "a refetch of shown data never flips isPending" }
    gates.parked[0].resumeWithException(RuntimeException("boom"))
    check(q.error.value?.message == "boom") { "a failed refetch sets error" }
    check(q.data.value == 1) { "a failed refetch keeps the last good data" }
    check(!q.isFetching.value) { "a failed refetch settles isFetching" }
}

fun testQueryStaleResponseNeverOverwritesANewerOne() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("s", 0)
    val gates = Gates()
    val q = PyreonQuery<Int>("s", staleMillis = 60_000)
    q.runNow { gates.wait() }
    q.refetch() // older
    q.refetch() // newer
    check(gates.parked.size == 2) { "both requests are in flight" }
    gates.parked[1].resume(2) // the newer request answers first
    check(q.data.value == 2) { "the newer response is applied" }
    check(!q.isFetching.value) { "settled by the newer response" }
    gates.parked[0].resume(1) // the slow, older one arrives late
    check(q.data.value == 2) { "a stale response must not overwrite a newer one" }
    check(PyreonQueryCache.lookup<Int>("s")?.first == 2) { "nor overwrite the cache" }
}

fun testQueryKeyChangeDropsTheOldKeysResponse() {
    PyreonQueryCache.clearAll()
    val gates = Gates()
    val q = PyreonQuery<Int>("")
    q.setKey("a")
    q.runNow { gates.wait() }
    check(q.isFetching.value) { "fetching key a" }
    q.setKey("b")
    check(!q.isFetching.value) { "a key change abandons the old key's fetch" }
    gates.parked[0].resume(1)
    check(q.data.value == null) { "the old key's response is not shown for the new key" }
    check(PyreonQueryCache.lookup<Int>("b") == null) { "nor cached under the new key" }
}

fun testInvalidateRefetchesLiveQueriesUnderTheRootOnly() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val list = PyreonQuery<Int>("todo:list", staleMillis = 60_000)
    val one = PyreonQuery<Int>("todo:7", staleMillis = 60_000)
    val other = PyreonQuery<Int>("todos:list", staleMillis = 60_000)
    list.runNow { calls++; 1 }
    one.runNow { calls++; 2 }
    other.runNow { calls++; 3 }
    check(calls == 3 && PyreonQueryCache.liveCount == 3) { "three live queries, each fetched once" }
    PyreonQueryCache.invalidateQueries("todo")
    check(calls == 5) { "both `todo` queries refetched, ignoring their fresh cache" }
    check(!list.isFetching.value && !one.isFetching.value) { "the refetches settled" }
    check(other.data.value == 3) { "`todos` is not under `todo`" }
    PyreonQueryCache.invalidateQueries("user")
    check(calls == 5) { "no live query under `user`" }
}

fun testInvalidatedEntryIsServedButStale() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("todo:list", 1)
    check(!PyreonQuery<Int>("todo:list", staleMillis = 60_000).isStale) { "fresh before the invalidation" }
    PyreonQueryCache.invalidateQueries("todo")
    val after = PyreonQuery<Int>("todo:list", staleMillis = 60_000)
    check(after.data.value == 1) { "an invalidated value is still served on mount" }
    check(after.isStale) { "but it is stale whatever staleMillis says" }
    var calls = 0
    after.runNow { calls++; 2 }
    check(calls == 1 && after.data.value == 2) { "so mounting refetches it" }
    check(!after.isStale) { "and the refetched value is fresh again" }
}

fun testForgottenQueryLeavesTheRegistry() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val q = PyreonQuery<Int>("todo:list")
    check(PyreonQueryCache.liveCount == 0) { "a query that never ran is not live" }
    q.runNow { calls++; calls }
    check(PyreonQueryCache.liveCount == 1) { "running registers it" }
    q.setKey("todo:8")
    PyreonQueryCache.invalidateQueries("todo:8")
    check(calls == 2) { "the registry follows a key change" }
    q.onForgotten() // Compose: the composable that remembered it left
    check(PyreonQueryCache.liveCount == 0) { "a forgotten query is unregistered" }
    PyreonQueryCache.invalidateQueries("todo")
    check(calls == 2) { "and an invalidation no longer reaches it" }
    val abandoned = PyreonQuery<Int>("todo:list")
    abandoned.runNow { 1 }
    abandoned.onAbandoned()
    check(PyreonQueryCache.liveCount == 0) { "an abandoned query is unregistered too" }
}

fun testSettleMutationInvalidatesOnSuccessOnly() {
    PyreonQueryCache.clearAll()
    var calls = 0
    val list = PyreonQuery<Int>("todo:list", staleMillis = 60_000)
    list.runNow { calls++; calls }
    var thrown: Throwable? = null
    start {
        try {
            PyreonQueryCache.settleMutation<Int>("todo") { throw RuntimeException("boom") }
        } catch (t: Throwable) {
            thrown = t
        }
    }
    check(thrown?.message == "boom") { "a failed mutation rethrows" }
    check(calls == 1) { "a failed mutation invalidates nothing" }
    var saved = 0
    start { saved = PyreonQueryCache.settleMutation("todo") { 42 } }
    check(saved == 42) { "a successful mutation returns its value" }
    check(calls == 2 && list.data.value == 2) { "a successful mutation refetches the live `todo` query" }
}

fun testSettleMutationCancelledRollsBackAndInvalidates() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("todo:1", 10)
    var calls = 0
    val one = PyreonQuery<Int>("todo:1", staleMillis = 60_000)
    one.runNow { calls++; 10 }
    check(calls == 0) { "fresh hit" }
    val rollback = PyreonQueryCache.setQueryData<Int>("todo:1") { 11 }
    start {
        try {
            PyreonQueryCache.settleMutation("todo", rollback) { throw kotlin.coroutines.cancellation.CancellationException("left") }
        } catch (_: kotlin.coroutines.cancellation.CancellationException) {}
    }
    check(calls == 1) { "a cancelled mutation's outcome is unknown, so the queries refetch" }
    check(one.data.value == 10) { "and the optimistic value was rolled back first" }
}

fun testSetQueryDataIsOptimisticAndRollsBack() {
    PyreonQueryCache.clearAll()
    PyreonQueryCache.write("todo:1", 10)
    val gates = Gates()
    val one = PyreonQuery<Int>("todo:1", staleMillis = 60_000)
    val twin = PyreonQuery<Int>("todo:1", staleMillis = 60_000)
    val other = PyreonQuery<Int>("todo:2", staleMillis = 60_000)
    one.runNow { gates.wait() }
    twin.runNow { 10 }
    other.runNow { 20 }
    one.refetch()
    check(one.isFetching.value) { "a fetch is in flight" }
    val rollback = PyreonQueryCache.setQueryData<Int>("todo:1") { it + 1 }
    check(rollback != null) { "a cached value was patched" }
    check(one.data.value == 11 && twin.data.value == 11) { "every live query on the key shows the optimistic value" }
    check(other.data.value == 20) { "another key is untouched" }
    check(PyreonQueryCache.lookup<Int>("todo:1")?.first == 11) { "the cache holds the optimistic value" }
    check(!one.isFetching.value) { "the in-flight fetch is cancelled" }
    gates.parked[0].resume(99)
    check(one.data.value == 11) { "the cancelled fetch cannot overwrite the optimistic value" }
    rollback!!.rollback()
    check(one.data.value == 10 && twin.data.value == 10) { "rollback restores every query" }
    check(PyreonQueryCache.lookup<Int>("todo:1")?.first == 10) { "and the cache" }
    rollback.rollback()
    check(one.data.value == 10) { "a second rollback is a no-op" }
    check(PyreonQueryCache.setQueryData<Int>("todo:3") { it + 1 } == null) { "nothing cached: nothing to patch" }
    check(PyreonQueryCache.lookup<Int>("todo:3") == null) { "and nothing is written" }
    check(PyreonQueryCache.setQueryData<String>("todo:1") { it + "x" } == null) { "a value of another type is not patched" }
}

fun main() {
    testQueryFetchesOnMissThenServesFromCache()
    testQueryStaleServesCachedThenRefetches()
    testQueryBackgroundRefreshDoesNotBlankUI()
    testQueryRejectKeepsStaleData()
    testQueryCacheEvictsLeastRecentlyUsed()
    testQueryRefetchRerunsTheRegisteredRequestIgnoringFreshness()
    testQueryRefetchBeforeRunIsANoop()
    testQueryRefetchInFlightThenFailureKeepsData()
    testQueryStaleResponseNeverOverwritesANewerOne()
    testQueryKeyChangeDropsTheOldKeysResponse()
    testInvalidateRefetchesLiveQueriesUnderTheRootOnly()
    testInvalidatedEntryIsServedButStale()
    testForgottenQueryLeavesTheRegistry()
    testSettleMutationInvalidatesOnSuccessOnly()
    testSettleMutationCancelledRollsBackAndInvalidates()
    testSetQueryDataIsOptimisticAndRollsBack()
    println("[PyreonQueryTest] all smoke tests passed")
}
