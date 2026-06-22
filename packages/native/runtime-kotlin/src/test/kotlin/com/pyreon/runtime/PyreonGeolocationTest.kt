// Smoke tests for PyreonGeolocation — the Compose `useGeolocation` reactive
// location container. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonGeolocation`.
//
// Scope: the PURE state machine + the injected-source lifecycle (idempotent
// start/stop, fix/authorization/error wiring). The real
// FusedLocationProviderClient source is the app's / Android-CI's
// responsibility — not exercised here, matching PyreonNetworkStatus's
// injected-source test boundary.

package com.pyreon.runtime

fun testGeoInitialState() {
    val loc = PyreonGeolocation()
    check(loc.latitude.value == null) { "latitude starts null" }
    check(loc.longitude.value == null) { "longitude starts null" }
    check(loc.accuracy.value == null) { "accuracy starts null" }
    check(!loc.isAuthorized.value) { "isAuthorized starts false" }
    check(loc.error.value == null) { "error starts null" }
    check(!loc.isTracking) { "isTracking starts false" }
}

fun testGeoUpdateSetsFix() {
    val loc = PyreonGeolocation()
    loc.update(50.0755, 14.4378, 12.5)
    check(loc.latitude.value == 50.0755) { "latitude set" }
    check(loc.longitude.value == 14.4378) { "longitude set" }
    check(loc.accuracy.value == 12.5) { "accuracy set" }
}

fun testGeoUpdateClearsPriorError() {
    val loc = PyreonGeolocation()
    loc.fail(RuntimeException("gps off"))
    check(loc.error.value != null) { "error set" }
    loc.update(1.0, 2.0)
    check(loc.error.value == null) { "a fix clears the prior error" }
}

fun testGeoAuthorizeFlips() {
    val loc = PyreonGeolocation()
    loc.authorize(true)
    check(loc.isAuthorized.value) { "authorize(true) → granted" }
    loc.authorize(false)
    check(!loc.isAuthorized.value) { "authorize(false) → denied" }
}

fun testGeoFailKeepsLastFix() {
    val loc = PyreonGeolocation()
    loc.update(10.0, 20.0, 5.0)
    loc.fail(RuntimeException("timeout"))
    check(loc.error.value != null) { "fail() sets error" }
    // stale-while-error: the last fix survives a failure
    check(loc.latitude.value == 10.0) { "fail() keeps the last latitude" }
    check(loc.longitude.value == 20.0) { "fail() keeps the last longitude" }
}

fun testGeoStartWiresInjectedSource() {
    val loc = PyreonGeolocation()
    var handlers: GeolocationHandlers? = null
    var unregistered = false
    loc.start { h ->
        handlers = h
        { unregistered = true }
    }
    check(loc.isTracking) { "start() begins tracking" }
    // App's source forwards a fix + an authorization through the handlers:
    handlers!!.onAuthorization(true)
    check(loc.isAuthorized.value) { "onAuthorization handler drives authorize()" }
    handlers!!.onFix(1.5, 2.5, 3.5)
    check(loc.latitude.value == 1.5) { "onFix handler drives update()" }
    check(loc.accuracy.value == 3.5) { "onFix forwards accuracy" }
    loc.stop()
    check(unregistered) { "stop() invokes the unregister thunk" }
    check(!loc.isTracking) { "stop() ends tracking" }
}

fun testGeoStartIsIdempotent() {
    val loc = PyreonGeolocation()
    var registrations = 0
    val register: (GeolocationHandlers) -> (() -> Unit) = { _ ->
        registrations++
        {}
    }
    loc.start(register)
    loc.start(register) // second call while tracking → no-op
    check(registrations == 1) { "start() is idempotent" }
}

/** Double-`stop()` after a `start()` invokes the unregister thunk exactly
 * once. Lifecycle hardening — mirrors PyreonNetworkStatus's double-stop. */
fun testGeoDoubleStopIsNoop() {
    val loc = PyreonGeolocation()
    var unregistrations = 0
    loc.start { _ -> { unregistrations++ } }
    loc.stop()
    loc.stop() // second call → no-op
    check(!loc.isTracking) { "lifecycle stable across double-stop" }
    check(unregistrations == 1) { "double-stop unregisters exactly once" }
}

/** `stop()` before any `start()` is a safe no-op. */
fun testGeoStopBeforeStartIsNoop() {
    val loc = PyreonGeolocation()
    loc.stop() // must not crash
    check(!loc.isTracking) { "bare stop() leaves not-tracking" }
}

/**
 * `start() → stop() → start()` cycle works — `stop()` resets the lifecycle
 * so a subsequent `start()` re-invokes `register`. Bisect-verified:
 * removing the `started = false` reset in `stop()` makes the second
 * `start()` a silent no-op (`registrations == 1`).
 */
fun testGeoStartStopStartCycle() {
    val loc = PyreonGeolocation()
    var registrations = 0
    var unregistrations = 0
    val register: (GeolocationHandlers) -> (() -> Unit) = { _ ->
        registrations++
        { unregistrations++ }
    }
    loc.start(register)
    loc.stop()
    loc.start(register) // must succeed; would no-op if stop() didn't reset
    check(loc.isTracking) { "second start() re-enabled tracking" }
    loc.stop()
    check(registrations == 2) { "start/stop/start re-registers cleanly" }
    check(unregistrations == 2) { "each start has exactly one matching unregister" }
}

/**
 * The reactive fields MUST be Compose `MutableState`; `isTracking` MUST be
 * a plain Boolean (lifecycle flag, not Compose-reactive). Mirrors
 * PyreonNetworkStatus's shape contract.
 */
fun testGeoReactiveFieldShapes() {
    val loc = PyreonGeolocation()
    for (name in listOf("latitude", "longitude", "accuracy", "isAuthorized", "error")) {
        val t = loc::class.members.first { it.name == name }.returnType.toString()
        check(t.contains("MutableState")) { "$name MUST be a Compose MutableState. Actual: $t" }
    }
    val trackingType = loc::class.members.first { it.name == "isTracking" }.returnType.toString()
    check(trackingType == "kotlin.Boolean") {
        "isTracking must return plain kotlin.Boolean (lifecycle flag). Actual: $trackingType"
    }
}

fun main() {
    testGeoInitialState()
    testGeoUpdateSetsFix()
    testGeoUpdateClearsPriorError()
    testGeoAuthorizeFlips()
    testGeoFailKeepsLastFix()
    testGeoStartWiresInjectedSource()
    testGeoStartIsIdempotent()
    testGeoDoubleStopIsNoop()
    testGeoStopBeforeStartIsNoop()
    testGeoStartStopStartCycle()
    testGeoReactiveFieldShapes()
    println("[PyreonGeolocationTest] all smoke tests passed")
}
