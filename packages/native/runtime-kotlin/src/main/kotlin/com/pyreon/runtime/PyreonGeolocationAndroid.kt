package com.pyreon.runtime

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper

/**
 * Android location source — kept in its OWN file on purpose.
 *
 * `PyreonGeolocation.kt` must stay free of `android.*` imports so it remains
 * verifiable under the stub-only `kotlinc` gate and runnable in the plain-JVM
 * test suite (`run-kotlin-tests.ts` EXECUTES only modules importing no
 * `androidx.*` / `android.*` / `kotlinx.*`). Putting the SDK-dependent half
 * here is the same split already used by `PyreonDatabaseAndroid` and
 * `PyreonStorageAndroid` — and file placement is a gate decision, not a
 * stylistic one: folding this into the core file would silently drop the whole
 * class out of the executing test set.
 *
 * Uses the platform `LocationManager` rather than Play Services'
 * `FusedLocationProviderClient`: fused lives in a separate Google dependency
 * this runtime does not take, and taking it would force it on every consumer.
 * Fused is a better provider on devices that have it, so an app wanting it
 * assigns `PyreonGeolocationRegistry.source` with its own implementation —
 * which is exactly what the seam is for.
 */

/**
 * A [PyreonGeolocationSource] backed by the platform [LocationManager].
 *
 * @param context any Context; `applicationContext` is used internally so a
 *   destroyed Activity is never retained by a running location watch.
 * @param minTimeMs minimum interval between fixes.
 * @param minDistanceM minimum movement between fixes.
 */
public class AndroidLocationSource(
    context: Context,
    private val minTimeMs: Long = 1_000L,
    private val minDistanceM: Float = 0f,
) : PyreonGeolocationSource {
    // applicationContext, NOT the passed Context: a location watch outlives a
    // rotation, and holding the Activity would leak it for the watch's life.
    private val appContext: Context = context.applicationContext

    override fun register(handlers: GeolocationHandlers): () -> Unit {
        val manager = appContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (manager == null) {
            handlers.onError(IllegalStateException("[Pyreon] LOCATION_SERVICE unavailable"))
            return {}
        }

        // Report the permission state through the SAME channel a denial takes,
        // so an app that forgot the manifest entry sees an actionable error
        // instead of a watch that never produces a fix.
        val granted =
            appContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
                appContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
        handlers.onAuthorization(granted)
        if (!granted) {
            handlers.onError(
                SecurityException(
                    "[Pyreon] useGeolocation: ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION " +
                        "not granted. Declare it in AndroidManifest.xml and request it at runtime.",
                ),
            )
            return {}
        }

        val listener =
            object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    handlers.onFix(
                        location.latitude,
                        location.longitude,
                        // hasAccuracy() guards the sentinel 0.0 the platform
                        // returns when accuracy is unknown — reporting that as
                        // a real 0-metre accuracy would be a lie.
                        if (location.hasAccuracy()) location.accuracy.toDouble() else null,
                    )
                }

                // Deprecated on API 29+ but still ABSTRACT on older platforms;
                // omitting it breaks the build below minSdk 29.
                @Deprecated("Deprecated in API 29", ReplaceWith(""))
                override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {
                    // No-op: status is folded into the fix / error channels.
                }

                override fun onProviderDisabled(provider: String) {
                    handlers.onError(IllegalStateException("[Pyreon] location provider disabled: $provider"))
                }

                override fun onProviderEnabled(provider: String) {
                    // Nothing to report; the next fix arrives through onLocationChanged.
                }
            }

        val provider =
            when {
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
        if (provider == null) {
            handlers.onError(IllegalStateException("[Pyreon] no location provider enabled"))
            return {}
        }

        try {
            manager.requestLocationUpdates(
                provider,
                minTimeMs,
                minDistanceM,
                listener,
                Looper.getMainLooper(),
            )
        } catch (e: SecurityException) {
            // Permission can be revoked between the check above and this call.
            handlers.onError(e)
            return {}
        }

        return { manager.removeUpdates(listener) }
    }
}

/**
 * Install the platform location source as the process default, unless the app
 * already chose one.
 *
 * Call once from `Application.onCreate` or your Activity. iOS and web need no
 * equivalent — their sources are built in — which is precisely the asymmetry
 * the 0-arg `start()` exists to close.
 */
public fun installDefaultGeolocationSource(context: Context) {
    installDefaultGeolocationSource { AndroidLocationSource(context) }
}
