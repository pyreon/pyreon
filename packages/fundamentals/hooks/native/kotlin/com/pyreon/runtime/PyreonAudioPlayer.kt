// PyreonAudioPlayer — the Media3 side of `<Audio>`. Mirror of
// PyreonAudioPlayer.swift; see that file's header for why the host is a
// concrete zero-size node rather than nothing at all.
//
// The engine is injected so the state machine is testable with no Android SDK.

package com.pyreon.runtime

/** The platform half of playback. Swapped for a fake in tests. */
public interface AudioEngine {
    public fun load(url: String, loop: Boolean, muted: Boolean, volume: Double)
    public fun play()
    public fun pause()
    public fun stop()
}

/** Playback status, matching the web arm's `onStatusChange` values. */
public enum class PyreonAudioStatus(public val value: String) {
    WAITING("waiting"),
    PLAYING("playing"),
    PAUSED("paused"),
}

public class PyreonAudioState(private val engine: AudioEngine) {
    public var status: PyreonAudioStatus = PyreonAudioStatus.WAITING
        private set

    public companion object {
        /**
         * Clamped, not rejected: a volume outside 0..1 is a caller slip, and
         * refusing to play is a worse answer than the nearest legal level.
         * The web arm and the Swift runtime clamp identically.
         */
        public fun clampVolume(v: Double): Double = minOf(1.0, maxOf(0.0, v))
    }

    public fun start(url: String, autoPlay: Boolean, loop: Boolean, muted: Boolean, volume: Double) {
        engine.load(url, loop, muted, clampVolume(volume))
        if (autoPlay) {
            engine.play()
            status = PyreonAudioStatus.PLAYING
        } else {
            status = PyreonAudioStatus.PAUSED
        }
    }

    public fun play() {
        engine.play()
        status = PyreonAudioStatus.PLAYING
    }

    public fun pause() {
        engine.pause()
        status = PyreonAudioStatus.PAUSED
    }

    public fun stop() {
        engine.stop()
        status = PyreonAudioStatus.PAUSED
    }
}
