// `<MapView>` on the web (MAP-2): an OpenStreetMap embed centred on the
// `useMap()` camera, pinned at the selected marker (or the first), and the
// markers as buttons that select. iOS renders the same state with MapKit.

import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { MapView } from '../MapView'
import { useMap } from '../useMap'

function render(map: ReturnType<typeof useMap>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(h(MapView, { map, height: 300, 'data-testid': 'map-view' }), container)

  return {
    root: container.firstElementChild as HTMLElement,
    unmount: () => {
      dispose()
      container.remove()
    },
  }
}

describe('<MapView> (web)', () => {
  it('never asks for latitudes past the Web Mercator limit', () => {
    const map = useMap()
    map.setCamera({ latitude: 80, longitude: 0, zoom: 1 })
    const { root, unmount } = render(map)
    expect(query(root, 'iframe').getAttribute('src')).toContain('bbox=-90.00000,35.00000,90.00000,85.00000')
    unmount()
  })

  it('embeds a map centred on the camera, at the given height', () => {
    const map = useMap()
    map.setCamera({ latitude: 50, longitude: 14, zoom: 10 })
    const { root, unmount } = render(map)
    const iframe = query(root, 'iframe')
    expect(root.getAttribute('data-testid')).toBe('map-view')
    expect(iframe.getAttribute('src')).toContain('openstreetmap.org/export/embed.html?bbox=')
    // 360° / 2^10 = 0.35156° wide, centred on 14.
    expect(iframe.getAttribute('src')).toContain('bbox=13.82422,49.91211,14.17578,50.08789')
    expect(iframe.getAttribute('style')).toContain('height: 300px')
    unmount()
  })

  it('follows the camera and pins the selected marker', () => {
    const map = useMap()
    map.addMarker({ id: 'a', latitude: 1, longitude: 2, title: 'A' })
    map.addMarker({ id: 'b', latitude: 3, longitude: 4, title: 'B' })
    const { root, unmount } = render(map)
    const iframe = query(root, 'iframe')
    expect(iframe.getAttribute('src')).toContain('marker=1.00000,2.00000')
    map.selectMarker('b')
    expect(iframe.getAttribute('src')).toContain('marker=3.00000,4.00000')
    map.moveTo(48, 2, 10)
    expect(iframe.getAttribute('src')).toContain('bbox=1.82422,47.91211,2.17578,48.08789')
    unmount()
  })

  it('lists the markers as buttons that select them', () => {
    const map = useMap()
    map.addMarker({ id: 'a', latitude: 1, longitude: 2, title: 'A' })
    map.addMarker({ id: 'b', latitude: 3, longitude: 4 })
    const { root, unmount } = render(map)
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['A', 'b'])
    buttons[1]!.click()
    expect(map.selectedMarkerId).toBe('b')
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true')
    unmount()
  })
})
