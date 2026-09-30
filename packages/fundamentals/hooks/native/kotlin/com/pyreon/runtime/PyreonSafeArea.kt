// PyreonSafeArea + PyreonScreenOrientation — the Compose side of
// `@pyreon/hooks`' useSafeArea / useScreenOrientation. Mirror of
// PyreonSafeArea.swift; see that file's header for why both read through
// rather than caching, and why orientation is read-only.

package com.pyreon.runtime

/** Insets content must avoid — status bar, gesture bar, cutout. */
public data class PyreonSafeAreaInsets(
    val top: Double,
    val right: Double,
    val bottom: Double,
    val left: Double,
) {
    public companion object {
        public val zero: PyreonSafeAreaInsets = PyreonSafeAreaInsets(0.0, 0.0, 0.0, 0.0)
    }
}

/** The platform half — `WindowInsets` in the real implementation. */
public interface SafeAreaProbe {
    public val insets: PyreonSafeAreaInsets
}

/** The safe-area insets of the current display. */
public class PyreonSafeArea(private val probe: SafeAreaProbe) {
    /** Read through on every access — see the file header. */
    public val insets: PyreonSafeAreaInsets get() = probe.insets
}

/** The platform half of the orientation read. */
public interface OrientationProbe {
    /** "portrait" or "landscape" — normalised, matching the web arm. */
    public val type: String

    /** 0 / 90 / 180 / 270. */
    public val angle: Long
}

/**
 * Which way the display is oriented. READ-ONLY by design — see the Swift
 * header: locking does not cross, so it is not part of the surface.
 */
public class PyreonScreenOrientation(private val probe: OrientationProbe) {
    public val type: String get() = probe.type
    public val angle: Long get() = probe.angle
}

// ── Pure conversions the Android probes share ────────────────────────────
// No `android.*` import here on purpose: this file stays runnable in plain JVM
// and verifiable under the Compose-only kotlinc stubs. The Context-touching
// half is PyreonSafeAreaAndroid.kt.

/**
 * Pixel insets to the dp the hook reports. dp is the CSS-px analogue on this
 * target, so `useSafeArea().top` means the same length here as
 * `env(safe-area-inset-top)` does on the web.
 */
public fun pyreonInsetsFromPx(
    top: Int,
    right: Int,
    bottom: Int,
    left: Int,
    density: Float,
): PyreonSafeAreaInsets {
    // A non-positive density would divide by zero / flip signs; report zero
    // insets (content draws without padding) rather than garbage.
    if (density <= 0f) return PyreonSafeAreaInsets.zero
    val d = density.toDouble()
    return PyreonSafeAreaInsets(top / d, right / d, bottom / d, left / d)
}

/**
 * `Surface.ROTATION_0..3` (0, 1, 2, 3) to the web's degrees (0/90/180/270).
 * Android's ROTATION_90 is the display rotated 90 degrees counter-clockwise
 * from its natural orientation, which is also what `screen.orientation.angle`
 * reports, so the mapping is a plain multiply. Anything out of range
 * normalises rather than throwing.
 */
public fun pyreonAngleFromRotation(rotation: Int): Int = ((rotation % 4) + 4) % 4 * 90

/**
 * "portrait" | "landscape" from the CURRENT display size in pixels. Derived
 * from the shape, not from the rotation, because a tablet's natural
 * orientation is landscape — rotation 0 there is landscape. A square display
 * reports portrait, the same tie-break the web arm makes.
 */
public fun pyreonOrientationType(widthPx: Int, heightPx: Int): String =
    if (widthPx > heightPx) "landscape" else "portrait"
