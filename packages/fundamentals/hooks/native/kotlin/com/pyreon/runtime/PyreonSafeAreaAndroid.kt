package com.pyreon.runtime

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue

/**
 * The Android probes `useSafeArea()` / `useScreenOrientation()` lower to —
 * `AndroidSafeAreaProbe(ctx)` / `AndroidOrientationProbe(ctx)`, named by the
 * Compose emit. Own file for the usual gate reason: `PyreonSafeArea.kt` stays
 * `android.*`-free so it remains verifiable under the Compose-only kotlinc
 * stubs and runnable in plain JVM.
 *
 * ## Why these exist
 *
 * The emit named both classes but they existed only in `kotlin-stubs.ts`, so
 * every app using either hook failed `gradle assembleDebug` with
 * `Unresolved reference` while every stub-based gate stayed green.
 *
 * ## Contract
 *
 * Read-through, like the interfaces they implement: each property read asks
 * the platform, so a rotation or fold is reflected. A plain read is not
 * enough on its own, though — Compose only re-runs a composable when a
 * tracked STATE changes, and a display read is not state. So each probe owns a
 * `mutableIntStateOf` tick that every read touches, bumped from a layout pass
 * of the hosting window.
 *
 * The watch is attached LAZILY, on the first read, and lives on the window's
 * own view tree (removed when the window detaches). It cannot use
 * `RememberObserver`: the emit `remember`s the `PyreonSafeArea` /
 * `PyreonScreenOrientation` wrapper, not the probe inside it, and Compose only
 * notifies an observer it is handed directly. The cost of attaching from a
 * read is one extra listener that is garbage with its Activity.
 *
 * A Context that is not (a wrapper around) an Activity has no window: the
 * safe-area probe degrades to zero insets, as the interface documents for "no
 * insets", rather than crashing.
 */

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/**
 * Bumps a Compose-observable tick whenever [read] returns something different
 * after a layout pass of the hosting window. Attached once, on first use.
 */
private class WindowChangeWatcher(private val context: Context, private val read: () -> Any?) {
    private var tick by mutableIntStateOf(0)
    private var attached = false

    /** Call from a getter: subscribes the reading composable, attaching on first use. */
    fun observe() {
        tick // subscribe the reading composable
        if (attached) return
        val decor = context.findActivity()?.window?.decorView ?: return
        attached = true
        var last = read()
        val layout = ViewTreeObserver.OnGlobalLayoutListener {
            val now = read()
            if (now != last) {
                last = now
                tick++
            }
        }
        decor.viewTreeObserver.addOnGlobalLayoutListener(layout)
        decor.addOnAttachStateChangeListener(
            object : View.OnAttachStateChangeListener {
                override fun onViewAttachedToWindow(v: View) {}

                override fun onViewDetachedFromWindow(v: View) {
                    v.removeOnAttachStateChangeListener(this)
                    // The observer registered on may be dead by now; removing
                    // from a dead one throws, so guard.
                    val tree = v.viewTreeObserver
                    if (tree.isAlive) tree.removeOnGlobalLayoutListener(layout)
                }
            },
        )
    }
}

/** Safe-area insets from the hosting window's root [WindowInsets], in dp. */
public class AndroidSafeAreaProbe(private val context: Context) : SafeAreaProbe {
    private val watcher = WindowChangeWatcher(context) { read() }

    override val insets: PyreonSafeAreaInsets
        get() {
            watcher.observe()
            return read()
        }

    private fun read(): PyreonSafeAreaInsets {
        val decor = context.findActivity()?.window?.decorView ?: return PyreonSafeAreaInsets.zero
        val wi = decor.rootWindowInsets ?: return PyreonSafeAreaInsets.zero
        val density = context.resources.displayMetrics.density
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val i = wi.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            pyreonInsetsFromPx(i.top, i.right, i.bottom, i.left, density)
        } else {
            @Suppress("DEPRECATION")
            pyreonInsetsFromPx(
                wi.systemWindowInsetTop,
                wi.systemWindowInsetRight,
                wi.systemWindowInsetBottom,
                wi.systemWindowInsetLeft,
                density,
            )
        }
    }
}

/** Orientation type + angle from the display's live size and rotation. */
public class AndroidOrientationProbe(private val context: Context) : OrientationProbe {
    private val watcher = WindowChangeWatcher(context) {
        val m = context.resources.displayMetrics
        pyreonOrientationType(m.widthPixels, m.heightPixels) to angle0()
    }

    override val type: String
        get() {
            watcher.observe()
            val m = context.resources.displayMetrics
            return pyreonOrientationType(m.widthPixels, m.heightPixels)
        }

    override val angle: Int
        get() {
            watcher.observe()
            return angle0()
        }

    private fun angle0(): Int = pyreonAngleFromRotation(rotation())

    @Suppress("DEPRECATION")
    private fun rotation(): Int {
        val d = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // `Context.display` throws on a non-visual context; an Activity
            // is visual, anything else falls back to the WindowManager.
            runCatching { context.display }.getOrNull()
        } else {
            null
        }
        val display = d ?: (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay
        return display?.rotation ?: 0
    }
}
