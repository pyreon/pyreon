package com.pyreon.runtime

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

/**
 * The Android lifecycle edge for `useAppState` — own file for the usual gate
 * reason (`PyreonAppState.kt` stays `android(x.lifecycle)`-free so it remains
 * verifiable under the Compose-only kotlinc stubs and runnable in plain JVM).
 *
 * ## Why this exists
 *
 * `PyreonAppState` shipped as a pure state container with a
 * `start(register)` seam the app was expected to wire — and nothing wired it,
 * so `useAppState()` on Android reported its initial "active" forever. The
 * THIRD member of the never-wired class (`useOnline`'s NWPathMonitor,
 * `usePush`'s notification-center delegate), found by pattern-hunting the
 * remaining `start(register)` seams.
 *
 * ## Contract
 *
 * Observes the hosting Activity's lifecycle via a [LifecycleEventObserver]
 * for the composable's lifetime: ON_RESUME → "active", ON_PAUSE →
 * "inactive", ON_STOP → "background". In the single-Activity apps PMTC
 * scaffolds, the Activity lifecycle IS the app lifecycle for these
 * transitions — stated rather than implied; a multi-Activity app that needs
 * process-level semantics wires `start(register)` with ProcessLifecycleOwner
 * itself (that needs the lifecycle-process artifact this runtime does not
 * impose).
 *
 * The lifecycle owner is the composition's [LocalContext] — the hosting
 * ComponentActivity, which implements [LifecycleOwner]. That avoids
 * `LocalLifecycleOwner`, whose PACKAGE moved between compose-ui 1.6 and 1.7
 * (ui → lifecycle-runtime-compose), an import that would pin the runtime to
 * one side of that move. A context that is not a LifecycleOwner degrades to
 * the inert container rather than crashing — the established edge shape.
 *
 * Lifecycle callbacks are delivered on the main thread, so the Compose
 * `MutableState` writes in `update(...)` are UI-thread-safe by construction.
 */
@Composable
public fun rememberPyreonAppState(): PyreonAppState {
    val context = LocalContext.current
    val state = remember { PyreonAppState() }

    DisposableEffect(context) {
        val owner = context as? LifecycleOwner
        if (owner == null) {
            onDispose {}
        } else {
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> state.update("active")
                    Lifecycle.Event.ON_PAUSE -> state.update("inactive")
                    Lifecycle.Event.ON_STOP -> state.update("background")
                    else -> {}
                }
            }
            owner.lifecycle.addObserver(observer)
            onDispose { owner.lifecycle.removeObserver(observer) }
        }
    }
    return state
}
