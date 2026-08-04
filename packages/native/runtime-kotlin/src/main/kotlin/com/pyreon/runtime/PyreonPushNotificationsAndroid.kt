package com.pyreon.runtime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * The Android delivery edge for `usePush` — kept in its OWN file for the same
 * reason as [PyreonNetworkStatusAndroid]: `PyreonPushNotifications.kt` must
 * stay free of `android.*` imports so it remains verifiable under the
 * stub-only `kotlinc` gate and runnable in the plain-JVM test suite.
 *
 * ## Why this exists
 *
 * `PyreonPushNotifications` shipped as a pure state container with a
 * `start(register)` seam the app was expected to wire from its
 * `FirebaseMessagingService` — and nothing wired it, so `usePush()` on
 * Android rendered its initial state forever. The same never-wired class as
 * `useOnline` before [rememberPyreonNetworkStatus]: a default that requires a
 * step nobody takes is not a default.
 *
 * ## What this is — and is not
 *
 * FCM transport needs `google-services.json` + Firebase credentials, which a
 * framework default cannot assume. What CAN be self-owned is the app-side
 * DELIVERY SEAM: a [BroadcastReceiver] on [PYREON_PUSH_ACTION] for the
 * composable's lifetime, driving [PyreonPushNotifications.notificationReceived]
 * so the UI re-renders. An app that adds FCM forwards `onMessageReceived`
 * into the same container via `start(register)` — the first `start` of
 * either kind wins — or simply re-broadcasts [PYREON_PUSH_ACTION] internally.
 * The receiver is registered NOT_EXPORTED (API 33+): only the app itself
 * (which includes its instrumentation, same UID) can deliver — an arbitrary
 * external app cannot inject notifications.
 *
 * Extras contract: `title` + `body` map to the notification's fields; every
 * OTHER String extra lands in `data` (mirrors the FCM data-message shape).
 *
 * Broadcast delivery runs on the main thread (the default `registerReceiver`
 * scheduler is the context's main looper), so the Compose `MutableState`
 * writes inside `notificationReceived` are UI-thread — the same constraint
 * that required the Handler overload on ConnectivityManager, satisfied here
 * by the platform default.
 */
@Composable
public fun rememberPyreonPushNotifications(): PyreonPushNotifications {
    val context = LocalContext.current
    val push = remember { PyreonPushNotifications() }

    DisposableEffect(context) {
        val receiver =
            object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    if (intent == null) return
                    val extras = intent.extras
                    val data = mutableMapOf<String, String>()
                    if (extras != null) {
                        for (key in extras.keySet()) {
                            if (key == "title" || key == "body") continue
                            val value = extras.getString(key) ?: continue
                            data[key] = value
                        }
                    }
                    push.notificationReceived(
                        PyreonPushNotification(
                            title = intent.getStringExtra("title"),
                            body = intent.getStringExtra("body"),
                            data = data,
                        ),
                    )
                }
            }
        val filter = IntentFilter(PYREON_PUSH_ACTION)
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
        } catch (_: Exception) {
            // Registration failure degrades to an inert container rather than
            // taking the screen down — the pure transitions stay drivable.
        }
        onDispose {
            // unregister throws IllegalArgumentException if registration
            // failed above — swallow, symmetric with the guarded register.
            runCatching { context.unregisterReceiver(receiver) }
        }
    }
    return push
}

/**
 * The broadcast action [rememberPyreonPushNotifications] listens on. The
 * app-internal delivery seam: an FCM service (or an instrumented test — same
 * UID, so it clears NOT_EXPORTED) re-broadcasts inbound messages on this
 * action with `title`/`body` + String data extras.
 */
public const val PYREON_PUSH_ACTION: String = "com.pyreon.runtime.PUSH"
