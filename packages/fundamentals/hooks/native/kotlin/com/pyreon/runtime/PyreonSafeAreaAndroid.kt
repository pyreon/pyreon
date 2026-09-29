package com.pyreon.runtime

import android.app.Activity
import android.content.ComponentCallbacks
import android.content.Context
import android.content.ContextWrapper
import android.content.res.Configuration
import android.os.Build
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
import androidx.compose.runtime.RememberObserver
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
 * tracked STATE changes, and a `Configuration` read is not state. So each
 * probe owns a `mutableIntStateOf` tick that every read touches, and bumps it
 * from a platform callback. The probes implement [RememberObserver], which
 * `remember { … }` (what the emit writes) honours: the callback is registered
 * when the probe enters the composition and unregistered when it leaves — no
 * leak, and no change to the emitted shape.
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

/** Safe-area insets from the hosting window's root [WindowInsets], in dp. */
public class AndroidSafeAreaProbe(private val context: Context) : SafeAreaProbe, RememberObserver {
    private var tick by mutableIntStateOf(0)
    private var last: PyreonSafeAreaInsets = PyreonSafeAreaInsets.zero
    private var layoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null
    private var observedTree: ViewTreeObserver? = null

    override val insets: PyreonSafeAreaInsets
        get() {
            tick // subscribe the reading composable to inset changes
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

    override fun onRemembered() {
        val decor = context.findActivity()?.window?.decorView ?: return
        last = read()
        // rootWindowInsets is null until the window is attached and after a
        // rotation the insets change without a config callback the composable
        // can see, so watch layout passes and bump only on an actual change.
        val tree = decor.viewTreeObserver
        val l = ViewTreeObserver.OnGlobalLayoutListener {
            val now = read()
            if (now != last) {
                last = now
                tick++
            }
        }
        tree.addOnGlobalLayoutListener(l)
        observedTree = tree
        layoutListener = l
    }

    private fun detach() {
        val l = layoutListener ?: return
        val tree = observedTree
        // The observer we registered on may be dead if the view was
        // re-created; removing from a dead one throws, so guard.
        if (tree != null && tree.isAlive) tree.removeOnGlobalLayoutListener(l)
        layoutListener = null
        observedTree = null
    }

    override fun onForgotten() = detach()
    override fun onAbandoned() = detach()
}

/** Orientation type + angle from the display's live size and rotation. */
public class AndroidOrientationProbe(private val context: Context) : OrientationProbe, RememberObserver {
    private var tick by mutableIntStateOf(0)
    private var callbacks: ComponentCallbacks? = null

    override val type: String
        get() {
            tick
            val m = context.resources.displayMetrics
            return pyreonOrientationType(m.widthPixels, m.heightPixels)
        }

    override val angle: Int
        get() {
            tick
            return pyreonAngleFromRotation(rotation())
        }

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

    override fun onRemembered() {
        val cb = object : ComponentCallbacks {
            override fun onConfigurationChanged(newConfig: Configuration) {
                tick++
            }

            @Deprecated("Required by the interface; no memory behaviour here.")
            override fun onLowMemory() {}
        }
        // Delivered when the Activity handles the change itself
        // (`configChanges="orientation|screenSize"`). When it does NOT, the
        // Activity is recreated and `remember` starts over with a fresh
        // probe, which reads the new values anyway.
        context.registerComponentCallbacks(cb)
        callbacks = cb
    }

    private fun detach() {
        callbacks?.let { context.unregisterComponentCallbacks(it) }
        callbacks = null
    }

    override fun onForgotten() = detach()
    override fun onAbandoned() = detach()
}
