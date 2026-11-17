// MapView — a map that SHOWS a `useMap()` state: the camera and the markers,
// with the selection bound both ways. The state is the shared part (see
// useMap.ts); this is the renderer, one per target:
//
// - iOS: SwiftUI `Map` (MapKit, iOS 17), no key needed — `PyreonMapView`.
// - Web: an OpenStreetMap embed centred on the camera, no key and no mapping
//   library, plus the marker list as buttons that select (the embed can show
//   only one pin, the selected or the first).
// - Android: not yet (MAP-3). The compiler names it on that target and emits an
//   empty box of the same size rather than guessing at a map.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { UseMapResult } from './useMap'

export interface MapViewProps {
  /** The state from `useMap()`. */
  map: UseMapResult
  /** Height in px / pt / dp. Default 240. Must be a static literal on native. */
  height?: number
  [key: `data-${string}`]: string | undefined
}

/** Degrees of longitude the embed shows at `zoom` (the web-map convention: 360° at zoom 0, halving per level). */
function span(zoom: number): number {
  return 360 / 2 ** Math.max(0, Math.min(zoom, 19))
}

export function MapView(props: MapViewProps): VNode {
  const height = props.height ?? 240
  const src = (): string => {
    const { latitude, longitude, zoom } = props.map.camera
    const half = span(zoom) / 2
    const pin = props.map.selectedMarker ?? props.map.markers[0]
    // Web Mercator stops at ±85.05°; a bbox past it is not a map the embed can show.
    const lat = (n: number): number => Math.max(-85, Math.min(85, n))
    const bbox = [longitude - half, lat(latitude - half / 2), longitude + half, lat(latitude + half / 2)]
      .map((n) => n.toFixed(5))
      .join(',')
    const marker = pin ? `&marker=${pin.latitude.toFixed(5)},${pin.longitude.toFixed(5)}` : ''

    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker}`
  }

  return h(
    'div',
    { class: 'pyreon-map-view', 'data-testid': props['data-testid'] },
    h('iframe', {
      src,
      title: 'Map',
      style: `border: 0; width: 100%; height: ${height}px`,
      loading: 'lazy',
    }),
    h(
      'div',
      { role: 'list' },
      () =>
        props.map.markers.map((m) =>
          h(
            'button',
            {
              type: 'button',
              role: 'listitem',
              'aria-pressed': () => (props.map.selectedMarkerId === m.id ? 'true' : 'false'),
              onClick: () => props.map.selectMarker(m.id),
            },
            m.title ?? m.id,
          ),
        ),
    ),
  )
}
