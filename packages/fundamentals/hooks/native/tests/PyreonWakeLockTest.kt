// Executable checks for PyreonWakeLock — mirror of PyreonWakeLockTests.swift.
// The keeper is a fake, so these run with no Android SDK and no device: what
// is under test is the held/released machine and its idempotency, which is
// the half that must match the web arm call-for-call.

package com.pyreon.runtime

private class FakeScreenKeeper(override val isSupported: Boolean = true) : ScreenKeeper {
    /** Every setKeepScreenOn call, in order — so a test can prove the
     * platform was touched the right number of times, not merely that the
     * observable flag ended up right. */
    val calls: MutableList<Boolean> = mutableListOf()

    override fun setKeepScreenOn(on: Boolean) {
        calls.add(on)
    }
}

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private fun acquiresAndReleases() {
    val keeper = FakeScreenKeeper()
    val lock = PyreonWakeLock(keeper)
    expect(!lock.active.value, "starts released")
    expect(lock.supported, "reports supported")

    expect(lock.request(), "request succeeds")
    expect(lock.active.value, "active after request")
    expect(keeper.calls == listOf(true), "platform held exactly once")

    lock.release()
    expect(!lock.active.value, "released")
    expect(keeper.calls == listOf(true, false), "platform released exactly once")
}

private fun requestIsIdempotent() {
    val keeper = FakeScreenKeeper()
    val lock = PyreonWakeLock(keeper)
    lock.request()
    lock.request()
    // The web arm asserts the same thing by counting wakeLock.request calls:
    // a second request must not take a second lock.
    expect(keeper.calls == listOf(true), "second request does not re-hold")
    expect(lock.active.value, "still active")
}

private fun releaseIsIdempotent() {
    val keeper = FakeScreenKeeper()
    val lock = PyreonWakeLock(keeper)
    lock.release()
    expect(keeper.calls.isEmpty(), "release while unheld touches nothing")
    lock.request()
    lock.release()
    lock.release()
    expect(keeper.calls == listOf(true, false), "second release touches nothing")
}

private fun unsupportedNeverHolds() {
    val keeper = FakeScreenKeeper(isSupported = false)
    val lock = PyreonWakeLock(keeper)
    expect(!lock.supported, "reports unsupported")
    // Matches the web arm's rejected-request path: a plain false, and the
    // platform is never touched.
    expect(!lock.request(), "request returns false")
    expect(!lock.active.value, "never becomes active")
    expect(keeper.calls.isEmpty(), "platform untouched")
}

public fun main() {
    acquiresAndReleases()
    requestIsIdempotent()
    releaseIsIdempotent()
    unsupportedNeverHolds()
    println("PyreonWakeLockTest: ok")
}
