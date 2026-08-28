package com.pyreon.runtime

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * Media3AudioEngine — the concrete [AudioEngine] the `<Audio>` emit names.
 *
 * This did not exist. The emit produces
 * `PyreonAudioPlayer(url = …, engine = Media3AudioEngine(LocalContext.current))`
 * and the only definition of that type anywhere in the repo was the kotlinc
 * validation stub. Its Swift counterpart `AVFoundationAudioEngine` was stub-only
 * too, and Android had no composable at all, so `<Audio>` had never built on
 * EITHER platform while passing both stub gates. No example uses it, which is
 * why no device gate said so.
 *
 * ExoPlayer rather than MediaPlayer: `<Audio src>` accepts a remote URL, and it
 * is what the video runtime already uses, so the two halves of media playback
 * share one dependency and one mental model.
 *
 * Own `*Media3.kt` file for the usual gate reason — `PyreonAudioPlayer.kt` stays
 * free of `androidx.*` so its state machine remains runnable on a plain JVM,
 * which is what makes it testable at all.
 */
public class Media3AudioEngine(private val context: Context) : AudioEngine {
    private var player: ExoPlayer? = null

    /**
     * REPLACES any current source rather than layering a second one over it.
     * Audio has no z-order to make an accidental overlap visible — only volume,
     * which is the worst way to discover it.
     */
    override fun load(url: String, loop: Boolean, muted: Boolean, volume: Double) {
        stop()
        player = ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            // The state machine already clamped this; clamping again keeps the
            // engine correct when driven directly, as tests do.
            this.volume = if (muted) 0f else minOf(1.0, maxOf(0.0, volume)).toFloat()
            prepare()
        }
    }

    override fun play() {
        player?.playWhenReady = true
    }

    override fun pause() {
        player?.playWhenReady = false
    }

    override fun stop() {
        // `release()` and not just `stop()`: an ExoPlayer holds a codec and a
        // wake lock, and leaking those is the battery shape of a leak.
        player?.release()
        player = null
    }
}
