package com.pyreon.runtime

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * The Android edge for `useReducedMotion` — its own file so `PyreonReducedMotion.kt` stays free of `android.*` (see
 * the note there).
 *
 * ## What "reduced motion" means on Android
 *
 * Android has no single `prefers-reduced-motion`. The accessibility toggle that corresponds to it ("Remove
 * animations", under Accessibility → Color and motion) sets the global animator duration scale to 0, and that is the
 * value Chrome on Android reports as `prefers-reduced-motion: reduce`. This reads the same setting, so a shared
 * source sees one answer on the web and on the device. A user who merely dials the developer-option scale down to
 * 0 gets `true` too — also "the OS says do not animate", and the same thing the platform's own animators honour.
 *
 * ## Contract
 *
 * Seeds from the CURRENT setting (a screen opened while it is already on must not render motion first), then
 * observes it for the composable's lifetime and stops on leave. The observer is delivered on the MAIN looper:
 * `update` writes Compose `MutableState`, and a write off the main thread is the "multithreaded access to
 * SnapshotStateObserver" crash (see PyreonNetworkStatusAndroid). A device that denies the read degrades to `false`
 * ("animate as usual") rather than crashing.
 */
@Composable
public fun rememberPyreonReducedMotion(): PyreonReducedMotion {
    val context = LocalContext.current
    val state = remember { PyreonReducedMotion(isReducedMotion(context)) }

    DisposableEffect(context) {
        val resolver = context.contentResolver
        val observer =
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    state.update(isReducedMotion(context))
                }
            }
        val registered =
            try {
                resolver.registerContentObserver(
                    Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
                    false,
                    observer,
                )
                true
            } catch (_: SecurityException) {
                false
            }
        // The setting could have changed between the seed above and the registration.
        state.update(isReducedMotion(context))
        onDispose {
            if (registered) runCatching { resolver.unregisterContentObserver(observer) }
        }
    }

    return state
}

/** True when the global animator duration scale is 0; `false` when it cannot be read. */
private fun isReducedMotion(context: Context): Boolean =
    try {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    } catch (_: SecurityException) {
        false
    }
