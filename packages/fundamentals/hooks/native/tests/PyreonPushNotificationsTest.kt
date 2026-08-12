// Smoke tests for PyreonPushNotifications — the reactive push container.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonPushNotifications`.
//
// Scope: the PURE state machine + the injected-registration lifecycle. The
// real FCM service is the app's / Android-CI's responsibility.

package com.pyreon.runtime

fun testPushInitialState() {
    val push = PyreonPushNotifications()
    check(push.token.value == null) { "token starts null" }
    check(push.lastNotification.value == null) { "lastNotification starts null" }
    check(push.notifications.value.isEmpty()) { "notifications starts empty" }
    check(!push.isAuthorized.value) { "isAuthorized starts false" }
    check(push.error.value == null) { "error starts null" }
    check(!push.isRegistered) { "isRegistered starts false" }
}

fun testPushTokenReceived() {
    val push = PyreonPushNotifications()
    push.tokenReceived("fcm-abc123")
    check(push.token.value == "fcm-abc123") { "token set" }
}

fun testPushNotificationAccumulates() {
    val push = PyreonPushNotifications()
    val a = PyreonPushNotification(title = "Hi", body = "first")
    val b = PyreonPushNotification(title = "Yo", body = "second", data = mapOf("k" to "v"))
    push.notificationReceived(a)
    push.notificationReceived(b)
    check(push.lastNotification.value == b) { "lastNotification is most recent" }
    check(push.notifications.value == listOf(a, b)) { "notifications accumulate in order" }
    check(push.notifications.value[1].data["k"] == "v") { "data payload carried" }
}

fun testPushAuthorizeFlips() {
    val push = PyreonPushNotifications()
    push.authorize(true)
    check(push.isAuthorized.value) { "authorize(true) → granted" }
    push.authorize(false)
    check(!push.isAuthorized.value) { "authorize(false) → denied" }
}

fun testPushFailKeepsToken() {
    val push = PyreonPushNotifications()
    push.tokenReceived("tok")
    push.notificationReceived(PyreonPushNotification(body = "x"))
    push.fail(RuntimeException("apns down"))
    check(push.error.value != null) { "fail() sets error" }
    check(push.token.value == "tok") { "fail() keeps token (stale-while-error)" }
    check(push.notifications.value.size == 1) { "fail() keeps notifications" }
}

fun testPushTokenClearsError() {
    val push = PyreonPushNotifications()
    push.fail(RuntimeException("first"))
    check(push.error.value != null) { "error set" }
    push.tokenReceived("new-tok")
    check(push.error.value == null) { "a new token clears the prior error" }
}

fun testPushStartWiresInjectedRegistration() {
    val push = PyreonPushNotifications()
    var handlers: PyreonPushHandlers? = null
    var unregistered = false
    push.start { h ->
        handlers = h
        { unregistered = true }
    }
    check(push.isRegistered) { "start() registers" }
    handlers!!.onToken("device-token")
    check(push.token.value == "device-token") { "onToken handler drives tokenReceived()" }
    handlers!!.onAuthorization(true)
    check(push.isAuthorized.value) { "onAuthorization handler drives authorize()" }
    handlers!!.onNotification(PyreonPushNotification(title = "T"))
    check(push.lastNotification.value?.title == "T") { "onNotification handler drives received()" }
    push.stop()
    check(unregistered) { "stop() invokes the unregister thunk" }
    check(!push.isRegistered) { "stop() unregisters" }
}

fun testPushStartIsIdempotent() {
    val push = PyreonPushNotifications()
    var registrations = 0
    val register: (PyreonPushHandlers) -> (() -> Unit) = { _ -> registrations++; {} }
    push.start(register)
    push.start(register)
    check(registrations == 1) { "start() is idempotent" }
}

fun testPushDoubleStopIsNoop() {
    val push = PyreonPushNotifications()
    var unregistrations = 0
    push.start { _ -> { unregistrations++ } }
    push.stop()
    push.stop()
    check(!push.isRegistered) { "stable across double-stop" }
    check(unregistrations == 1) { "double-stop unregisters exactly once" }
}

fun testPushStartStopStartCycle() {
    val push = PyreonPushNotifications()
    var registrations = 0
    val register: (PyreonPushHandlers) -> (() -> Unit) = { _ -> registrations++; {} }
    push.start(register)
    push.stop()
    push.start(register)
    check(push.isRegistered) { "second start() re-registered" }
    push.stop()
    check(registrations == 2) { "start/stop/start re-registers cleanly" }
}

fun testPushReactiveFieldShapes() {
    val push = PyreonPushNotifications()
    for (name in listOf("token", "lastNotification", "notifications", "isAuthorized", "error")) {
        val t = push::class.members.first { it.name == name }.returnType.toString()
        check(t.contains("MutableState")) { "$name MUST be a Compose MutableState. Actual: $t" }
    }
    val regType = push::class.members.first { it.name == "isRegistered" }.returnType.toString()
    check(regType == "kotlin.Boolean") { "isRegistered must be plain Boolean. Actual: $regType" }
}

fun main() {
    testPushInitialState()
    testPushTokenReceived()
    testPushNotificationAccumulates()
    testPushAuthorizeFlips()
    testPushFailKeepsToken()
    testPushTokenClearsError()
    testPushStartWiresInjectedRegistration()
    testPushStartIsIdempotent()
    testPushDoubleStopIsNoop()
    testPushStartStopStartCycle()
    testPushReactiveFieldShapes()
    println("[PyreonPushNotificationsTest] all smoke tests passed")
}
