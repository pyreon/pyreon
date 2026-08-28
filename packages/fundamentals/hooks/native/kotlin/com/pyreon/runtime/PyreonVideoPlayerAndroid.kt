package com.pyreon.runtime

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * The Compose side of Pyreon's `<Video>` primitive — Media3 ExoPlayer in an
 * [AndroidView]-hosted [PlayerView]. Own file for the usual gate reason: the
 * `androidx.media3.*` surface is stubbed per-service for kotlinc, and keeping
 * it out of the SDK-free files preserves their plain-JVM testability.
 *
 * `onStatusChange` surfaces the player's state as the SAME three-value
 * vocabulary the web `<video>` events and the SwiftUI `timeControlStatus`
 * observation map to (`waiting` / `playing` / `paused`) — the observable
 * status text is the device-test assertion surface. Rendered video FRAMES
 * are not assertable: the video draws on a surface layer `captureToImage`
 * cannot read (disclosed in the matrix row).
 *
 * ExoPlayer delivers listener callbacks on the application's main looper by
 * default, so an `onStatusChange` that writes Compose `MutableState` is
 * UI-thread-safe without a Handler (the ConnectivityManager lesson does not
 * recur here — but only because of that default; a custom-looper player
 * would need one).
 *
 * The example app must carry the media3 ARTIFACTS (exoplayer + ui) in its
 * gradle deps — the Coil lesson's dependency half: a conditional import
 * resolves against nothing without the artifact.
 */
@Composable
public fun PyreonVideoPlayer(
    url: String,
    autoPlay: Boolean = false,
    loop: Boolean = false,
    muted: Boolean = false,
    // `<Video controls>` had no parameter to land on, so the prop was typed and
    // documented on all three targets and honoured on none — the transport
    // chrome was hardcoded on below. Defaults to true, which is what it was.
    controls: Boolean = true,
    onStatusChange: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            volume = if (muted) 0f else 1f
            playWhenReady = autoPlay
            prepare()
        }
    }
    DisposableEffect(Unit) {
        val listener =
            object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    val status =
                        when {
                            isPlaying -> "playing"
                            player.playbackState == Player.STATE_BUFFERING -> "waiting"
                            else -> "paused"
                        }
                    onStatusChange?.invoke(status)
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_BUFFERING) {
                        onStatusChange?.invoke("waiting")
                    }
                }
            }
        player.addListener(listener)
        // Seed the initial state so the UI starts at "waiting" rather than
        // blank — the .initial KVO option's twin on the Swift side.
        onStatusChange?.invoke("waiting")
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                useController = controls
            }
        },
        modifier = modifier,
    )
}
