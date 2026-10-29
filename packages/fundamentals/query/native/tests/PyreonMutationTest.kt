// Smoke tests for PyreonMutation — the `useMutation` state machine and
// TanStack's callback order, the Kotlin twin of PyreonMutationTests.swift.
// Dependency-free `check(...)` harness (no kotlinx-coroutines: a suspend call
// is driven by the stdlib's startCoroutine), run by the co-source gate.

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/** Run a suspend block to completion; the operations here never actually suspend. */
private fun <T> drive(block: suspend () -> T): Result<T> {
    var out: Result<T>? = null
    block.startCoroutine(Continuation(EmptyCoroutineContext) { out = it })
    return out ?: error("the block suspended")
}

private class Boom : Exception("boom")

fun testMutationSuccessOrderAndState() {
    val m = PyreonMutation<String>()
    check(m.isIdle.value && m.status.value == "idle") { "starts idle" }
    val log = ArrayList<String>()
    val options = PyreonMutationCallbacks<String>(
        onSuccess = { log.add("options.onSuccess:$it:${m.status.value}") },
        onSettled = { d, e -> log.add("options.onSettled:$d:$e") },
    )
    val call = PyreonMutationCallbacks<String>(
        onSuccess = { log.add("call.onSuccess:$it:${m.status.value}") },
        onSettled = { d, _ -> log.add("call.onSettled:$d") },
    )
    val mine = m.begin()
    check(m.isPending.value && m.data.value == null) { "begin is pending, data cleared" }
    drive { m.run(mine, "req", { r: String -> "ok:$r" }, options, call) }
    check(m.isSuccess.value && m.data.value == "ok:req" && m.error.value == null) { "success state" }
    // TanStack: the options' callbacks run BEFORE the state update, the call's after it.
    check(
        log == listOf(
            "options.onSuccess:ok:req:pending",
            "options.onSettled:ok:req:null",
            "call.onSuccess:ok:req:success",
            "call.onSettled:ok:req",
        ),
    ) { "callback order: $log" }
}

fun testMutationFailureIsCapturedByRunAndThrownByRunAsync() {
    val m = PyreonMutation<Int>()
    var errors = 0
    drive { m.run(m.begin(), Unit, { _: Unit -> throw Boom() }, PyreonMutationCallbacks(onError = { errors++ })) }
    check(m.isError.value && m.error.value is Boom && m.data.value == null) { "run captures the failure in state" }
    check(errors == 1) { "options.onError fired" }
    val r = drive { m.runAsync(Unit, { _: Unit -> throw Boom() }) }
    check(r.exceptionOrNull() is Boom) { "runAsync rethrows to the awaiting caller" }
    val ok = drive { m.runAsync(Unit, { _: Unit -> 7 }) }
    check(ok.getOrNull() == 7 && m.data.value == 7) { "runAsync returns the data" }
}

/** A slow FIRST call that settles after a newer one began writes nothing and fires none of its call callbacks. */
fun testMutationStaleCallDoesNotClobber() {
    val m = PyreonMutation<String>()
    var stale = 0
    var fresh = 0
    val first = m.begin()
    val second = m.begin()
    drive { m.run(second, "b", { r: String -> r }, call = PyreonMutationCallbacks(onSuccess = { fresh++ })) }
    drive { m.run(first, "a", { r: String -> r }, call = PyreonMutationCallbacks(onSuccess = { stale++ })) }
    check(m.data.value == "b") { "the newest call owns the state, got ${m.data.value}" }
    check(fresh == 1 && stale == 0) { "only the newest call's callbacks fire" }
}

/** Disposal cancels the coroutine: a cancellation is re-thrown with NOTHING written and no callback. */
fun testMutationCancellationWritesNothing() {
    val m = PyreonMutation<String>()
    var fired = 0
    val mine = m.begin()
    val r = drive {
        m.run(mine, Unit, { _: Unit -> throw kotlin.coroutines.cancellation.CancellationException("left") },
            PyreonMutationCallbacks(onSuccess = { fired++ }, onError = { fired++ }, onSettled = { _, _ -> fired++ }))
    }
    check(r.exceptionOrNull() is kotlin.coroutines.cancellation.CancellationException) { "cancellation propagates" }
    check(fired == 0 && m.error.value == null) { "no callback, no error recorded" }
}

fun testMutationReset() {
    val m = PyreonMutation<Int>()
    drive { m.runAsync(Unit, { _: Unit -> 1 }) }
    m.reset()
    check(m.isIdle.value && m.data.value == null) { "reset returns to idle" }
}

fun main() {
    testMutationSuccessOrderAndState()
    testMutationFailureIsCapturedByRunAndThrownByRunAsync()
    testMutationStaleCallDoesNotClobber()
    testMutationCancellationWritesNothing()
    testMutationReset()
    println("[PyreonMutationTest] all smoke tests passed")
}
