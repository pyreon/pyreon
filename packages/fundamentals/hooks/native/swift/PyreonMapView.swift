// PyreonMapView — the iOS renderer for `<MapView map={map}>` from
// @pyreon/hooks (MAP-2): a SwiftUI `Map` (MapKit, iOS 17) bound to a
// `PyreonMapState`. No API key: MapKit is part of the OS.
//
// - CAMERA: the map follows `state.camera` (a `moveTo` / `setCamera` recentres
//   it). A pan by the user does not write back — the state's camera is what
//   the code set, matching the web, where the embed is not interactive state.
// - MARKERS: one `Marker` per `state.markers` entry, tagged with its id.
// - SELECTION: two-way. Tapping a marker sets `state.selectedMarkerId`; a
//   `selectMarker` from code selects it on the map.
//
// Zoom follows the web-map convention the state uses (higher = closer):
// the visible span is 360° of longitude at zoom 0, halving per level.

#if canImport(SwiftUI) && canImport(MapKit)
import MapKit
import SwiftUI

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonMapView: View {
    private let state: PyreonMapState
    @State private var position: MapCameraPosition

    public init(state: PyreonMapState) {
        self.state = state
        _position = State(initialValue: .region(PyreonMapView.region(for: state.camera)))
    }

    /// The MapKit region the state's camera describes.
    static func region(for camera: PyreonMapCamera) -> MKCoordinateRegion {
        let span = 360.0 / pow(2.0, max(0, min(camera.zoom, 19)))
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: camera.latitude, longitude: camera.longitude),
            span: MKCoordinateSpan(latitudeDelta: span / 2, longitudeDelta: span))
    }

    public var body: some View {
        let selection = Binding<String?>(
            get: { state.selectedMarkerId },
            set: { state.selectMarker($0) })
        Map(position: $position, selection: selection) {
            ForEach(state.markers, id: \.id) { marker in
                Marker(
                    marker.title ?? marker.id,
                    coordinate: CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude)
                )
                .tag(marker.id)
            }
        }
        .onChange(of: state.camera) { _, camera in
            position = .region(PyreonMapView.region(for: camera))
        }
    }
}
#endif
