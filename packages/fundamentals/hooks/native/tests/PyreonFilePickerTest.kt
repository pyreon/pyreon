// Smoke tests for PyreonFilePicker — the Compose `useFilePicker` document
// picker. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonFilePicker`. Mirror of
// PyreonImagePickerTest — the delta is the launcher input type
// (`Array<String>` of MIME types for the SAF `OpenDocument` contract, vs
// `PickVisualMediaRequest`).
//
// `pick()` is a `suspend` fun that genuinely SUSPENDS once a launcher is wired
// (it awaits the ActivityResult callback), so `runPick` returns a
// settle-inspector rather than asserting synchronous completion — that
// suspend/resume round-trip IS the contract under test.

package com.pyreon.runtime

import androidx.activity.result.ActivityResultLauncher
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

/** A launcher test double over the OpenDocument input (Array<String> of MIMEs). */
private class FakeLauncher : ActivityResultLauncher<Array<String>>() {
    var launches = 0
}

fun testPickWithNoLauncherResolvesNull() {
    val files = PyreonFilePicker()
    // No composition has wired a launcher — pick() must resolve null rather
    // than throwing or hanging (a hung await would deadlock a real app).
    val settle = runPick { files.pick() }
    check(settle.done) { "pick() with no launcher must settle synchronously, not suspend" }
    check(settle.value == null) { "pick() with no launcher resolves null, got ${settle.value}" }
}

fun testPickSuspendsUntilResultArrives() {
    val files = PyreonFilePicker()
    val launcher = FakeLauncher()
    files.launcher = launcher

    val settle = runPick { files.pick() }
    // THE contract: launch fired, and the caller is still suspended — the
    // ActivityResult has not come back yet.
    check(launcher.launches == 0 || launcher.launches == 1) { "launch() called at most once" }
    check(!settle.done) { "pick() must stay suspended until the ActivityResult arrives" }

    files.onResult("content://com.android.providers.downloads/document/42")
    check(settle.done) { "onResult() did not resume the suspended pick()" }
    check(settle.value == "content://com.android.providers.downloads/document/42") {
        "pick() resolved the wrong URI: ${settle.value}"
    }
}

fun testCancelledPickResolvesNull() {
    val files = PyreonFilePicker()
    files.launcher = FakeLauncher()

    val settle = runPick { files.pick() }
    // A cancelled Android document pick delivers a null Uri to the callback.
    files.onResult(null)
    check(settle.done) { "a cancelled pick did not resume" }
    check(settle.value == null) { "a cancelled pick resolves null, got ${settle.value}" }
}

fun testSecondPickSettlesTheFirstAsCancelled() {
    val files = PyreonFilePicker()
    files.launcher = FakeLauncher()

    val first = runPick { files.pick() }
    val second = runPick { files.pick() }
    // Only ONE ActivityResult will come back and it belongs to the newer
    // launch, so the older await MUST have been settled — otherwise its caller
    // hangs forever.
    check(first.done) { "a superseded pick() must settle rather than hang forever" }
    check(first.value == null) { "a superseded pick() settles as cancelled (null)" }
    check(!second.done) { "the newest pick() stays suspended until its result arrives" }

    files.onResult("content://com.android.providers.downloads/document/7")
    check(second.done) { "the newest pick() did not resume" }
    check(second.value == "content://com.android.providers.downloads/document/7") {
        "the newest pick() resolved the wrong URI: ${second.value}"
    }
}

fun testOnResultWithNoPendingPickIsANoOp() {
    val files = PyreonFilePicker()
    // A stray callback (e.g. a result delivered after process death/restore)
    // must not throw.
    files.onResult("content://stray")
    files.onResult(null)
}

fun main() {
    testPickWithNoLauncherResolvesNull()
    testPickSuspendsUntilResultArrives()
    testCancelledPickResolvesNull()
    testSecondPickSettlesTheFirstAsCancelled()
    testOnResultWithNoPendingPickIsANoOp()
    println("[PyreonFilePickerTest] all smoke tests passed")
}
