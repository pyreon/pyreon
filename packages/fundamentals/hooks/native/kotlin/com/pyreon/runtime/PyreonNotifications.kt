// PyreonNotifications — the Compose side of Pyreon's LOCAL-notification
// service (M3.3). Mirrors the Swift `PyreonNotifications` one-for-one + the
// core `@pyreon/hooks` `useNotifications` shape.
//
// Distinct from PyreonPushNotifications (which RECEIVES remote push): this
// SCHEDULES a local notification from the app itself.
//
// Surface:
//
//     notifs.requestPermission()          // (channel-based; see below)
//     notifs.notify("Title", "Body")      // post a local notification
//
// Android notifications need a NotificationChannel (API 26+, created in
// `init`) and, on API 33+, the `POST_NOTIFICATIONS` runtime permission
// (declared in the app manifest, requested by the host Activity).
// `NotificationManagerCompat.notify` no-ops gracefully if the permission
// isn't granted — it never throws.
//
// The `Context` is captured at CONSTRUCTION time (not per-call) so the
// public methods match Swift's one-for-one. PMTC emits
// `remember { PyreonNotifications(LocalContext.current) }`.

package com.pyreon.runtime

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Local-notification wrapper — the Compose half of `useNotifications`. Lives
 * as `remember { PyreonNotifications(LocalContext.current) }` inside a
 * composable. Creates its notification channel on construction (API 26+).
 */
class PyreonNotifications(private val context: Context) {
    private val channelId = "pyreon_default"

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Notifications",
                NotificationManager.IMPORTANCE_DEFAULT,
            )
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    /**
     * The channel is created in `init`; the POST_NOTIFICATIONS runtime
     * permission (API 33+) is declared in the manifest and requested by the
     * host Activity, so there is nothing further to do here to post.
     */
    fun requestPermission() {
        // no-op — see the class doc / init().
    }

    /** Post a local notification. No-ops gracefully if POST_NOTIFICATIONS isn't granted. */
    fun notify(title: String, body: String) {
        val notification = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context)
            .notify(System.currentTimeMillis().toInt(), notification)
    }
}
