package com.pyreon.runtime

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The Compose side of Pyreon's `<Audio>` primitive.
 *
 * This did not exist. `<Audio>` emits `PyreonAudioPlayer(url = …)` on Android,
 * and the ONLY definition of that name anywhere in the repo was the kotlinc
 * validation stub — so the emit compiled in the gate and referenced nothing in
 * the real runtime. Swift has had `PyreonAudioPlayer.swift` all along, so
 * `<Audio>` built on iOS and could not have built on Android. No example uses
 * `<Audio>`, which is why the device gate never said so: a superset stub
 * masking a missing runtime, exactly the direction that hides real breakage.
 *
 * Own file, `*Android.kt`, following the convention its siblings use
 * (`PyreonVideoPlayerAndroid`, `PyreonDatabaseAndroid`): `PyreonAudioPlayer.kt`
 * stays free of `androidx.*` so its state machine remains runnable on a plain
 * JVM, which is what makes `PyreonAudioState` testable at all.
 *
 * The host is a concrete zero-size [Box], not nothing — the same reason the
 * Swift twin uses `Color.clear.frame(0, 0)` rather than `EmptyView`: a modifier
 * on an empty node is silently inert, which is how a `<Modal>` sheet once
 * shipped that never presented. A caller's `modifier` (the test tag, the a11y
 * props) therefore has something real to attach to.
 *
 * Playback itself is delegated to the injected [AudioEngine], so the decision
 * of WHICH Media3 pipeline to use stays with the app. That mirrors the Swift
 * init, which also takes the engine.
 */
@Composable
public fun PyreonAudioPlayer(
    url: String,
    autoPlay: Boolean = false,
    loop: Boolean = false,
    muted: Boolean = false,
    volume: Double = 1.0,
    engine: AudioEngine,
    onStatusChange: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val state = remember(engine) { PyreonAudioState(engine) }
    // Keyed on `url` so a changed source restarts playback rather than leaving
    // the previous track running under a new prop value.
    DisposableEffect(url) {
        state.start(url, autoPlay, loop, muted, volume)
        onStatusChange?.invoke(state.status.value)
        onDispose {
            // Audio outliving its composable is the battery-and-confusion shape
            // of a leak: the sound keeps playing over a screen that is gone.
            // The Swift twin stops on `onDisappear` for the same reason.
            state.stop()
            onStatusChange?.invoke(state.status.value)
        }
    }
    Box(modifier = modifier.size(0.dp))
}
