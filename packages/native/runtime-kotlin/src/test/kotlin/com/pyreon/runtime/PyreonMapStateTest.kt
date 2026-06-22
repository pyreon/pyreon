// Smoke tests for PyreonMapState — the reactive map-state container.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonMapState`.
//
// PyreonMapState is PURE state (no platform edge), so this fully covers the
// container — no device caveat. The <Map> VIEW that binds to it is a
// separate compiler-emit follow-up.

package com.pyreon.runtime

fun testMapInitialState() {
    val map = PyreonMapState()
    check(map.camera.value == PyreonMapCamera(0.0, 0.0, 1.0)) { "default camera" }
    check(map.markers.value.isEmpty()) { "no markers initially" }
    check(map.selectedMarkerId.value == null) { "no selection initially" }
    check(map.selectedMarker == null) { "selectedMarker null initially" }
}

fun testMapInitialOverrides() {
    val map = PyreonMapState(
        camera = PyreonMapCamera(50.0, 14.0, 12.0),
        markers = listOf(PyreonMapMarker("a", 50.0, 14.0, "Home")),
    )
    check(map.camera.value.zoom == 12.0) { "initial camera honored" }
    check(map.markers.value.size == 1) { "initial markers honored" }
}

fun testMapMoveToKeepsZoom() {
    val map = PyreonMapState(camera = PyreonMapCamera(0.0, 0.0, 10.0))
    map.moveTo(50.0, 14.0)
    check(map.camera.value.latitude == 50.0) { "moveTo recenters lat" }
    check(map.camera.value.longitude == 14.0) { "moveTo recenters lon" }
    check(map.camera.value.zoom == 10.0) { "moveTo keeps zoom when omitted" }
    map.moveTo(1.0, 2.0, 5.0)
    check(map.camera.value.zoom == 5.0) { "moveTo re-zooms when supplied" }
}

fun testMapAddMarkerUpsert() {
    val map = PyreonMapState()
    map.addMarker(PyreonMapMarker("a", 1.0, 2.0, "first"))
    map.addMarker(PyreonMapMarker("b", 3.0, 4.0))
    check(map.markers.value.size == 2) { "two markers" }
    // upsert by id — replace "a", keep position
    map.addMarker(PyreonMapMarker("a", 9.0, 9.0, "updated"))
    check(map.markers.value.size == 2) { "upsert doesn't duplicate" }
    check(map.markers.value[0].id == "a" && map.markers.value[0].title == "updated") {
        "upsert replaces in place"
    }
    check(map.markers.value[1].id == "b") { "other marker keeps position" }
}

fun testMapSelection() {
    val map = PyreonMapState(markers = listOf(PyreonMapMarker("a", 1.0, 2.0, "A")))
    map.selectMarker("a")
    check(map.selectedMarkerId.value == "a") { "selectMarker sets id" }
    check(map.selectedMarker?.title == "A") { "selectedMarker resolves the record" }
    map.selectMarker(null)
    check(map.selectedMarker == null) { "clearing selection" }
}

fun testMapRemoveMarkerClearsSelection() {
    val map = PyreonMapState(markers = listOf(PyreonMapMarker("a", 1.0, 2.0)))
    map.selectMarker("a")
    check(map.selectedMarker != null) { "selected before remove" }
    map.removeMarker("a")
    check(map.markers.value.isEmpty()) { "marker removed" }
    check(map.selectedMarkerId.value == null) { "removing selected marker clears selection" }
}

fun testMapRemoveMarkerKeepsOtherSelection() {
    val map = PyreonMapState(
        markers = listOf(PyreonMapMarker("a", 1.0, 2.0), PyreonMapMarker("b", 3.0, 4.0)),
    )
    map.selectMarker("b")
    map.removeMarker("a") // removing a non-selected marker
    check(map.selectedMarkerId.value == "b") { "removing non-selected keeps selection" }
    check(map.markers.value.single().id == "b") { "only b remains" }
}

fun testMapSetMarkersReplaces() {
    val map = PyreonMapState(markers = listOf(PyreonMapMarker("a", 1.0, 2.0)))
    map.setMarkers(listOf(PyreonMapMarker("x", 5.0, 6.0), PyreonMapMarker("y", 7.0, 8.0)))
    check(map.markers.value.map { it.id } == listOf("x", "y")) { "setMarkers replaces wholesale" }
}

fun testMapReactiveFieldShapes() {
    val map = PyreonMapState()
    for (name in listOf("camera", "markers", "selectedMarkerId")) {
        val t = map::class.members.first { it.name == name }.returnType.toString()
        check(t.contains("MutableState")) { "$name MUST be a Compose MutableState. Actual: $t" }
    }
}

fun main() {
    testMapInitialState()
    testMapInitialOverrides()
    testMapMoveToKeepsZoom()
    testMapAddMarkerUpsert()
    testMapSelection()
    testMapRemoveMarkerClearsSelection()
    testMapRemoveMarkerKeepsOtherSelection()
    testMapSetMarkersReplaces()
    testMapReactiveFieldShapes()
    println("[PyreonMapStateTest] all smoke tests passed")
}
