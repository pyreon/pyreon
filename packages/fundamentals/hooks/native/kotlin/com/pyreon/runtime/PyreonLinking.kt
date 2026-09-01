// PyreonLinking — the Compose side of Pyreon's external-URL service
// (M3.2b). Mirrors the Swift `PyreonLinking` one-for-one + the core
// `@pyreon/hooks` `useLinking` shape.
//
// Surface:
//
//     linking.openUrl("https://pyreon.dev")   // hand the URL to the OS
//
// Android opens a URL with an `ACTION_VIEW` intent — the system routes it
// to the browser (or the app registered for the scheme). The `Context` is
// captured at CONSTRUCTION time (not per-call) so the public method matches
// Swift's one-for-one. PMTC emits
// `remember { PyreonLinking(LocalContext.current) }`.

package com.pyreon.runtime

import android.content.Context
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri

/**
 * External-URL opener — the Compose half of `useLinking`. Lives as
 * `remember { PyreonLinking(LocalContext.current) }` inside a composable.
 * No reactive state; `openUrl` fires an ACTION_VIEW intent.
 */
class PyreonLinking(private val context: Context) {
    /**
     * Open `url` in the platform browser / the app registered for its scheme.
     *
     * Returns whether anything could handle it. `startActivity` THROWS
     * `ActivityNotFoundException` when no app resolves the scheme, so an
     * unguarded call terminated the process on a URL the device simply could
     * not open — a `zoommtg://` link on a phone without Zoom, from a feed of
     * server-supplied links. The Swift half already degraded gracefully, so one
     * shared source crashed on exactly one target.
     *
     * Reported rather than swallowed: a caller that wants to fall back (open
     * the https equivalent, show a message) needs to know, and a bare `catch`
     * would leave the button looking broken with no way to tell.
     */
    fun openUrl(url: String): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            // startActivity may be called from a non-Activity Context; ACTION_VIEW
            // then needs NEW_TASK (harmless for an Activity Context too).
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}
