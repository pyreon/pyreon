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

fun main() {
    testNetDefaultsOnline()
    testNetInitialValue()
    testNetUpdateFlips()
    testNetStartStopWiresInjectedSource()
    testNetStartIsIdempotent()
    println("[PyreonNetworkStatusTest] all smoke tests passed")
}
