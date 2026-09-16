import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { MapChart } from './MapChart'
import { geoShapes, layoutGeo } from './geo-web'
import type { GeoRegion, GeoValue } from './geo'
import type { GeoJson } from './geo-web'

const WORLD: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'B' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
}
const pixel = (c: HTMLCanvasElement, x: number, y: number): string => {
  const dpr = window.devicePixelRatio || 1
  const d = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return String(d[0]) + ',' + String(d[1]) + ',' + String(d[2])
}

// A roam repaint lands on the draw effect's next pass, after `flush`.
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 120))

describe('MapChart (real browser)', () => {
  it('paints a heat layer and pies over the regions', async () => {
    const { container } = mountInBrowser(() =>
      MapChart({
        animate: false,
        map: WORLD,
        values: {},
        width: 400,
        height: 300,
        heat: [{ lon: 5, lat: 5, value: 9 }],
        heatRadius: 30,
        heatStops: ['#0000ff', '#ff0000'],
        pies: [{ lon: 15, lat: 5, radius: 40, innerRadius: 0, slices: [{ value: 1, label: 'a', color: '#00ff00' }] }],
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const l = layoutGeo(WORLD, { x: 0, y: 0, w: 400, h: 300 })
    const heatAt = l.regions[0]!.centroid
    const pieAt = l.regions[1]!.centroid
    const [r, , b] = pixel(c, heatAt.x, heatAt.y).split(',').map(Number)
    expect(r!).toBeGreaterThan(b!)
    expect(pixel(c, pieAt.x, pieAt.y)).toBe('0,255,0')
  })

  it('roams: a drag pans the map and does not select, the wheel zooms about the pointer, and roam off keeps it static', async () => {
    const picked: (GeoRegion | null)[] = []
    const { container } = mountInBrowser(() => MapChart({ animate: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300, roam: true, onSelect: (r) => picked.push(r) }))
    await flush()
    const c = container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    const l = layoutGeo(WORLD, { x: 0, y: 0, w: 400, h: 300 })
    const a = l.regions[0]!.centroid
    const aBefore = pixel(c, a.x, a.y)
    // Drag A's centroid 150px right: the empty ground there becomes A's colour.
    const target = { x: a.x + 150, y: a.y }
    const groundBefore = pixel(c, 5, 5)
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: r.left + a.x, clientY: r.top + a.y, bubbles: true }))
    for (let k = 1; k <= 5; k++) c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: r.left + a.x + 30 * k, clientY: r.top + a.y, bubbles: true }))
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: r.left + target.x, clientY: r.top + target.y, bubbles: true }))
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + target.x, clientY: r.top + target.y, bubbles: true }))
    await flush()
    await settle()
    expect(picked).toHaveLength(0)
    expect(pixel(c, target.x, target.y)).toBe(aBefore)
    // Wheel-zoom in at the new centre of A: the region still sits under the pointer,
    // and a point just past A's old edge is inside A now.
    const pastEdge = pixel(c, target.x + 110, target.y)
    expect(pastEdge).not.toBe(aBefore)
    // (then)-zoom in at the new centre of A: the region still sits under the pointer.
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: r.left + target.x, clientY: r.top + target.y, bubbles: true, cancelable: true }))
    await flush()
    await settle()
    expect(pixel(c, target.x, target.y)).toBe(aBefore)
    expect(pixel(c, target.x + 110, target.y)).toBe(aBefore)
    expect(pixel(c, 5, 5)).toBe(groundBefore)

    const still = mountInBrowser(() => MapChart({ animate: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300 }))
    await flush()
    const s = still.container.querySelector('canvas')!
    const rs = s.getBoundingClientRect()
    const sBefore = pixel(s, a.x + 150, a.y)
    s.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: rs.left + a.x, clientY: rs.top + a.y, bubbles: true }))
    s.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: rs.left + a.x + 150, clientY: rs.top + a.y, bubbles: true }))
    await flush()
    await settle()
    expect(pixel(s, a.x + 150, a.y)).toBe(sBefore)
  })

  it('paints regions, selects the one under the click, recolours reactively', async () => {
    const values = signal<Record<string, number>>({ A: 1, B: 9 })
    const picked: (GeoRegion | null)[] = []
    const { container } = mountInBrowser(() =>
      MapChart({ animate: false, map: WORLD, values: () => values(), width: 400, height: 300, title: 'Map', onSelect: (r) => picked.push(r) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const l = layoutGeo(WORLD, { x: 0, y: 0, w: 400, h: 300 })
    const a = l.regions[0]!.centroid
    const before = pixel(c, a.x, a.y)
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + a.x, clientY: r.top + a.y, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.name).toBe('A')
    values.set({ A: 9, B: 1 })
    await flush()
    expect(pixel(c, a.x, a.y)).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('B')
  })

  // `GeoShape[]` + `GeoValue[]` is the ONE `map`/`values` pairing that lowers
  // to iOS and Android (raw GeoJSON's geometry union puts `coordinates` at two
  // array depths). It has to paint the same pixels as the GeoJSON form here,
  // or the native map is a second engine wearing the same name.
  it('the crossing shapes paint the same pixels as the GeoJSON form', async () => {
    const shapes = geoShapes(WORLD)
    const list: GeoValue[] = [{ region: 'A', value: 1 }, { region: 'B', value: 9 }]
    const picked: number[] = []
    const mounts = [
      mountInBrowser(() => MapChart({ animate: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300 })),
      mountInBrowser(() => MapChart({ animate: false, map: shapes, values: list, width: 400, height: 300, onSelectIndex: (i) => picked.push(i) })),
    ]
    await flush()
    const [json, crossing] = mounts.map((m) => m.container.querySelector('canvas')!)
    const l = layoutGeo(WORLD, { x: 0, y: 0, w: 400, h: 300 })
    for (const region of l.regions) {
      expect(pixel(crossing!, region.centroid.x, region.centroid.y)).toBe(pixel(json!, region.centroid.x, region.centroid.y))
    }
    // …and the index tap the native gesture reports agrees with the region.
    const b = l.regions[1]!.centroid
    const r = crossing!.getBoundingClientRect()
    crossing!.dispatchEvent(new MouseEvent('click', { clientX: r.left + b.x, clientY: r.top + b.y, bubbles: true }))
    expect(picked).toEqual([1])
  })
})
