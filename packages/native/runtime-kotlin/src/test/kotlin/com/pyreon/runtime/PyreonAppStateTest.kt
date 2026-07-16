// Smoke tests for PyreonAppState — the Compose `useAppState` reactive
// lifecycle phase. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonAppState`.

package com.pyreon.runtime

fun testAppStateDefaultsActive() {
    val state = PyreonAppState()
    check(state.phase.value == "active") { "defaults to \"active\"" }
}

fun testAppStateInitialValue() {
    val bg = PyreonAppState(phase = "background")
    check(bg.phase.value == "background") { "honors the initial value" }
}

fun testAppStateUpdateTransitions() {
    val state = PyreonAppState()
    state.update("background")
    check(state.phase.value == "background") { "update → background" }
    state.update("inactive")
    check(state.phase.value == "inactive") { "update → inactive" }
    state.update("active")
    check(state.phase.value == "active") { "update → active" }
}

fun testAppStateStartWiresInjectedSource() {
    val state = PyreonAppState()
    var push: ((String) -> Unit)? = null
    var unregistered = false
    state.start { onChange ->
        push = onChange
        { unregistered = true }
    }
    push!!("background")
    check(state.phase.value == "background") { "injected source drives phase" }
    state.stop()
    check(unregistered) { "stop() invokes the unregister thunk" }
}

fun testAppStateStartIsIdempotent() {
    val state = PyreonAppState()
    var registrations = 0
    val register: (((String) -> Unit) -> (() -> Unit)) = { _ ->
        registrations++
        {}
    }
    state.start(register)
    state.start(register) // second call while running → no-op
    check(registrations == 1) { "start() is idempotent" }
}

fun testAppStateStopBeforeStartIsNoop() {
    val state = PyreonAppState(phase = "background")
    check(!state.isMonitoring) { "fresh instance: isMonitoring = false" }
    state.stop() // must not crash, must not invoke any null thunk
    check(!state.isMonitoring) { "bare stop() leaves isMonitoring = false" }
    check(state.phase.value == "background") { "initial value preserved through bare stop()" }
}

fun testAppStateDoubleStopIsNoop() {
    val state = PyreonAppState()
    var unregistrations = 0
    state.start { _ -> { unregistrations++ } }
    check(state.isMonitoring) { "after start(): isMonitoring" }
    state.stop()
    state.stop() // second call → no-op, unregister thunk NOT invoked twice
    check(!state.isMonitoring) { "lifecycle flag stable across double-stop" }
    check(unregistrations == 1) { "double-stop invokes unregister exactly once" }
}

fun testAppStateStartStopStartCycle() {
    val state = PyreonAppState()
    var registrations = 0
    val register: (((String) -> Unit) -> (() -> Unit)) = { _ ->
        registrations++
        {}
    }
    state.start(register)
    state.stop()
    state.start(register) // must succeed; would no-op if stop() didn't reset
    check(state.isMonitoring) { "second start() re-enabled" }
    check(registrations == 2) { "start/stop/start re-registers cleanly" }
}

fun testAppStateUpdateIndependentOfLifecycle() {
    val state = PyreonAppState()
    check(!state.isMonitoring) { "fresh: not monitoring" }
    state.update("inactive") // writes regardless of lifecycle
    check(state.phase.value == "inactive") { "update() works before any start()" }
    state.start { _ -> {} }
    state.stop()
    state.update("active") // still works after stop()
    check(state.phase.value == "active") { "update() works after stop()" }
    check(!state.isMonitoring) { "update() doesn't touch lifecycle" }
}

fun main() {
    testAppStateDefaultsActive()
    testAppStateInitialValue()
    testAppStateUpdateTransitions()
    testAppStateStartWiresInjectedSource()
    testAppStateStartIsIdempotent()
    testAppStateStopBeforeStartIsNoop()
    testAppStateDoubleStopIsNoop()
    testAppStateStartStopStartCycle()
    testAppStateUpdateIndependentOfLifecycle()
    println("[PyreonAppStateTest] all smoke tests passed")
}
