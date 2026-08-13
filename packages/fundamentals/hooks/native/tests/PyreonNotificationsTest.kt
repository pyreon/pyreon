// Smoke tests for PyreonNotifications — the Compose `useNotifications`
// LOCAL-notification wrapper. Mirrors PyreonShareTest.kt's dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=
// PyreonNotifications` against the android.app/content/os/R + androidx.core.app
// stubs.
//
// What this covers (construction + no-throw delegation):
//   - `init` requests the NotificationManager system service to create the
//     channel (the API 26+ path — the stub Build.VERSION.SDK_INT is >= O)
//   - `notify` / `requestPermission` run without throwing
//   - Single-arg (Context) constructor — the shape the compiler emit depends
//     on (`remember { PyreonNotifications(notifsCtx) }`)
//
// What this does NOT cover (device-CI's Android build against the REAL
// NotificationManager does): that a notification is actually delivered — that
// goes through NotificationManagerCompat + the POST_NOTIFICATIONS permission,
// which the emulator/manifest exercise.

package com.pyreon.runtime

import android.content.Context

private class RecordingContext : Context() {
    var systemServiceRequested = false
    override fun <T> getSystemService(serviceClass: Class<T>): T? {
        systemServiceRequested = true
        return null
    }
}

fun testNotificationsCreatesChannel() {
    val ctx = RecordingContext()
    PyreonNotifications(ctx)
    check(ctx.systemServiceRequested) {
        "init() requests the NotificationManager to create the channel"
    }
}

fun testNotifyDoesNotThrow() {
    val notifs = PyreonNotifications(RecordingContext())
    notifs.notify("Title", "Body")
    notifs.requestPermission()
    // Reaching here = the notify/requestPermission code paths ran without
    // throwing (the actual post goes through NotificationManagerCompat).
    check(true) { "notify + requestPermission complete without throwing" }
}

fun main() {
    testNotificationsCreatesChannel()
    testNotifyDoesNotThrow()
    println("[PyreonNotificationsTest] all smoke tests passed")
}
