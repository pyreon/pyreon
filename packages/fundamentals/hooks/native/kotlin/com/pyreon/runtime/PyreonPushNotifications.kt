// PyreonPushNotifications — the Compose side of Pyreon's cross-platform push
// story (Tier 3). Mirrors a `usePush` reactive surface and the Swift
// `PyreonPushNotifications` one-for-one.
//
// ## What this delivers
//
// A reactive push container (Compose `MutableState`, read `.value`):
//
//     push.token.value            // the FCM device token, null until registered
//     push.lastNotification.value // the most recent inbound notification
//     push.notifications.value    // every inbound notification in order
//     push.isAuthorized.value     // true once notification permission granted
//     push.error.value            // most recent failure, null on success
//
// ## Pure state + INJECTED registration (both platforms)
//
// The device token lands in the app's `FirebaseMessagingService`
// (`onNewToken`) on Android / the `AppDelegate` on iOS — NOT a delegate the
// container can own. So push registration is INJECTED on BOTH platforms
// (symmetric — no Swift-real / Kotlin-injected asymmetry here): the app
// forwards token / notification / authorization events from its FCM service
// into the handler thunks. The reactive STATE machine (`tokenReceived` /
// `notificationReceived` / `authorize` / `fail`) is pure + unit-testable.
//
// A `FirebaseMessagingService`-backed convenience is a Phase-2+ Android-CI
// follow-up. This file is Android-SDK-free (kotlinc-stub compatible).
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const push = usePush()` and emits a
// `PyreonPushNotifications`; reads become container reads, and the app's FCM
// service forwards events via `start(register)`.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** A received push notification — title + body + arbitrary data payload.
 * Mirrors the Swift `PyreonPushNotification`. */
public data class PyreonPushNotification(
    val title: String? = null,
    val body: String? = null,
    val data: Map<String, String> = emptyMap(),
)

/** The callbacks the app's FCM service forwards push events to. Supplied to
 * the app's `register` by [PyreonPushNotifications.start]. */
public class PyreonPushHandlers(
    public val onToken: (String) -> Unit,
    public val onNotification: (PyreonPushNotification) -> Unit,
    public val onAuthorization: (Boolean) -> Unit,
    public val onError: (Throwable) -> Unit,
)

/**
 * Reactive push container — the Compose half of `usePush`. Exposes [token] /
 * [lastNotification] / [notifications] / [isAuthorized] / [error] as Compose
 * `MutableState` (read `.value`).
 */
public class PyreonPushNotifications {
    /** The FCM device token, or null until registered. */
    public val token: MutableState<String?> = mutableStateOf(null)

    /** The most recent inbound notification, or null before the first. */
    public val lastNotification: MutableState<PyreonPushNotification?> = mutableStateOf(null)

    /** Every inbound notification in arrival order. */
    public val notifications: MutableState<List<PyreonPushNotification>> = mutableStateOf(emptyList())

    /** True once the user grants notification permission. */
    public val isAuthorized: MutableState<Boolean> = mutableStateOf(false)

    /** Most recent failure, or null on success / before first start. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    // MARK: - Pure state-machine transitions

    /** Record the device token (from the FCM service). */
    public fun tokenReceived(token: String) {
        this.token.value = token
        this.error.value = null
    }

    /** Record an inbound notification: set [lastNotification], append to
     * [notifications]. */
    public fun notificationReceived(notification: PyreonPushNotification) {
        lastNotification.value = notification
        notifications.value = notifications.value + notification
    }

    /** Record the authorization state (granted / denied). */
    public fun authorize(granted: Boolean) {
        isAuthorized.value = granted
    }

    /** Record a failure: set [error]. Leaves prior token / notifications in
     * place (stale-while-error). */
    public fun fail(failure: Throwable) {
        error.value = failure
    }

    // MARK: - Injected registration edge

    /**
     * Begin forwarding push events via the app-supplied [register]. The app
     * wires its FCM service (`onNewToken` / `onMessageReceived`) to the
     * handler thunks (which drive the pure transitions), and returns an
     * unregister thunk stored for [stop]. Idempotent — a second call while
     * registered is a no-op; [register] is NOT invoked a second time.
     */
    public fun start(register: (PyreonPushHandlers) -> (() -> Unit)) {
        if (started) return // idempotent
        started = true
        unregister = register(
            PyreonPushHandlers(
                onToken = { tokenReceived(it) },
                onNotification = { notificationReceived(it) },
                onAuthorization = { authorize(it) },
                onError = { fail(it) },
            ),
        )
    }

    /** Stop forwarding and release the registration. Safe to call when not
     * started (no-op) AND safe to call twice (early-returns on [started]). */
    public fun stop() {
        if (!started) return
        started = false
        unregister?.invoke()
        unregister = null
    }

    /** True iff currently forwarding push events (between a matched
     * [start] / [stop] pair). Cheap to read; not Compose-reactive. */
    public val isRegistered: Boolean get() = started

    private var started: Boolean = false
    private var unregister: (() -> Unit)? = null
}
