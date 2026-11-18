// Smoke tests for PyreonFetch — the Compose `useFetch` result container.
//
// Same dependency-free `check(...)`-style harness as PyreonStorageTest:
// no JUnit, no kotlinx-test, no coroutines. Verifies the synchronous
// state machine (load → data|error, refetch re-runs, error clears on
// success). Runs via the JAR `verify-kotlin.ts --service=PyreonFetch`
// produces; `main()` is the smoke entry point.

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine

/** Start a suspend block on the calling thread; it runs until its first suspension. */
private fun start(block: suspend () -> Unit) {
    block.startCoroutine(Continuation(EmptyCoroutineContext) { it.getOrThrow() })
}

/** The launcher the emitted harness passes (`scope.launch`), stood in by [start]. */
private val launchNow: (suspend () -> Unit) -> Unit = { start(it) }

fun testFetchInitialState() {
    val f = PyreonFetch<Int>()
    check(f.data.value == null) { "fresh data should be null" }
    check(f.error.value == null) { "fresh error should be null" }
    check(!f.isPending.value) { "fresh isPending should be false" }
}

fun testFetchLoadSuccess() {
    val f = PyreonFetch<Int>()
    f.load { 42 }
    check(f.data.value == 42) { "data should be 42 after success" }
    check(f.error.value == null) { "error should be null after success" }
    check(!f.isPending.value) { "isPending should be false after load" }
}

fun testFetchLoadFailure() {
    val f = PyreonFetch<Int>()
    f.load { throw RuntimeException("boom") }
    check(f.data.value == null) { "data should stay null on failure" }
    check(f.error.value != null) { "error should be set on failure" }
    check(!f.isPending.value) { "isPending should be false after failure" }
}

fun testFetchRefetchReRuns() {
    var calls = 0
    val f = PyreonFetch<Int>()
    f.load {
        calls += 1
        calls
    }
    check(f.data.value == 1) { "first load → 1" }
    f.refetch()
    check(f.data.value == 2) { "refetch → 2" }
    check(calls == 2) { "fetcher should have run twice" }
}

fun testFetchRefetchBeforeLoadIsNoOp() {
    val f = PyreonFetch<Int>()
    f.refetch() // must not crash
    check(f.data.value == null) { "data still null" }
    check(!f.isPending.value) { "isPending still false" }
}

fun testFetchSuccessClearsPriorError() {
    val f = PyreonFetch<Int>()
    f.load { throw RuntimeException("boom") }
    check(f.error.value != null) { "error set after failure" }
    f.load { 7 }
    check(f.data.value == 7) { "data 7 after success" }
    check(f.error.value == null) { "error cleared on success" }
}

// Async-harness transitions (begin/resolve/reject) — what the emitted
// LaunchedEffect drives directly.

fun testFetchBeginEntersPending() {
    val f = PyreonFetch<Int>()
    f.reject(RuntimeException("prior"))
    check(f.error.value != null) { "error set before begin" }
    f.begin()
    check(f.isPending.value) { "begin → isPending true" }
    check(f.error.value == null) { "begin clears prior error" }
}

fun testFetchResolveLandsValue() {
    val f = PyreonFetch<Int>()
    f.begin()
    f.resolve(99)
    check(f.data.value == 99) { "resolve → data 99" }
    check(f.error.value == null) { "resolve → error null" }
    check(!f.isPending.value) { "resolve → not pending" }
}

fun testFetchRejectRecordsError() {
    val f = PyreonFetch<Int>()
    f.begin()
    f.reject(RuntimeException("boom"))
    check(f.error.value != null) { "reject → error set" }
    check(!f.isPending.value) { "reject → not pending" }
}

fun testFetchRejectKeepsStaleData() {
    val f = PyreonFetch<Int>()
    f.resolve(5)
    f.begin()
    f.reject(RuntimeException("boom"))
    check(f.data.value == 5) { "reject keeps prior data (stale-while-error)" }
    check(f.error.value != null) { "reject → error set" }
}

// The emitted harness: `LaunchedEffect(Unit) { x.run(launch = { scope.launch { it() } }) { request } }`.

fun testFetchRunRegistersTheRequestSoRefetchReRunsIt() {
    // The compiled `refetch()` was a silent no-op: the harness fetched inline (begin/resolve) and never
    // registered the request, so `refetch()` found no fetcher.
    var calls = 0
    val f = PyreonFetch<Int>()
    start { f.run(launchNow) { calls += 1; calls } }
    check(f.data.value == 1) { "run fetched: data 1" }
    check(calls == 1) { "one request on mount" }
    f.refetch()
    check(calls == 2) { "refetch re-ran the registered request" }
    check(f.data.value == 2) { "refetch replaced data" }
    check(!f.isPending.value) { "refetch settled" }
}

fun testFetchRunFailureThenRefetchRecovers() {
    var fail = true
    val f = PyreonFetch<Int>()
    start { f.run(launchNow) { if (fail) throw RuntimeException("down") else 5 } }
    check(f.error.value != null) { "a failed request records error" }
    fail = false
    f.refetch()
    check(f.data.value == 5) { "refetch recovered" }
    check(f.error.value == null) { "refetch cleared the error" }
}

fun testFetchSlowFirstResponseCannotOverwriteRefetch() {
    val parked = ArrayList<Continuation<Int>>()
    val f = PyreonFetch<Int>()
    start { f.run(launchNow) { suspendCoroutine { parked.add(it) } } }
    f.refetch()
    check(parked.size == 2) { "two requests in flight" }
    parked[1].resume(2)
    check(f.data.value == 2) { "the newer response lands" }
    parked[0].resume(1)
    check(f.data.value == 2) { "a SLOW first response must not overwrite the newer one" }
}

fun main() {
    testFetchInitialState()
    testFetchLoadSuccess()
    testFetchLoadFailure()
    testFetchRefetchReRuns()
    testFetchRefetchBeforeLoadIsNoOp()
    testFetchSuccessClearsPriorError()
    testFetchBeginEntersPending()
    testFetchResolveLandsValue()
    testFetchRejectRecordsError()
    testFetchRejectKeepsStaleData()
    testFetchRunRegistersTheRequestSoRefetchReRunsIt()
    testFetchRunFailureThenRefetchRecovers()
    testFetchSlowFirstResponseCannotOverwriteRefetch()
    println("[PyreonFetchTest] all smoke tests passed")
}
