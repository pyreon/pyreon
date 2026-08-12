// PyreonGeolocation — the SwiftUI side of Pyreon's cross-platform location
// story (Tier 3). Mirrors a web `useGeolocation` reactive surface and the
// Kotlin `PyreonGeolocation` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive location container:
//
//     loc.latitude     // most recent latitude, nil until first fix
//     loc.longitude    // most recent longitude, nil until first fix
//     loc.accuracy     // horizontal accuracy in metres, nil until first fix
//     loc.isAuthorized // true once the user grants location permission
//     loc.error        // most recent failure, nil on success
//
// A SwiftUI view reads these and re-renders as the device moves / the
// permission flips — the native analogue of a web `useGeolocation().latitude`
// reactive read (the map-recentre, the "you are here" marker, the
// nearby-search-radius query).
//
// ## Two layers — pure state machine + real CoreLocation edge
//
// The reactive STATE machine (`update(latitude:longitude:accuracy:)` /
// `authorize(_:)` / `fail(_:)`) is pure and synchronously unit-testable:
// drive it directly, assert the reactive fields. It NEVER touches the
// `CLLocationManager` or the lifecycle flag — exactly the split
// `PyreonNetworkStatus` uses.
//
// The LIVE EDGE is a real `CLLocationManager` (CoreLocation — in the Swift
// toolchain, same "real edge" choice `NWPathMonitor` makes). `start()`
// requests authorization + begins updates via a `CLLocationManagerDelegate`
// that forwards fixes to `update` / failures to `fail` / authorization
// changes to `authorize` on the main actor; `stop()` ends updates. The
// CoreLocation wiring compiles under `swift build`; live GPS fixes flowing
// (which need a device, a user-granted permission prompt, and an
// Info.plist usage-description key) are **device-loop territory, NOT proven
// by the unit tests here** — the tests cover the pure state machine +
// lifecycle idempotency only, the same "manager constructed, not asserted"
// boundary `PyreonNetworkStatus` uses.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const loc = useGeolocation()` and emits a
// `PyreonGeolocation` instance whose `.task { }` calls `start()` on appear
// and `stop()` on disappear; `loc.latitude` reads in the component body
// become reads on this container. Until that lands (the per-service-port
// follow-up), this is usable by hand-written SwiftUI code.

import Foundation
import CoreLocation
import Observation

/// Observable location container — the SwiftUI half of `useGeolocation`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonGeolocation: NSObject, CLLocationManagerDelegate {
    /// Most recent latitude in degrees, or `nil` before the first fix.
    public private(set) var latitude: Double?
    /// Most recent longitude in degrees, or `nil` before the first fix.
    public private(set) var longitude: Double?
    /// Horizontal accuracy in metres for the most recent fix, or `nil`.
    public private(set) var accuracy: Double?
    /// True once the user has granted location permission (when-in-use or
    /// always). Read to gate a "locate me" button or a map overlay.
    public private(set) var isAuthorized: Bool = false
    /// Most recent failure, or `nil` on success / before first start.
    public private(set) var error: Error?

    /// The live location manager. Nil until `start()`; held so `stop()` can
    /// end updates. `@ObservationIgnored` — not reactive view state.
    @ObservationIgnored private var manager: CLLocationManager?

    /// Lifecycle flag — true iff a `start()` has been matched by no `stop()`
    /// yet. Mirrors `PyreonNetworkStatus._started`: guards `start` against
    /// double-start AND `stop` against double-stop.
    @ObservationIgnored private var _started: Bool = false

    public override init() {
        super.init()
    }

    /// True iff currently receiving location updates (between a matched
    /// `start` / `stop` pair). Cheap to read; not observable for re-render.
    public var isTracking: Bool { _started }

    // MARK: - Pure state-machine transitions
    //
    // The `CLLocationManagerDelegate` callbacks drive the container through
    // these on the main actor. They touch ONLY the reactive fields — never
    // the manager or the lifecycle flag — so they are synchronously
    // unit-testable by driving them directly (live GPS is device-only).

    /// Record a new fix: set `latitude` / `longitude` / `accuracy`, clear
    /// any prior `error`.
    public func update(latitude: Double, longitude: Double, accuracy: Double? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.error = nil
    }

    /// Record the authorization state (granted / denied).
    public func authorize(_ granted: Bool) {
        isAuthorized = granted
    }

    /// Record a failure: set `error`. Leaves any prior fix in place
    /// (stale-while-error), matching the other containers.
    public func fail(_ failure: Error) {
        error = failure
    }

    // MARK: - Live CoreLocation edge

    /// Request authorization + begin location updates. Idempotent — a second
    /// call while already tracking is a no-op. Wires a delegate that forwards
    /// fixes / failures / authorization changes to the pure transitions.
    public func start() {
        guard !_started else { return }
        _started = true
        let m = CLLocationManager()
        m.delegate = self
        m.requestWhenInUseAuthorization()
        m.startUpdatingLocation()
        manager = m
    }

    /// Stop location updates and release the manager. Safe to call when not
    /// started (no-op) AND safe to call twice (the second call early-returns
    /// on `_started == false`).
    public func stop() {
        guard _started else { return }
        _started = false
        manager?.stopUpdatingLocation()
        manager?.delegate = nil
        manager = nil
    }

    // MARK: - CLLocationManagerDelegate (live edge → main-actor transitions)

    public func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let loc = locations.last else { return }
        let lat = loc.coordinate.latitude
        let lon = loc.coordinate.longitude
        let acc = loc.horizontalAccuracy
        DispatchQueue.main.async { [weak self] in
            self?.update(latitude: lat, longitude: lon, accuracy: acc)
        }
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        DispatchQueue.main.async { [weak self] in self?.fail(error) }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        // `.authorizedWhenInUse` is iOS-only; macOS uses `.authorizedAlways`.
        // The package targets both, so the check is platform-conditional.
        let granted: Bool
        #if os(iOS)
        granted = status == .authorizedWhenInUse || status == .authorizedAlways
        #else
        granted = status == .authorizedAlways
        #endif
        DispatchQueue.main.async { [weak self] in self?.authorize(granted) }
    }
}
