// useMap had no web half — the fourth hook in this arc with that gap, after
// useGeolocation, useDatabase and useWebSocket.
//
// These assert the SHARED-CODE CONTRACT, not merely that the hook works. Every
// semantic below is copied from `PyreonMapState` (Swift and Kotlin agree), and
// each is one an independent reimplementation would plausibly get wrong.

import { describe, expect, it } from 'vitest'
import { useMap } from '../useMap'

const m = (id: string, lat = 1, lon = 2, title?: string) =>
  title === undefined ? { id, latitude: lat, longitude: lon } : { id, latitude: lat, longitude: lon, title }

describe('useMap — web half', () => {
  it('defaults match the native initialiser exactly', () => {
    const map = useMap()
    // PyreonMapCamera(latitude: 0, longitude: 0, zoom: 1), markers: []
    expect(map.camera).toEqual({ latitude: 0, longitude: 0, zoom: 1 })
    expect(map.markers).toEqual([])
    expect(map.selectedMarkerId).toBeNull()
    expect(map.selectedMarker).toBeNull()
  })

  it('fields are LIVE getters, not values frozen at mount', () => {
    const map = useMap()
    // A component body runs once; resolved values would pin these forever.
    map.moveTo(10, 20)
    expect(map.camera.latitude).toBe(10)
  })

  it('moveTo KEEPS the current zoom when zoom is omitted', () => {
    const map = useMap({ camera: { latitude: 0, longitude: 0, zoom: 12 } })
    map.moveTo(5, 6)
    expect(map.camera).toEqual({ latitude: 5, longitude: 6, zoom: 12 })
    map.moveTo(7, 8, 3)
    expect(map.camera.zoom).toBe(3)
  })

  it('moveTo accepts zoom 0 — a truthiness check would drop it', () => {
    const map = useMap({ camera: { latitude: 0, longitude: 0, zoom: 9 } })
    map.moveTo(1, 1, 0)
    // `zoom || camera.zoom` would silently restore 9 here.
    expect(map.camera.zoom).toBe(0)
  })

  it('addMarker UPSERTS by id and preserves list position', () => {
    const map = useMap()
    map.setMarkers([m('a'), m('b'), m('c')])
    map.addMarker(m('b', 99, 99, 'updated'))
    // Appending instead of replacing in place would reorder however the app
    // renders the list.
    expect(map.markers.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(map.markers[1]).toEqual({ id: 'b', latitude: 99, longitude: 99, title: 'updated' })
  })

  it('addMarker appends a genuinely new id', () => {
    const map = useMap()
    map.addMarker(m('a'))
    map.addMarker(m('b'))
    expect(map.markers.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('selectedMarker is DERIVED, and resolves through later edits', () => {
    const map = useMap()
    map.setMarkers([m('a'), m('b')])
    map.selectMarker('b')
    expect(map.selectedMarker?.id).toBe('b')
    // Stored rather than derived, this would keep returning the stale marker.
    map.addMarker(m('b', 50, 60))
    expect(map.selectedMarker?.latitude).toBe(50)
  })

  it('removeMarker CLEARS a selection pointing at it', () => {
    const map = useMap()
    map.setMarkers([m('a'), m('b')])
    map.selectMarker('b')
    map.removeMarker('b')
    // Otherwise selectedMarkerId still reports 'b' while selectedMarker
    // resolves to null — the two disagree.
    expect(map.selectedMarkerId).toBeNull()
    expect(map.selectedMarker).toBeNull()
    expect(map.markers.map((x) => x.id)).toEqual(['a'])
  })

  it('removeMarker leaves an UNRELATED selection alone', () => {
    const map = useMap()
    map.setMarkers([m('a'), m('b')])
    map.selectMarker('a')
    map.removeMarker('b')
    expect(map.selectedMarkerId).toBe('a')
    expect(map.selectedMarker?.id).toBe('a')
  })

  it('selectMarker(null) clears', () => {
    const map = useMap()
    map.setMarkers([m('a')])
    map.selectMarker('a')
    map.selectMarker(null)
    expect(map.selectedMarkerId).toBeNull()
    expect(map.selectedMarker).toBeNull()
  })

  it('selecting an unknown id resolves to null without throwing', () => {
    const map = useMap()
    map.setMarkers([m('a')])
    map.selectMarker('nope')
    expect(map.selectedMarkerId).toBe('nope')
    expect(map.selectedMarker).toBeNull()
  })
})

describe('shared-code contract with PyreonMapState', () => {
  it('exposes the native members — and NOT an `error` the runtime lacks', () => {
    const map = useMap()
    for (const f of ['camera', 'markers', 'selectedMarkerId', 'selectedMarker']) {
      expect(f in map, `missing field ${f}`).toBe(true)
    }
    for (const fn of ['setCamera', 'moveTo', 'setMarkers', 'addMarker', 'removeMarker', 'selectMarker']) {
      expect(typeof (map as unknown as Record<string, unknown>)[fn]).toBe('function')
    }
    // PyreonMapState has no `error` on either target. A web-only `error` would
    // be a field that exists on exactly one of the three.
    expect('error' in map).toBe(false)
  })
})
