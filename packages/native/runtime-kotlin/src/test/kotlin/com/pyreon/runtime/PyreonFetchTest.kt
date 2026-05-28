// Smoke tests for PyreonFetch — the Compose `useFetch` result container.
//
// Same dependency-free `check(...)`-style harness as PyreonStorageTest:
// no JUnit, no kotlinx-test, no coroutines. Verifies the synchronous
// state machine (load → data|error, refetch re-runs, error clears on
// success). Runs via the JAR `verify-kotlin.ts --service=PyreonFetch`
// produces; `main()` is the smoke entry point.

package com.pyreon.runtime

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

fun main() {
    testFetchInitialState()
    testFetchLoadSuccess()
    testFetchLoadFailure()
    testFetchRefetchReRuns()
    testFetchRefetchBeforeLoadIsNoOp()
    testFetchSuccessClearsPriorError()
    println("[PyreonFetchTest] all smoke tests passed")
}
