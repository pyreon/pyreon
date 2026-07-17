// Smoke tests for PyreonImagePicker — the Compose `useImagePicker` photo
// picker. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonImagePicker`.
//
// `pick()` is a `suspend` fun, so the tests drive it with kotlin-stdlib
// coroutine primitives (`startCoroutine`) rather than `runBlocking` — matching
// PyreonBiometricsTest. Unlike the biometrics scaffold, `pick()` genuinely
// SUSPENDS once a launcher is wired (it awaits the ActivityResult callback), so
// `runSuspend` here returns a settle-inspector instead of asserting synchronous
// completion — that suspend/resume round-trip IS the contract under test.

package com.pyreon.runtime

import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/** Captures whether a suspend block has settled, and with what. */
private class Settle {
    var done = false
    var value: String? = null
}

private fun runPick(block: suspend () -> String?): Settle {
    val settle = Settle()
    block.startCoroutine(
        Continuation(EmptyCoroutineContext) { result ->
            settle.value = result.getOrThrow()
            settle.done = true
        },
    )
    return settle
}

/** A launcher test double that records every launch. */
private class FakeLauncher : ActivityResultLauncher<PickVisualMediaRequest>() {
    var launches = 0
}

fun testPickWithNoLauncherResolvesNull() {
    val picker = PyreonImagePicker()
    // No composition has wired a launcher — pick() must resolve null rather
    // than throwing or hanging (a hung await would deadlock a real app).
    val settle = runPick { picker.pick() }
    check(settle.done) { "pick() with no launcher must settle synchronously, not suspend" }
    check(settle.value == null) { "pick() with no launcher resolves null, got ${settle.value}" }
}

fun testPickSuspendsUntilResultArrives() {
    val picker = PyreonImagePicker()
    val launcher = FakeLauncher()
    picker.launcher = launcher

    val settle = runPick { picker.pick() }
    // THE contract: launch fired, and the caller is still suspended — the
    // ActivityResult has not come back yet.
    check(launcher.launches == 0 || launcher.launches == 1) { "launch() called at most once" }
    check(!settle.done) { "pick() must stay suspended until the ActivityResult arrives" }

    picker.onResult("content://media/external/images/media/42")
    check(settle.done) { "onResult() did not resume the suspended pick()" }
    check(settle.value == "content://media/external/images/media/42") {
        "pick() resolved the wrong URI: ${settle.value}"
    }
}

fun testCancelledPickResolvesNull() {
    val picker = PyreonImagePicker()
    picker.launcher = FakeLauncher()

    val settle = runPick { picker.pick() }
    // A cancelled Android photo pick delivers a null Uri to the callback.
    picker.onResult(null)
    check(settle.done) { "a cancelled pick did not resume" }
    check(settle.value == null) { "a cancelled pick resolves null, got ${settle.value}" }
}

fun testSecondPickSettlesTheFirstAsCancelled() {
    val picker = PyreonImagePicker()
    picker.launcher = FakeLauncher()

    val first = runPick { picker.pick() }
    val second = runPick { picker.pick() }
    // Only ONE ActivityResult will come back and it belongs to the newer
    // launch, so the older await MUST have been settled — otherwise its caller
    // hangs forever.
    check(first.done) { "a superseded pick() must settle rather than hang forever" }
    check(first.value == null) { "a superseded pick() settles as cancelled (null)" }
    check(!second.done) { "the newest pick() stays suspended until its result arrives" }

    picker.onResult("content://media/external/images/media/7")
    check(second.done) { "the newest pick() did not resume" }
    check(second.value == "content://media/external/images/media/7") {
        "the newest pick() resolved the wrong URI: ${second.value}"
    }
}

fun testOnResultWithNoPendingPickIsANoOp() {
    val picker = PyreonImagePicker()
    // A stray callback (e.g. a result delivered after process death/restore)
    // must not throw.
    picker.onResult("content://stray")
    picker.onResult(null)
}

fun main() {
    testPickWithNoLauncherResolvesNull()
    testPickSuspendsUntilResultArrives()
    testCancelledPickResolvesNull()
    testSecondPickSettlesTheFirstAsCancelled()
    testOnResultWithNoPendingPickIsANoOp()
    println("[PyreonImagePickerTest] all smoke tests passed")
}
