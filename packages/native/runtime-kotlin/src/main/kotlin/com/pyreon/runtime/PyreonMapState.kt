// PyreonMapState — the Compose side of Pyreon's cross-platform map story
// (Tier 3). Mirrors a `useMap` reactive surface and the Swift `PyreonMapState`
// one-for-one.
//
// ## What this delivers
//
// A reactive MAP-STATE container (Compose `MutableState`, read `.value`) — the
// camera (center + zoom) + markers + selection a map UI binds to:
//
//     map.camera.value         // center latitude/longitude + zoom
//     map.markers.value        // the pins to render
//     map.selectedMarker       // the tapped pin, null if none
//
// A Compose `GoogleMap` binds its camera to `map.camera.value` and renders
// markers; tapping recenters via `map.moveTo(...)` + selects via
// `map.selectMarker(...)`.
//
// ## Pure state — NO platform SDK edge (and scope)
//
// `PyreonMapState` is PURE reactive state — fully unit-testable on BOTH
// targets, no device caveat. **Scope note:** this ships the map STATE
// container only. The `<Map>` VIEW primitive (Compose `GoogleMap` / SwiftUI
// `Map` that binds to this state and emits per-target) is a SEPARATE
// compiler-emit follow-up — a map view is a primitive, not a state container,
// and needs the Google Maps SDK / MapKit to render. This container is the
// reactive layer that view binds to.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const map = useMap(...)` + a `<Map>` element and
// emits a `PyreonMapState` + the platform map view bound to it.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** A map pin — id + coordinate + optional title. Mirrors the Swift
 * `PyreonMapMarker`. */
public data class PyreonMapMarker(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val title: String? = null,
)

/** The map camera — center coordinate + zoom level. Mirrors the Swift
 * `PyreonMapCamera`. */
public data class PyreonMapCamera(
    val latitude: Double,
    val longitude: Double,
    /** Zoom level (higher = closer). */
    val zoom: Double,
)

/**
 * Reactive map-state container — the Compose half of `useMap`. Exposes
 * [camera] / [markers] / [selectedMarkerId] as Compose `MutableState`
 * (read `.value`).
 */
public class PyreonMapState(
    camera: PyreonMapCamera = PyreonMapCamera(0.0, 0.0, 1.0),
    markers: List<PyreonMapMarker> = emptyList(),
) {
    /** The camera (center + zoom). Bind a map's camera to this. */
    public val camera: MutableState<PyreonMapCamera> = mutableStateOf(camera)

    /** The markers to render. */
    public val markers: MutableState<List<PyreonMapMarker>> = mutableStateOf(markers)

    /** The selected marker id, or null if none. */
    public val selectedMarkerId: MutableState<String?> = mutableStateOf(null)

    /** The selected marker, or null. Resolved from [selectedMarkerId]. */
    public val selectedMarker: PyreonMapMarker?
        get() = selectedMarkerId.value?.let { id -> markers.value.firstOrNull { it.id == id } }

    // MARK: - Camera

    /** Replace the camera. */
    public fun setCamera(camera: PyreonMapCamera) {
        this.camera.value = camera
    }

    /** Recenter (and optionally re-zoom). Keeps the current zoom when [zoom]
     * is null. */
    public fun moveTo(latitude: Double, longitude: Double, zoom: Double? = null) {
        camera.value = PyreonMapCamera(latitude, longitude, zoom ?: camera.value.zoom)
    }

    // MARK: - Markers

    /** Replace all markers. */
    public fun setMarkers(markers: List<PyreonMapMarker>) {
        this.markers.value = markers
    }

    /** Add a marker (upsert by id — replaces an existing marker with the same
     * id, keeping its position). */
    public fun addMarker(marker: PyreonMapMarker) {
        val current = markers.value
        val index = current.indexOfFirst { it.id == marker.id }
        markers.value = if (index >= 0) {
            current.toMutableList().also { it[index] = marker }
        } else {
            current + marker
        }
    }

    /** Remove a marker by id. Clears the selection if it was selected. */
    public fun removeMarker(id: String) {
        markers.value = markers.value.filterNot { it.id == id }
        if (selectedMarkerId.value == id) selectedMarkerId.value = null
    }

    // MARK: - Selection

    /** Select a marker by id (or clear with null). */
    public fun selectMarker(id: String?) {
        selectedMarkerId.value = id
    }
}
