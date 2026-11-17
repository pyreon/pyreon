---
'@pyreon/hooks': patch
---

New `<MapView map={map} height={…}>`, the renderer for a `useMap()` state.

- **iOS:** a SwiftUI `Map` (MapKit, iOS 17, no API key) with one pin per marker. The selection is bound both ways.
- **Web:** an OpenStreetMap embed centred on the camera (no key), with the markers listed as buttons that select.
- **Android:** no renderer yet. The compiler names it and lowers it to an empty box of the same height.

Also fixed in the `useMap` lowering:
- `map.setCamera({ … })`, `map.addMarker({ … })` and `map.setMarkers([{ … }])` lowered their object literals to an anonymous synthesized struct instead of the runtime's `PyreonMapCamera` / `PyreonMapMarker`, so they compiled on neither target. The compiler gave no warning.
- On Android, `map.moveTo(lat, lng, 12)` passed the zoom as a `Long` to a `Double` parameter.
