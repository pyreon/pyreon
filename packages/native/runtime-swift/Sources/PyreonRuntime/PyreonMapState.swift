// PyreonMapState — the SwiftUI side of Pyreon's cross-platform map story
// (Tier 3). Mirrors a `useMap` reactive surface and the Kotlin
// `PyreonMapState` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive MAP-STATE container — the camera (center +
// zoom) + markers + selection a map UI binds to:
//
//     map.camera          // center latitude/longitude + zoom
//     map.markers         // the pins to render
//     map.selectedMarker  // the tapped pin, nil if none
//
// A SwiftUI `Map` (iOS 17 MapKit-SwiftUI) binds its camera position to
// `map.camera` and renders `Map(markers)`; tapping recenters via
// `map.moveTo(...)` and selects via `map.selectMarker(...)`. The container
// is the reactive STATE; the actual `<Map>` VIEW that renders it is a
// separate primitive (see scope note).
//
// ## Pure state — NO platform SDK edge (and scope)
//
// `PyreonMapState` is PURE reactive state (camera + markers + selection) with
// no live platform edge — so it is fully unit-testable on BOTH targets, no
// device caveat. **Scope note:** this PR ships the map STATE container only.
// The `<Map>` VIEW primitive (the SwiftUI `Map` / Compose `GoogleMap` that
// binds to this state and emits per-target) is a SEPARATE compiler-emit
// follow-up — a map view is a primitive, not a state container, and needs
// MapKit / the Google Maps SDK to actually render. This container is the
// reactive layer that view will bind to.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const map = useMap(...)` + a `<Map>` element and
// emits a `PyreonMapState` + the platform map view bound to it.

import Foundation
import Observation

/// A map pin — id + coordinate + optional title. Mirrors the Kotlin
/// `PyreonMapMarker`.
public struct PyreonMapMarker: Sendable, Equatable {
    public let id: String
    public let latitude: Double
    public let longitude: Double
    public let title: String?

    public init(id: String, latitude: Double, longitude: Double, title: String? = nil) {
        self.id = id
        self.latitude = latitude
        self.longitude = longitude
        self.title = title
    }
}

/// The map camera — center coordinate + zoom level. Mirrors the Kotlin
/// `PyreonMapCamera`.
public struct PyreonMapCamera: Sendable, Equatable {
    public let latitude: Double
    public let longitude: Double
    /// Zoom level (higher = closer). The `<Map>` view maps this to MapKit's
    /// span / Compose's zoom as needed.
    public let zoom: Double

    public init(latitude: Double, longitude: Double, zoom: Double) {
        self.latitude = latitude
        self.longitude = longitude
        self.zoom = zoom
    }
}

/// Observable map-state container — the SwiftUI half of `useMap`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonMapState {
    /// The camera (center + zoom). Bind a `Map`'s camera position to this.
    public private(set) var camera: PyreonMapCamera
    /// The markers to render.
    public private(set) var markers: [PyreonMapMarker]
    /// The selected marker id, or `nil` if none selected.
    public private(set) var selectedMarkerId: String?

    public init(
        camera: PyreonMapCamera = PyreonMapCamera(latitude: 0, longitude: 0, zoom: 1),
        markers: [PyreonMapMarker] = []
    ) {
        self.camera = camera
        self.markers = markers
    }

    /// The selected marker, or `nil`. Resolved from `selectedMarkerId`.
    public var selectedMarker: PyreonMapMarker? {
        guard let id = selectedMarkerId else { return nil }
        return markers.first { $0.id == id }
    }

    // MARK: - Camera

    /// Replace the camera.
    public func setCamera(_ camera: PyreonMapCamera) {
        self.camera = camera
    }

    /// Recenter (and optionally re-zoom) the camera. Keeps the current zoom
    /// when `zoom` is nil.
    public func moveTo(latitude: Double, longitude: Double, zoom: Double? = nil) {
        camera = PyreonMapCamera(
            latitude: latitude,
            longitude: longitude,
            zoom: zoom ?? camera.zoom
        )
    }

    // MARK: - Markers

    /// Replace all markers.
    public func setMarkers(_ markers: [PyreonMapMarker]) {
        self.markers = markers
    }

    /// Add a marker (upsert by id — replaces an existing marker with the
    /// same id, keeping its position in the list).
    public func addMarker(_ marker: PyreonMapMarker) {
        if let index = markers.firstIndex(where: { $0.id == marker.id }) {
            markers[index] = marker
        } else {
            markers.append(marker)
        }
    }

    /// Remove a marker by id. Clears the selection if it was selected.
    public func removeMarker(id: String) {
        markers.removeAll { $0.id == id }
        if selectedMarkerId == id { selectedMarkerId = nil }
    }

    // MARK: - Selection

    /// Select a marker by id (or clear with `nil`).
    public func selectMarker(_ id: String?) {
        selectedMarkerId = id
    }
}
