package com.pyreon.runtime

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import android.os.Looper
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
            val handler = Handler(Looper.getMainLooper())
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
                    // The HANDLER overload is load-bearing, not a nicety:
                    // without it ConnectivityManager delivers callbacks on a
                    // binder/handler thread, and each `status.update(...)` is
                    // then a Compose MutableState WRITE off the main thread —
                    // which crashed router-demo's instrumented 10k-row test
                    // with "Detected multithreaded access to
                    // SnapshotStateObserver" the moment the emulator delivered
                    // a connectivity event mid-layout. Pinning delivery to the
                    // main looper makes every write UI-thread, same as the
                    // recomposition that reads it.
                    manager.registerNetworkCallback(
                        NetworkRequest.Builder()
                            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            .build(),
                        callback,
                        handler,
                    )
                    true
                } catch (_: SecurityException) {
                    // ACCESS_NETWORK_STATE missing — degrade, do not crash.
                    false
                }
            // RECONCILIATION FLOOR — the callback stream is the fast path, not
            // the only path. ConnectivityManager callback DELIVERY can go
            // silent while the queryable state is correct: captured twice on
            // CI (2026-08-04, API-33 emulator, runs 30894374690/30901780222)
            // — `activeNetwork` was null and a poll-read said offline, yet no
            // onLost/onCapabilitiesChanged arrived for 45+ seconds, so the
            // flag stayed at its seed forever. A connectivity flag that can be
            // wrong FOREVER after one dropped callback is a worse contract
            // than one that is at most RECONCILE_MS stale, and emulator/OEM
            // delivery quirks are a documented reality. The re-read is one
            // binder call every few seconds, only while a composable using the
            // hook is mounted; an equal-value `update` is a no-op recompose
            // (MutableState structural equality), so the steady state costs
            // nothing downstream. Callbacks still deliver sub-second flips.
            val reconcile = object : Runnable {
                override fun run() {
                    status.update(isDeviceOnline(context))
                    handler.postDelayed(this, RECONCILE_MS)
                }
            }
            handler.postDelayed(reconcile, RECONCILE_MS)
            onDispose {
                handler.removeCallbacks(reconcile)
                if (registered) runCatching { manager.unregisterNetworkCallback(callback) }
            }
        }
    }

    return status
}

/** Staleness ceiling for the reconciliation re-read. 3s is fast enough that a
 * user watching an offline banner sees it flip "immediately", and slow enough
 * that the cost is one binder read per few seconds per mounted hook. */
private const val RECONCILE_MS: Long = 3_000

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
