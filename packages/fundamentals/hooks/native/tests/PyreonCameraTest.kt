// Executable checks for PyreonCamera — mirror of PyreonCameraTests.swift.
// The launcher is a plain lambda here, so these run with no Android SDK.
// Under test: cancel and unavailable both collapse to null, and a launcher
// that fires twice cannot resume the continuation twice.
//
// `suspend fun main` rather than runBlocking: kotlinx.coroutines is not in
// the stub set, and the language gives a suspend entry point for free.

package com.pyreon.runtime

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private suspend fun capturesAUri() {
    val cam = PyreonCamera()
    cam.launch = { cam.onResult("file:///tmp/shot.jpg") }
    expect(cam.capture() == "file:///tmp/shot.jpg", "returns the captured uri")
}

private suspend fun cancelIsNull() {
    val cam = PyreonCamera()
    cam.launch = { cam.onResult(null) }
    expect(cam.capture() == null, "cancel is null")
}

private suspend fun withoutALauncherItIsUnavailable() {
    val cam = PyreonCamera()
    // The emit assigns `launch` from the composition; before that there is no
    // flow to open, and claiming otherwise would hang the coroutine forever.
    expect(!cam.isAvailable(), "unavailable without a launcher")
    expect(cam.capture() == null, "capture is null rather than hanging")
}

private suspend fun aDoubleCallbackDoesNotCrash() {
    var cam: PyreonCamera? = null
    val c = PyreonCamera()
    cam = c
    c.launch = {
        c.onResult("file:///tmp/a.jpg")
        // Resuming twice throws IllegalStateException — cheap to guard.
        c.onResult("file:///tmp/b.jpg")
    }
    expect(c.capture() == "file:///tmp/a.jpg", "survives a double callback")
    expect(cam != null, "held")
}

public suspend fun main() {
    capturesAUri()
    cancelIsNull()
    withoutALauncherItIsUnavailable()
    aDoubleCallbackDoesNotCrash()
    println("PyreonCameraTest: ok")
}
