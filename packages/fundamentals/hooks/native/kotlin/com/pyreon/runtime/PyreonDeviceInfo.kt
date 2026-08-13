// PyreonDeviceInfo — the Compose side of `@pyreon/hooks`' useDeviceInfo.
// Mirror of PyreonDeviceInfo.swift; see that file's header for why `model`
// and `osVersion` are real here and empty on the web.

package com.pyreon.runtime

/** Screen geometry, in dp plus the backing density. */
public data class PyreonDeviceScreen(
    val width: Double,
    val height: Double,
    val scale: Double,
)

/**
 * The platform half of the device queries — `Build.MODEL`,
 * `Build.VERSION.RELEASE` and `DisplayMetrics` in the real implementation.
 * Swapped for a fake in tests, so the shape below runs with no Android SDK.
 */
public interface DeviceProbe {
    public val model: String
    public val osVersion: String
    public val isTouch: Boolean
    public val screen: PyreonDeviceScreen
}

/** Device description — the Compose half of `useDeviceInfo`. */
public class PyreonDeviceInfo(private val probe: DeviceProbe) {
    /** Compile-time constant on this target. */
    public val platform: String get() = "android"
    public val model: String get() = probe.model
    public val osVersion: String get() = probe.osVersion
    public val isTouch: Boolean get() = probe.isTouch

    /**
     * Read through on every access rather than cached at construction: a fold
     * or a rotation moves this while the app is live, and a value captured
     * once would silently describe the old geometry.
     */
    public val screen: PyreonDeviceScreen get() = probe.screen
}
