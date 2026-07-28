// PyreonGeolocation — the Compose side of Pyreon's cross-platform location
// story (Tier 3). Mirrors a web `useGeolocation` reactive surface and the
// Swift `PyreonGeolocation` one-for-one.
//
// ## What this delivers
//
// Reactive location state (Compose `MutableState`, read `.value`):
//
//     loc.latitude.value     // most recent latitude, null until first fix
//     loc.longitude.value    // most recent longitude, null until first fix
//     loc.accuracy.value     // horizontal accuracy in metres, null until first
//     loc.isAuthorized.value // true once the user grants location permission
//     loc.error.value        // most recent failure, null on success
//
// A Composable reading these recomposes as the device moves / the permission
// flips — the Compose analogue of a web `useGeolocation().latitude` read.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
//   Swift                                   | Kotlin
//   ----------------------------------------+----------------------------------
//   loc.latitude            (@Observable)   | loc.latitude.value  (MutableState)
//   loc.update(lat,lon,acc)                 | loc.update(lat, lon, accuracy)
//   loc.authorize(_) / loc.fail(_)          | loc.authorize(granted) / loc.fail(e)
//   loc.start() (real CLLocationManager)    | loc.start(register) (injected)
//   loc.stop()                              | loc.stop()
//
// ## Implementation status — reactive state ships; live source injected
//
// The SAME asymmetry `PyreonNetworkStatus` / `PyreonWebSocket` document:
//
// - **Swift** uses a real `CLLocationManager` (CoreLocation is in the Swift
//   toolchain) for `start()` / `stop()`.
// - **Kotlin** real location needs Google Play Services
//   `FusedLocationProviderClient` (or `android.location.LocationManager`) +
//   a `Context` + the `ACCESS_FINE_LOCATION` runtime permission — an
//   Android-SDK dependency the minimal `kotlinc`-against-Compose-stubs gate
//   CAN'T provide. So `start(register)` here takes the platform location
//   source the APP wires: its `FusedLocationProviderClient` callback forwards
//   fixes to [update] / failures to [fail] / permission changes to
//   [authorize], and returns an unregister thunk stored for [stop]. This
//   keeps the file Android-SDK-free + kotlinc-stub compatible. A
//   `FusedLocationProviderClient`-backed convenience overload is a Phase-2+
//   Android-CI follow-up.
//
// The pure container is enough to unit-test the state machine, validate the
// kotlinc surface, and back the `useGeolocation` compiler emit (a follow-up
// — the PyreonFetch / PyreonNetworkStatus per-service-port pattern).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * The callbacks the app's platform location source forwards events to.
 * Supplied to the app's `register` by [PyreonGeolocation.start]; each
 * forwards to the matching pure state-machine transition.
 */
/**
 * A platform location source: wire it to [GeolocationHandlers] and return an
 * unregister thunk.
 *
 * Exists so the 0-arg [PyreonGeolocation.start] can work without dragging the
 * Android SDK into this file — the constraint that made `start` take a host
 * closure in the first place, and therefore the reason `geo.start()` compiled
 * on iOS and web but NOT on Android. Same shape as `PyreonStorageBackend`.
 */
public fun interface PyreonGeolocationSource {
    /** Wire [handlers] to the platform source; return the unregister thunk. */
    public fun register(handlers: GeolocationHandlers): () -> Unit
}

/**
 * Process-wide default location source, or `null` when none is installed.
 *
 * Starts null so this file stays Android-SDK-free and kotlinc-stub verifiable.
 * `PyreonGeolocationAndroid.installDefaultGeolocationSource(context)` installs
 * a real one; an app wanting something else (a mock in tests, a fused provider,
 * a simulator feed) assigns this directly.
 */
public object PyreonGeolocationRegistry {
    public var source: PyreonGeolocationSource? = null
}

/**
 * Install [make]'s source as the process default — but ONLY if the app has not
 * chosen one.
 *
 * The guard is the contract, exactly as with `installDefaultStorageBackend`: an
 * app that assigned [PyreonGeolocationRegistry.source] deliberately must not be
 * silently overwritten by a framework default.
 */
public fun installDefaultGeolocationSource(make: () -> PyreonGeolocationSource) {
    if (PyreonGeolocationRegistry.source == null) {
        PyreonGeolocationRegistry.source = make()
    }
}

public class GeolocationHandlers(
    /** Call with each fix → drives [PyreonGeolocation.update]. */
    public val onFix: (latitude: Double, longitude: Double, accuracy: Double?) -> Unit,
    /** Call on permission change → drives [PyreonGeolocation.authorize]. */
    public val onAuthorization: (granted: Boolean) -> Unit,
    /** Call on failure → drives [PyreonGeolocation.fail]. */
    public val onError: (Throwable) -> Unit,
)

/**
 * Reactive location container — the Compose half of `useGeolocation`.
 * Exposes [latitude] / [longitude] / [accuracy] / [isAuthorized] / [error]
 * as Compose `MutableState` (read `.value`).
 */
public class PyreonGeolocation {
    /** Most recent latitude in degrees, or null before the first fix. */
    public val latitude: MutableState<Double?> = mutableStateOf(null)

    /** Most recent longitude in degrees, or null before the first fix. */
    public val longitude: MutableState<Double?> = mutableStateOf(null)

    /** Horizontal accuracy in metres for the most recent fix, or null. */
    public val accuracy: MutableState<Double?> = mutableStateOf(null)

    /** True once the user has granted location permission. */
    public val isAuthorized: MutableState<Boolean> = mutableStateOf(false)

    /** Most recent failure, or null on success / before first start. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    // MARK: - Pure state-machine transitions

    /** Record a new fix: set [latitude] / [longitude] / [accuracy], clear
     * any prior [error]. */
    public fun update(latitude: Double, longitude: Double, accuracy: Double? = null) {
        this.latitude.value = latitude
        this.longitude.value = longitude
        this.accuracy.value = accuracy
        this.error.value = null
    }

    /** Record the authorization state (granted / denied). */
    public fun authorize(granted: Boolean) {
        isAuthorized.value = granted
    }

    /** Record a failure: set [error]. Leaves any prior fix in place
     * (stale-while-error). */
    public fun fail(failure: Throwable) {
        error.value = failure
    }

    // MARK: - Injected location-source edge

    /**
     * Begin location updates via the app-supplied [register]. The app wires
     * its platform source (FusedLocationProviderClient, etc.) to forward
     * events to the [GeolocationHandlers] thunks (which drive the pure
     * transitions), and returns an unregister thunk stored for [stop].
     * Keeping the source injected keeps this file Android-SDK-free
     * (kotlinc-stub compatible); a FusedLocationProviderClient convenience
     * overload is a Phase-2+ Android-CI follow-up.
     *
     * Idempotent — a second call while already tracking is a no-op; the
     * supplied [register] is NOT invoked a second time.
     */
    /**
     * Begin location updates using the installed default source.
     *
     * This is the overload PMTC emits: `geo.start()` on all three targets.
     * Before it existed, Swift's `start()` was 0-arg while Kotlin's required a
     * host closure, so the SAME source compiled on iOS and web and failed to
     * build on Android — a silent break in the shared-code contract, and the
     * documented "OkHttp-for-WebSocket asymmetry".
     *
     * With no source installed this FAILS LOUDLY via [fail] rather than
     * no-oping. A silent no-op would leave `latitude` null forever with no
     * explanation — indistinguishable from "no fix yet", which is the harder
     * bug to diagnose. The error names the wiring call so it is actionable.
     */
    public fun start() {
        val source = PyreonGeolocationRegistry.source
        if (source == null) {
            fail(
                IllegalStateException(
                    "[Pyreon] useGeolocation: no location source installed on Android. " +
                        "Call installDefaultGeolocationSource(context) from your Application " +
                        "or Activity, or assign PyreonGeolocationRegistry.source directly. " +
                        "iOS and web need no wiring.",
                ),
            )
            return
        }
        start(source::register)
    }

    public fun start(register: (GeolocationHandlers) -> (() -> Unit)) {
        if (started) return // idempotent — already tracking
        started = true
        unregister = register(
            GeolocationHandlers(
                onFix = { lat, lon, acc -> update(lat, lon, acc) },
                onAuthorization = { granted -> authorize(granted) },
                onError = { failed -> fail(failed) },
            ),
        )
    }

    /** Stop location updates and release the platform source. Safe to call
     * when not started (no-op) AND safe to call twice — the second call
     * early-returns on [started] without re-invoking the (possibly already-
     * released) unregister thunk. */
    public fun stop() {
        if (!started) return
        started = false
        unregister?.invoke()
        unregister = null
    }

    /** True iff currently receiving location updates (between a matched
     * [start] / [stop] pair). Cheap to read; not Compose-reactive. */
    public val isTracking: Boolean get() = started

    /** Lifecycle flag — true iff a [start] has been matched by no [stop]
     * yet. Guards against double-start AND double-stop. */
    private var started: Boolean = false
    private var unregister: (() -> Unit)? = null
}
