// useMap — map camera + markers + selection, shared across web / iOS / Android.
//
// The native half already existed on both targets: PMTC lowers `useMap()` to
// `PyreonMapState`. The WEB half did not exist — no implementation, no export,
// no type anywhere outside `packages/native/`. Same gap as `useGeolocation`,
// `useDatabase` and `useWebSocket`: PMTC matches hook NAMES and never resolves
// imports, so `import { useMap } from '@pyreon/hooks'` compiled for two targets
// and was unresolvable on the third. The compiler's own
// `lowered-hooks-typecheck` fixture already writes that import.
//
// THIS IS STATE, NOT A RENDERER — and deliberately so. `PyreonMapState` holds a
// camera, a marker list and a selection, and nothing else; the actual drawing
// is MapKit on iOS and the Maps SDK on Android. The web half mirrors that
// exactly, so it needs no mapping library and imposes no choice of one. Feed
// `map.camera` / `map.markers` to Leaflet, MapLibre, Google Maps or an <svg> —
// the component body that reads them is identical on all three targets.
//
// Semantics are copied from the native container, including the parts that are
// easy to get subtly wrong and are locked by tests:
//   - `addMarker` UPSERTS by id and keeps the existing list position.
//   - `removeMarker` clears the selection if the removed marker was selected.
//   - `moveTo` keeps the CURRENT zoom when `zoom` is omitted.
//   - `selectedMarker` is DERIVED from `selectedMarkerId`, never stored.
//
// There is deliberately NO `error` field. Neither `PyreonMapState.swift` nor
// `PyreonMapState.kt` has one — the container performs no I/O and cannot fail —
// so adding one on web only would be a field that exists on exactly one target.

import { batch, signal } from '@pyreon/reactivity'

/** One map marker. Mirrors the native `PyreonMapMarker`. */
export interface PyreonMapMarker {
  readonly id: string
  readonly latitude: number
  readonly longitude: number
  /** Optional label. `String?` natively. */
  readonly title?: string
}

/** Camera position. Mirrors the native `PyreonMapCamera`. */
export interface PyreonMapCamera {
  readonly latitude: number
  readonly longitude: number
  /** Higher = closer, matching the native container. */
  readonly zoom: number
}

/** Map state handle. Mirrors the native `PyreonMapState`. */
export interface UseMapResult {
  readonly camera: PyreonMapCamera
  readonly markers: PyreonMapMarker[]
  readonly selectedMarkerId: string | null
  /** Derived from `selectedMarkerId`; `null` when nothing is selected. */
  readonly selectedMarker: PyreonMapMarker | null
  setCamera(camera: PyreonMapCamera): void
  /** Recenter, keeping the current zoom when `zoom` is omitted. */
  moveTo(latitude: number, longitude: number, zoom?: number): void
  setMarkers(markers: PyreonMapMarker[]): void
  /** Upsert by id, preserving list position. */
  addMarker(marker: PyreonMapMarker): void
  /** Remove by id; clears the selection when it pointed at this marker. */
  removeMarker(id: string): void
  /** Select by id, or clear with `null`. */
  selectMarker(id: string | null): void
}

/** Initial state. Defaults match the native initialiser exactly. */
export interface UseMapOptions {
  readonly camera?: PyreonMapCamera
  readonly markers?: PyreonMapMarker[]
}

const DEFAULT_CAMERA: PyreonMapCamera = { latitude: 0, longitude: 0, zoom: 1 }

export function useMap(options: UseMapOptions = {}): UseMapResult {
  const camera = signal<PyreonMapCamera>(options.camera ?? DEFAULT_CAMERA)
  const markers = signal<PyreonMapMarker[]>(options.markers ?? [])
  const selectedMarkerId = signal<string | null>(null)

  return {
    // Getters, not values: a component body runs ONCE, so returning resolved
    // values here would freeze every field at its mount value. The native
    // @Observable / MutableState fields do not behave that way.
    get camera() {
      return camera()
    },
    get markers() {
      return markers()
    },
    get selectedMarkerId() {
      return selectedMarkerId()
    },
    get selectedMarker() {
      const id = selectedMarkerId()
      if (id === null) return null
      return markers().find((m) => m.id === id) ?? null
    },
    setCamera(next) {
      camera.set(next)
    },
    moveTo(latitude, longitude, zoom) {
      // `zoom ?? camera.zoom` — NOT a truthiness check. Zoom 0 is a legal
      // value, and `||` would silently replace it with the previous zoom.
      camera.set({ latitude, longitude, zoom: zoom ?? camera.peek().zoom })
    },
    setMarkers(next) {
      markers.set(next)
    },
    addMarker(marker) {
      const current = markers.peek()
      const at = current.findIndex((m) => m.id === marker.id)
      if (at < 0) {
        markers.set([...current, marker])
        return
      }
      // Upsert in place. Appending instead would move the marker to the end of
      // the list, which reorders however the app renders them.
      const next = [...current]
      next[at] = marker
      markers.set(next)
    },
    removeMarker(id) {
      batch(() => {
        markers.set(markers.peek().filter((m) => m.id !== id))
        // A selection pointing at a removed marker would leave
        // `selectedMarker` resolving to null while `selectedMarkerId` still
        // reported an id — the two would disagree.
        if (selectedMarkerId.peek() === id) selectedMarkerId.set(null)
      })
    },
    selectMarker(id) {
      selectedMarkerId.set(id)
    },
  }
}
