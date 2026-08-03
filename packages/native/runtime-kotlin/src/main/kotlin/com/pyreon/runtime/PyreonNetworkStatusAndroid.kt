package com.pyreon.runtime

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * The Android connectivity edge for `useOnline` — kept in its OWN file for the
 * same reason as [AndroidLocationSource]: `PyreonNetworkStatus.kt` must stay
 * free of `android.*` imports so it remains verifiable under the stub-only
 * `kotlinc` gate and runnable in the plain-JVM test suite. File placement here
 * is a gate decision, not a stylistic one.
 *
 * ## Why this exists
 *
 * `PyreonNetworkStatus` shipped as a pure state container whose `isOnline`
 * defaults to `true`, with a `start(register)` seam for the app to wire its own
 * `ConnectivityManager.NetworkCallback`. The comment in that file explains the
 * reasoning honestly — real monitoring needs `Context` + the Android SDK, which
 * the minimal kotlinc gate cannot provide — but the consequence was that
 * `useOnline()` on Android reported `true` forever, no matter the device state,
 * and nothing wired the seam.
 *
 * That is the same shape [rememberPyreonGeolocation] was added to fix: a
 * default that requires a step nobody takes is not a default, it is a hook that
 * silently reports nothing. Found by an offline-first device test that turned
 * the emulator's radios off and waited for `Online: false` — which never came.
 *
 * ## Contract
 *
 * Registers a real [ConnectivityManager.NetworkCallback] for the composable's
 * lifetime and unregisters it on leave, so nothing outlives the screen. An app
 * that wants different semantics (a captive-portal probe, a reachability ping)
 * still calls [PyreonNetworkStatus.start] with its own registrar; this is only
 * the DEFAULT.
 *
 * Requires `android.permission.ACCESS_NETWORK_STATE`, which is a normal
 * (install-time) permission — no runtime request. Without it the callback
 * registration throws, which is caught below and leaves the flag at its
 * optimistic default rather than crashing the app: a missing manifest entry
 * should degrade to "assume online", not take the screen down.
 */
@Composable
public fun rememberPyreonNetworkStatus(): PyreonNetworkStatus {
    val context = LocalContext.current
    // Seed from the CURRENT state rather than the optimistic default: a screen
    // opened while already offline must not render "online" until the first
    // callback happens to fire.
    val status = remember { PyreonNetworkStatus(isDeviceOnline(context)) }

    DisposableEffect(context) {
        val manager =
            context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
                as? ConnectivityManager
        if (manager == null) {
            onDispose {}
        } else {
            val callback =
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        status.update(true)
                    }

                    override fun onLost(network: Network) {
                        // `onLost` fires per-network, so another may still be
                        // up (wifi drops, cellular remains). Re-read the
                        // aggregate rather than assuming offline.
                        status.update(isDeviceOnline(context))
                    }

                    override fun onCapabilitiesChanged(
                        network: Network,
                        capabilities: NetworkCapabilities,
                    ) {
                        // A network can exist without being usable — the
                        // VALIDATED capability is what "online" means to a
                        // user, and it arrives here rather than in onAvailable.
                        status.update(
                            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
                        )
                    }
                }
            val registered =
                try {
                    manager.registerNetworkCallback(
                        NetworkRequest.Builder()
                            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            .build(),
                        callback,
                    )
                    true
                } catch (_: SecurityException) {
                    // ACCESS_NETWORK_STATE missing — degrade, do not crash.
                    false
                }
            onDispose { if (registered) runCatching { manager.unregisterNetworkCallback(callback) } }
        }
    }

    return status
}

/** Current aggregate connectivity, or `true` when it cannot be determined. */
private fun isDeviceOnline(context: Context): Boolean {
    val manager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
            as? ConnectivityManager ?: return true
    return try {
        val active = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(active) ?: return false
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } catch (_: SecurityException) {
        true
    }
}
