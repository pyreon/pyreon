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
    public val angle: Int
}

/**
 * Which way the display is oriented. READ-ONLY by design — see the Swift
 * header: locking does not cross, so it is not part of the surface.
 */
public class PyreonScreenOrientation(private val probe: OrientationProbe) {
    public val type: String get() = probe.type
    public val angle: Int get() = probe.angle
}
