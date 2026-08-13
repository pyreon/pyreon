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

/**
 * `update(_:)` is INDEPENDENT of the `start()` / `stop()` lifecycle —
 * it writes `isOnline.value` regardless of `started` state. Intentional
 * contract — lets external callers seed an initial value before
 * `start()` (e.g. a Composable parent passing a last-known value down)
 * AND lets tests simulate updates without supplying a `register` callback.
 * A future "tidy" refactor that gates `update()` on `started` would
 * silently regress the public contract; this test pins it.
 */
fun testNetUpdateBeforeStartWrites() {
    val net = PyreonNetworkStatus(isOnline = true)
    check(!net.isMonitoring) { "fresh instance: isMonitoring = false" }
    net.update(false) // must write regardless of lifecycle
    check(!net.isOnline.value) { "update() works before any start()" }
    net.update(true)
    check(net.isOnline.value) { "update(true) → online" }
    check(!net.isMonitoring) { "update() doesn't touch lifecycle" }
}

/**
 * `update(_:)` after `stop()` STILL works — `stop()` doesn't lock the
 * public setter. Companion to [testNetUpdateBeforeStartWrites]: `update`
 * is a lifecycle-independent state-mutator, never a monitor-gated
 * callback. A refactor that adds a `if (!started) return` to `update`
 * would silently regress the contract; this test pins it.
 */
fun testNetUpdateAfterStopWrites() {
    val net = PyreonNetworkStatus(isOnline = true)
    net.start { _ -> {} }
    check(net.isMonitoring) { "after start: isMonitoring" }
    net.stop()
    check(!net.isMonitoring) { "after stop: lifecycle off" }
    net.update(false) // must still write — stop() doesn't lock the setter
    check(!net.isOnline.value) { "update() works after stop()" }
    net.update(true)
    check(net.isOnline.value) { "update(true) after stop → online" }
    check(!net.isMonitoring) { "update() doesn't reactivate lifecycle" }
}

/**
 * `isMonitoring` is documented as "Not Compose-reactive — wrap in your
 * own `mutableStateOf` if you need to gate UI on monitoring state
 * itself." This test enforces the SHALLOW form of that contract via
 * reflection — `isMonitoring` must be a plain `Boolean` getter, NOT a
 * `MutableState<Boolean>` or `State<Boolean>` delegate.
 *
 * The contract is structurally enforced at two layers:
 * 1. The Kotlin source declares `val isMonitoring: Boolean get() = started`
 *    — a plain computed property over a private `Boolean` field. There
 *    is no `mutableStateOf` allocation in its definition. Compose's
 *    snapshot system reads ONLY through `MutableState.value` (the
 *    `getValue` operator overload registers the read with the current
 *    snapshot); a plain `Boolean` getter never touches that machinery.
 * 2. This test (the runtime proof — reflects on the property's return
 *    type; fails if a future refactor flips it to `MutableState<Boolean>`
 *    or `State<Boolean>`).
 *
 * ## Known limitation
 *
 * The reflection probe catches the SHALLOW shape change (return type
 * flips to MutableState/State). It does NOT catch the more subtle
 * "wrapper" regression where a future refactor hides a `mutableStateOf`
 * INSIDE the getter (`val isMonitoring: Boolean get() = _state.value`)
 * — the return type is still `Boolean`, but reading the getter DOES
 * register a snapshot read inside the getter body, breaking the
 * documented contract. The Kotlin smoke harness has no Compose
 * `@Composable` test surface (`verify-kotlin.ts` uses minimum-viable
 * Compose stubs, not a real recomposer), so the wrapped-state case
 * isn't catchable without an Android-CI shape. Future work: add an
 * Android-CI gate that drives a real `androidx.compose.runtime.Snapshot`
 * read counter and asserts no read fires when `isMonitoring` is touched
 * inside a tracking transaction.
 *
 * See PyreonNetworkStatus.kt — `val isMonitoring: Boolean get() = started`
 * MUST stay a plain Boolean computed property reading a plain `Boolean`
 * field; any flip to a MutableState/State delegate (caught) OR a
 * `_state.value`-reading getter body (not caught here, lives in the
 * source-review contract) breaks the documented contract.
 */
fun testNetIsMonitoringIsNotComposeReactive() {
    val net = PyreonNetworkStatus()
    val prop = net::class.members.first { it.name == "isMonitoring" }
    val returnTypeStr = prop.returnType.toString()
    // Must be plain `kotlin.Boolean`, never `MutableState<Boolean>` /
    // `State<Boolean>` (Compose-reactive delegates). The string-match
    // is intentional — the runtime stubs declare `State` / `MutableState`
    // in the `androidx.compose.runtime` package, so a regression would
    // surface as that package name appearing in the return type.
    check(returnTypeStr == "kotlin.Boolean") {
        "isMonitoring must return plain kotlin.Boolean (not a Compose " +
        "MutableState/State delegate) — Compose-reactive flip breaks the " +
        "documented contract: 'wrap in your own mutableStateOf if you need " +
        "to gate UI on monitoring state itself'. Actual return type: " +
        returnTypeStr
    }
    // Companion contract: `isOnline` MUST be `MutableState<Boolean>` —
    // proves the reflection probe distinguishes the two shapes (so the
    // isMonitoring check above can't pass trivially against a broken
    // reflection setup).
    val onlineProp = net::class.members.first { it.name == "isOnline" }
    val onlineReturnTypeStr = onlineProp.returnType.toString()
    check(onlineReturnTypeStr.contains("MutableState")) {
        "isOnline MUST be a Compose MutableState — this is the whole point " +
        "of the @pyreon/native-runtime-kotlin reactive surface. If this " +
        "regresses, the useOnline() compiler emit's Compose recompose " +
        "contract is broken. Actual return type: " + onlineReturnTypeStr
    }
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
    testNetUpdateBeforeStartWrites()
    testNetUpdateAfterStopWrites()
    testNetIsMonitoringIsNotComposeReactive()
    println("[PyreonNetworkStatusTest] all smoke tests passed")
}
