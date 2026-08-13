// PyreonWakeLock — the Compose side of `@pyreon/hooks`' useWakeLock.
// Mirror of PyreonWakeLock.swift; see that file's header for why the web arm
// carries normalization this one does not need.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * The platform half of a wake lock — `FLAG_KEEP_SCREEN_ON` in the real
 * implementation. Swapped for a fake in tests, so the state machine below
 * runs with no Android SDK and no device.
 */
public interface ScreenKeeper {
    /** True when the platform can hold a wake lock at all. */
    public val isSupported: Boolean

    /** Hold or release the screen. Idempotent on both edges. */
    public fun setKeepScreenOn(on: Boolean)
}

/** Reactive screen wake lock — the Compose half of `useWakeLock`. */
public class PyreonWakeLock(private val keeper: ScreenKeeper) {
    public val active: MutableState<Boolean> = mutableStateOf(false)

    public val supported: Boolean get() = keeper.isSupported

    /**
     * Acquire the lock. Returns whether it is now held — false when the
     * platform cannot hold one, matching the web arm's rejected-request path
     * rather than throwing.
     */
    public fun request(): Boolean {
        if (!keeper.isSupported) return false
        if (active.value) return true
        keeper.setKeepScreenOn(true)
        active.value = true
        return true
    }

    /** Release the lock. Safe to call when not held. */
    public fun release() {
        if (!active.value) return
        keeper.setKeepScreenOn(false)
        active.value = false
    }
}
