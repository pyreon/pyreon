// PyreonShare — the Compose side of Pyreon's share service (M3.2).
// Mirrors the Swift `PyreonShare` one-for-one + the core `@pyreon/hooks`
// `useShare` shape.
//
// Surface:
//
//     share.text("Hello")               // share plain text
//     share.url("https://pyreon.dev")    // share a URL
//     share.textUrl("Look:", url)        // text + URL
//     share.canShare()                   // → true
//
// Android sharing goes through the system chooser:
// `context.startActivity(Intent.createChooser(ACTION_SEND, …))`. The
// `Context` is captured at CONSTRUCTION time (not per-call) so the public
// method signatures match Swift's one-for-one. PMTC emits
// `remember { PyreonShare(LocalContext.current) }`.
//
// HONEST platform note: Android's basic ACTION_SEND intent is TEXT-based —
// `text` / `url` / `textUrl` all become an `EXTRA_TEXT` string (a URL is
// shared as text). iOS distinguishes a `URL` item (rich link preview) from
// text; Android's share target receives a plain string either way. Same
// API surface, coarser Android fidelity — a genuine platform difference.

package com.pyreon.runtime

import android.content.Context
import android.content.Intent

/**
 * Imperative share-sheet wrapper — the Compose half of `useShare`. Lives
 * as `remember { PyreonShare(LocalContext.current) }` inside a composable
 * (per the PMTC emit pattern). No reactive state; each method launches the
 * system share chooser.
 */
class PyreonShare(private val context: Context) {
    /** Share plain text. */
    fun text(text: String) = present(text)

    /** Share a URL (as text — Android's basic share intent is text-based). */
    fun url(url: String) = present(url)

    /** Share text with an accompanying URL. */
    fun textUrl(text: String, url: String) = present("$text $url")

    /** Whether sharing is available. Always true on Android. */
    fun canShare(): Boolean = true

    private fun present(text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        val chooser = Intent.createChooser(send, null).apply {
            // startActivity may be called from a non-Activity Context; the
            // chooser needs NEW_TASK in that case (harmless for an Activity
            // Context — a chooser starts its own task regardless).
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
