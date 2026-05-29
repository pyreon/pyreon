// PyreonNetworkStatus — the Compose side of Pyreon's cross-platform
// online/offline story (Phase 4). Mirrors the core `@pyreon/hooks` `useOnline`
// surface and the Swift `PyreonNetworkStatus` one-for-one.
//
// ## What this delivers
//
// A reactive connectivity flag (Compose `MutableState`, read `.value`):
//
//     net.isOnline.value   // true while the device has network connectivity
//
// A Composable gating UI on `net.isOnline.value` (an offline banner, a
// disabled "Sync" button) recomposes when connectivity flips — the Compose
// analogue of the web `useOnline()` reactive boolean signal.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
//   Swift                              | Kotlin
//   -----------------------------------+----------------------------------
//   net.isOnline            (@Observable) | net.isOnline.value  (MutableState)
//   net.update(_:)                        | net.update(isOnline)
//   net.start() / net.stop()              | net.start(...) / net.stop()   (see status)
//
// ## Implementation status — reactive state ships; live monitor deferred
//
// **The connectivity STATE machine ships and is unit-testable** (`isOnline`
// + `update`). The LIVE monitoring edge differs per platform's toolchain
// availability — the SAME asymmetry PyreonStorage documents (Swift uses real
// UserDefaults; Kotlin's real DataStore backend is deferred to Android CI):
//
// - **Swift** uses `NWPathMonitor` (Apple's `Network` framework is in the
//   Swift toolchain) for real `start()` / `stop()` monitoring.
// - **Kotlin** real monitoring needs `android.net.ConnectivityManager` +
//   a `Context`, which the minimal `kotlinc`-against-Compose-stubs gate in
//   @pyreon/native-compiler CAN'T provide. So `start(onChange)` here takes
//   the platform callback the APP wires (its `ConnectivityManager.NetworkCallback`
//   forwards to `update`), keeping this file Android-SDK-free + kotlinc-stub
//   compatible. A `ConnectivityManager`-backed convenience overload is a
//   Phase-2+ follow-up that needs Android CI to verify end-to-end.
//
// The pure container is enough to unit-test the state machine, validate the
// kotlinc surface, and back the `useOnline` compiler emit (a follow-up — the
// PyreonFetch / PyreonForm / PyreonPermissions per-service-port pattern).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Reactive connectivity flag — the Compose half of `useOnline`.
 * Exposes [isOnline] as Compose `MutableState` (read `.value`).
 */
public class PyreonNetworkStatus(isOnline: Boolean = true) {
    /** True while the device has network connectivity. Read `.value` in a
     * Composable to gate UI; recomposes on every flip. */
    public val isOnline: MutableState<Boolean> = mutableStateOf(isOnline)

    /** Set the connectivity flag. Called by the platform network callback the
     * app wires via [start], and directly in tests. */
    public fun update(isOnline: Boolean) {
        this.isOnline.value = isOnline
    }

    /**
     * Begin live monitoring. The app supplies a [register] that wires its
     * platform `ConnectivityManager.NetworkCallback` (or any source) to push
     * connectivity changes, and returns an unregister thunk stored for [stop].
     * Keeping the platform source injected keeps this file Android-SDK-free
     * (kotlinc-stub compatible); a `ConnectivityManager` convenience overload
     * is a Phase-2+ Android-CI follow-up.
     */
    public fun start(register: ((Boolean) -> Unit) -> (() -> Unit)) {
        if (unregister != null) return // idempotent — already monitoring
        unregister = register { online -> update(online) }
    }

    /** Stop live monitoring and release the platform callback. No-op when not
     * started. */
    public fun stop() {
        unregister?.invoke()
        unregister = null
    }

    private var unregister: (() -> Unit)? = null
}
