// Smoke tests for PyreonNetworkStatus — the Compose `useOnline` reactive
// connectivity flag. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonNetworkStatus`.

package com.pyreon.runtime

fun testNetDefaultsOnline() {
    val net = PyreonNetworkStatus()
    check(net.isOnline.value) { "defaults to online" }
}

fun testNetInitialValue() {
    val offline = PyreonNetworkStatus(isOnline = false)
    check(!offline.isOnline.value) { "honors the initial value" }
}

fun testNetUpdateFlips() {
    val net = PyreonNetworkStatus(isOnline = true)
    net.update(false)
    check(!net.isOnline.value) { "update(false) → offline" }
    net.update(true)
    check(net.isOnline.value) { "update(true) → online" }
}

fun testNetStartStopWiresInjectedSource() {
    val net = PyreonNetworkStatus(isOnline = true)
    var push: ((Boolean) -> Unit)? = null
    var unregistered = false
    // start() hands the app a `push` to forward connectivity changes, and
    // stores the returned unregister thunk for stop().
    net.start { onChange ->
        push = onChange
        { unregistered = true }
    }
    push!!(false)
    check(!net.isOnline.value) { "injected source drives isOnline" }
    net.stop()
    check(unregistered) { "stop() invokes the unregister thunk" }
}

fun testNetStartIsIdempotent() {
    val net = PyreonNetworkStatus()
    var registrations = 0
    val register: (((Boolean) -> Unit) -> (() -> Unit)) = { _ ->
        registrations++
        {}
    }
    net.start(register)
    net.start(register) // second call while running → no-op
    check(registrations == 1) { "start() is idempotent" }
}

/**
 * Double-`stop()` after a `start()` is a safe no-op — the second call must
 * NOT re-invoke the unregister thunk (post-fix the `started` flag guards
 * the body; the second call early-returns without re-releasing). Lifecycle
 * hardening regression — audit finding "monitor lifecycle not fully guarded
 * against double-stop".
 */
fun testNetDoubleStopIsNoop() {
    val net = PyreonNetworkStatus()
    var unregistrations = 0
    net.start { _ ->
        { unregistrations++ }
    }
    check(net.isMonitoring) { "after start(): isMonitoring = true" }
    net.stop()
    check(!net.isMonitoring) { "after stop(): isMonitoring = false" }
    net.stop() // second call → no-op, unregister thunk NOT invoked twice
    check(!net.isMonitoring) { "lifecycle flag stable across double-stop" }
    check(unregistrations == 1) { "double-stop invokes unregister exactly once" }
}

/** `stop()` before any `start()` is a safe no-op. */
fun testNetStopBeforeStartIsNoop() {
    val net = PyreonNetworkStatus(isOnline = false)
    check(!net.isMonitoring) { "fresh instance: isMonitoring = false" }
    net.stop() // must not crash, must not invoke any null thunk
    check(!net.isMonitoring) { "bare stop() leaves isMonitoring = false" }
    check(!net.isOnline.value) { "initial value preserved through bare stop()" }
}

/**
 * `start() → stop() → start()` cycle works — `stop()` fully resets the
 * lifecycle flag so a subsequent `start()` re-invokes the supplied
 * `register` (not blocked by stale `started` state). Bisect-verified:
 * removing the `started = false` reset in `stop()` makes the second
 * `start()` a silent no-op (`registrations == 1` instead of `2`).
 */
fun testNetStartStopStartCycle() {
    val net = PyreonNetworkStatus()
    var registrations = 0
    var unregistrations = 0
    val register: (((Boolean) -> Unit) -> (() -> Unit)) = { _ ->
        registrations++
        { unregistrations++ }
    }
    net.start(register)
    check(net.isMonitoring) { "after first start(): isMonitoring" }
    net.stop()
    check(!net.isMonitoring) { "after first stop(): bisect lock" }
    net.start(register) // must succeed; would no-op if stop() didn't reset
    check(net.isMonitoring) { "after second start(): isMonitoring re-enabled" }
    net.stop()
    net.stop() // double-stop tail
    check(!net.isMonitoring) { "final state off" }
    check(registrations == 2) { "start/stop/start re-registers cleanly" }
    check(unregistrations == 2) { "each start has exactly one matching unregister" }
}

fun main() {
    testNetDefaultsOnline()
    testNetInitialValue()
    testNetUpdateFlips()
    testNetStartStopWiresInjectedSource()
    testNetStartIsIdempotent()
    testNetDoubleStopIsNoop()
    testNetStopBeforeStartIsNoop()
    testNetStartStopStartCycle()
    println("[PyreonNetworkStatusTest] all smoke tests passed")
}
