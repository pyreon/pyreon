// Smoke tests for PyreonWebSocket — the Compose `useWebSocket` reactive
// realtime container. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonWebSocket`.
//
// Scope: the PURE state machine + the injected-transport lifecycle
// (idempotent connect/close, sender wiring). The real OkHttp transport is
// the app's / Android-CI's responsibility — not exercised here, matching
// PyreonNetworkStatus's injected-source test boundary.

package com.pyreon.runtime

fun testWsInitialState() {
    val ws = PyreonWebSocket()
    check(ws.lastMessage.value == null) { "lastMessage starts null" }
    check(ws.messages.value.isEmpty()) { "messages starts empty" }
    check(!ws.isConnected.value) { "isConnected starts false" }
    check(ws.error.value == null) { "error starts null" }
    check(!ws.isOpen) { "isOpen starts false" }
}

fun testWsOpenedFlips() {
    val ws = PyreonWebSocket()
    ws.opened()
    check(ws.isConnected.value) { "opened() → isConnected true" }
    check(ws.error.value == null) { "opened() clears error" }
}

fun testWsReceivedAccumulates() {
    val ws = PyreonWebSocket()
    ws.received("a")
    ws.received("b")
    check(ws.lastMessage.value == "b") { "lastMessage is the most recent frame" }
    check(ws.messages.value == listOf("a", "b")) { "messages accumulate in order" }
}

fun testWsFailedSetsErrorAndDisconnects() {
    val ws = PyreonWebSocket()
    ws.opened()
    ws.received("hi")
    val boom = RuntimeException("boom")
    ws.failed(boom)
    check(ws.error.value === boom) { "failed() sets error" }
    check(!ws.isConnected.value) { "failed() flips isConnected false" }
    // stale-while-error: prior frames survive a failure
    check(ws.lastMessage.value == "hi") { "failed() leaves lastMessage in place" }
    check(ws.messages.value == listOf("hi")) { "failed() leaves messages in place" }
}

fun testWsClosedDisconnectsButKeepsTranscript() {
    val ws = PyreonWebSocket()
    ws.opened()
    ws.received("x")
    ws.closed()
    check(!ws.isConnected.value) { "closed() flips isConnected false" }
    check(ws.messages.value == listOf("x")) { "closed() keeps the transcript" }
}

fun testWsConnectWiresInjectedTransport() {
    val ws = PyreonWebSocket()
    var sent: String? = null
    var closedSocket = false
    var handlers: WebSocketHandlers? = null
    // connect() hands the app the handler thunks (which drive the pure
    // transitions) and stores the returned sender for send()/close().
    ws.connect { h ->
        handlers = h
        WebSocketSender(send = { sent = it }, close = { closedSocket = true })
    }
    check(ws.isOpen) { "connect() opens the lifecycle" }
    // App's transport forwards an open + a frame through the handlers:
    handlers!!.onOpen()
    check(ws.isConnected.value) { "onOpen handler drives opened()" }
    handlers!!.onMessage("ping")
    check(ws.lastMessage.value == "ping") { "onMessage handler drives received()" }
    // Outbound send routes through the injected sender:
    ws.send("pong")
    check(sent == "pong") { "send() routes through the injected sender" }
    // close() drives the sender's close + the closed() transition:
    ws.close()
    check(closedSocket) { "close() invokes the sender's close" }
    check(!ws.isOpen) { "close() ends the lifecycle" }
    check(!ws.isConnected.value) { "close() drives closed() → isConnected false" }
}

fun testWsConnectIsIdempotent() {
    val ws = PyreonWebSocket()
    var registrations = 0
    val register: (WebSocketHandlers) -> WebSocketSender = { _ ->
        registrations++
        WebSocketSender(send = {}, close = {})
    }
    ws.connect(register)
    ws.connect(register) // second call while open → no-op
    check(registrations == 1) { "connect() is idempotent" }
}

/**
 * Double-`close()` after a `connect()` is a safe no-op — the second call
 * must NOT re-invoke the sender's close (the `connected` flag guards the
 * body; the second call early-returns). Lifecycle hardening — mirrors
 * PyreonNetworkStatus's double-stop guard.
 */
fun testWsDoubleCloseIsNoop() {
    val ws = PyreonWebSocket()
    var closes = 0
    ws.connect { _ -> WebSocketSender(send = {}, close = { closes++ }) }
    check(ws.isOpen) { "after connect(): isOpen" }
    ws.close()
    check(!ws.isOpen) { "after close(): not open" }
    ws.close() // second call → no-op, sender close NOT invoked twice
    check(!ws.isOpen) { "lifecycle stable across double-close" }
    check(closes == 1) { "double-close invokes sender close exactly once" }
}

/** `close()` before any `connect()` is a safe no-op. */
fun testWsCloseBeforeConnectIsNoop() {
    val ws = PyreonWebSocket()
    check(!ws.isOpen) { "fresh instance: not open" }
    ws.close() // must not crash, must not invoke any null sender
    check(!ws.isOpen) { "bare close() leaves not-open" }
}

/** `send()` before any `connect()` is a safe no-op (null sender). */
fun testWsSendBeforeConnectIsNoop() {
    val ws = PyreonWebSocket()
    ws.send("dropped") // must not crash — no sender wired yet
    check(ws.lastMessage.value == null) { "send() before connect doesn't touch state" }
}

/**
 * `connect() → close() → connect()` cycle works — `close()` fully resets
 * the lifecycle so a subsequent `connect()` re-invokes the supplied
 * `register`. Bisect-verified: removing the `connected = false` reset in
 * `close()` makes the second `connect()` a silent no-op
 * (`registrations == 1` instead of `2`).
 */
fun testWsConnectCloseConnectCycle() {
    val ws = PyreonWebSocket()
    var registrations = 0
    var closes = 0
    val register: (WebSocketHandlers) -> WebSocketSender = { _ ->
        registrations++
        WebSocketSender(send = {}, close = { closes++ })
    }
    ws.connect(register)
    check(ws.isOpen) { "after first connect(): open" }
    ws.close()
    check(!ws.isOpen) { "after first close(): not open" }
    ws.connect(register) // must succeed; would no-op if close() didn't reset
    check(ws.isOpen) { "after second connect(): re-opened" }
    ws.close()
    ws.close() // double-close tail
    check(registrations == 2) { "connect/close/connect re-registers cleanly" }
    check(closes == 2) { "each connect has exactly one matching sender close" }
}

/**
 * `failed()` flips `isConnected` false but does NOT clear the lifecycle —
 * the dead task stays "open" until `close()`. A reconnect therefore needs
 * an explicit `close()` first; `connect()` straight after `failed()` is a
 * no-op (the lifecycle flag is still set). Pins the documented contract:
 * "failed does not clear the lifecycle — call close() before reconnect".
 */
fun testWsFailedDoesNotClearLifecycle() {
    val ws = PyreonWebSocket()
    var registrations = 0
    val register: (WebSocketHandlers) -> WebSocketSender = { _ ->
        registrations++
        WebSocketSender(send = {}, close = {})
    }
    ws.connect(register)
    ws.opened()
    ws.failed(RuntimeException("drop"))
    check(!ws.isConnected.value) { "failed() → isConnected false" }
    check(ws.isOpen) { "failed() leaves the lifecycle open (close() owns teardown)" }
    ws.connect(register) // no-op — lifecycle still open
    check(registrations == 1) { "connect() after failed() (no close) is a no-op" }
    ws.close() // explicit teardown
    ws.connect(register) // now succeeds
    check(registrations == 2) { "connect() after close() re-registers" }
}

/**
 * `lastMessage` / `messages` / `isConnected` / `error` MUST be Compose
 * `MutableState` — this is the whole point of the reactive surface. If any
 * regresses to a plain field, the useWebSocket() compiler emit's recompose
 * contract is broken. Reflection probe mirrors PyreonNetworkStatus's
 * isOnline shape check.
 */
fun testWsReactiveFieldsAreMutableState() {
    val ws = PyreonWebSocket()
    for (name in listOf("lastMessage", "messages", "isConnected", "error")) {
        val prop = ws::class.members.first { it.name == name }
        val t = prop.returnType.toString()
        check(t.contains("MutableState")) {
            "$name MUST be a Compose MutableState (reactive surface). Actual: $t"
        }
    }
    // Companion: isOpen MUST be a plain Boolean (NOT Compose-reactive) —
    // mirrors PyreonNetworkStatus.isMonitoring's documented contract.
    val openProp = ws::class.members.first { it.name == "isOpen" }
    val openType = openProp.returnType.toString()
    check(openType == "kotlin.Boolean") {
        "isOpen must return plain kotlin.Boolean (lifecycle flag, not " +
        "Compose-reactive). Actual: $openType"
    }
}

fun main() {
    testWsInitialState()
    testWsOpenedFlips()
    testWsReceivedAccumulates()
    testWsFailedSetsErrorAndDisconnects()
    testWsClosedDisconnectsButKeepsTranscript()
    testWsConnectWiresInjectedTransport()
    testWsConnectIsIdempotent()
    testWsDoubleCloseIsNoop()
    testWsCloseBeforeConnectIsNoop()
    testWsSendBeforeConnectIsNoop()
    testWsConnectCloseConnectCycle()
    testWsFailedDoesNotClearLifecycle()
    testWsReactiveFieldsAreMutableState()
    println("[PyreonWebSocketTest] all smoke tests passed")
}
