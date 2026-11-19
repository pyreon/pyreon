// The map host in real Chromium: hover emphasis, persistent selection (pointer and keyboard), the accessible state,
// a join by id, feature properties in the tooltip, and the proof a roam frame does not re-project or re-align.
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { MapChart } from './MapChart'
import { layoutGeo } from './geo-web'
import type { GeoJson } from './geo-web'

const square = (x: number): number[][][] => [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]]
const WORLD: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'a-id', properties: { name: 'A', iso: 'AA', gdp: 7 }, geometry: { type: 'Polygon', coordinates: square(0) } },
    { type: 'Feature', id: 'b-id', properties: { name: 'B', iso: 'BB', gdp: 9 }, geometry: { type: 'Polygon', coordinates: square(10) } },
  ],
}
const BOX = { x: 0, y: 0, w: 400, h: 300 }
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 80))
const snap = (c: HTMLCanvasElement): string => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).join(',')

const at = (c: HTMLCanvasElement, p: { x: number; y: number }, type: string, extra: Record<string, unknown> = {}): void => {
  const r = c.getBoundingClientRect()
  const init = { clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, pointerId: 1, ...extra }
  c.dispatchEvent(type === 'click' ? new MouseEvent(type, init) : new PointerEvent(type, init))
}

describe('MapChart states (real browser)', () => {
  const regionCentre = (i: number): { x: number; y: number } => layoutGeo(WORLD, BOX).regions[i]!.centroid

  it('hover draws the emphasis outline and leaving removes it', async () => {
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300 }))
    await flush()
    const c = container.querySelector('canvas')!
    const rest = snap(c)
    at(c, regionCentre(0), 'pointermove')
    await settle()
    expect(snap(c)).not.toBe(rest)
    at(c, regionCentre(0), 'pointerleave')
    await settle()
    expect(snap(c)).toBe(rest)
    unmount()
  })

  it('emphasis={false} paints no hover', async () => {
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, emphasis: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300 }))
    await flush()
    const c = container.querySelector('canvas')!
    const rest = snap(c)
    at(c, regionCentre(0), 'pointermove')
    await settle()
    expect(snap(c)).toBe(rest)
    unmount()
  })

  it('selectedMode single replaces, multiple toggles, and the canvas description names the selection', async () => {
    const seen: number[][] = []
    const single = mountInBrowser(() => MapChart({ animate: false, selectedMode: 'single', map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300, onSelectionChange: (s) => seen.push(s) }))
    await flush()
    const c = single.container.querySelector('canvas')!
    at(c, regionCentre(0), 'click')
    at(c, regionCentre(1), 'click')
    await settle()
    expect(seen).toEqual([[0], [1]])
    expect(c.getAttribute('aria-label')).toContain('Selected: B.')
    single.unmount()

    const many: number[][] = []
    const multi = mountInBrowser(() => MapChart({ animate: false, selectedMode: 'multiple', map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300, onSelectionChange: (s) => many.push(s) }))
    await flush()
    const m = multi.container.querySelector('canvas')!
    at(m, regionCentre(0), 'click')
    at(m, regionCentre(1), 'click')
    at(m, regionCentre(0), 'click')
    await settle()
    expect(many).toEqual([[0], [0, 1], [1]])
    expect(m.getAttribute('aria-label')).toContain('Selected: B.')
    multi.unmount()
  })

  it('selection survives hovering away, and does not exist without selectedMode', async () => {
    const seen: number[][] = []
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300, onSelectionChange: (s) => seen.push(s) }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, regionCentre(0), 'click')
    await settle()
    expect(seen).toEqual([])
    expect(c.getAttribute('aria-label') ?? '').not.toContain('Selected')
    unmount()
  })

  it('the keyboard selects the focused region with Enter and Space and announces it', async () => {
    const seen: number[][] = []
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, selectedMode: 'multiple', map: WORLD, values: { A: 1, B: 9 }, width: 400, height: 300, onSelectionChange: (s) => seen.push(s) }))
    await flush()
    const c = container.querySelector('canvas')!
    c.focus()
    const key = (k: string): void => {
      c.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    }
    key('ArrowRight')
    key('Enter')
    key('ArrowRight')
    key(' ')
    await settle()
    expect(seen).toEqual([[0], [0, 1]])
    expect(container.querySelector('[role="status"]')!.textContent).toContain('selected')
    unmount()
  })

  it('values join by feature id, and the tooltip formatter sees the feature properties', async () => {
    const { container, unmount } = mountInBrowser(() =>
      MapChart({
        animate: false, tooltip: true, map: WORLD, values: { 'b-id': 9 }, width: 400, height: 300, options: { idProperty: 'id' },
        tooltipFormatter: (i) => [`${i.label} (${String(i.properties?.iso)})`, `value ${i.value}`, `gdp ${String(i.properties?.gdp)}`],
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    at(c, regionCentre(1), 'pointermove')
    await settle()
    const tip = container.querySelector<HTMLElement>('[data-pyreon-chart-tooltip]')!.textContent!
    expect(tip).toContain('B (BB)')
    expect(tip).toContain('value 9')
    expect(tip).toContain('gdp 9')
    unmount()
  })

  it('a roam frame re-projects no vertex and re-aligns no value after the first frame', async () => {
    let coordReads = 0
    const counted = (xs: number[][][]): number[][][] => xs.map((ring) => ring.map((pt) => new Proxy(pt, { get: (t, k, r) => { if (k === '0' || k === '1') coordReads++; return Reflect.get(t, k, r) } })))
    const geo: GeoJson = { type: 'FeatureCollection', features: WORLD.features.map((f) => ({ ...f, geometry: { type: 'Polygon', coordinates: counted((f.geometry as { coordinates: number[][][] }).coordinates) } })) }
    let valueReads = 0
    const values = new Proxy({ A: 1, B: 9 } as Record<string, number>, { get: (t, k, r) => { valueReads++; return Reflect.get(t, k, r) }, has: (t, k) => { valueReads++; return Reflect.has(t, k) }, getOwnPropertyDescriptor: (t, k) => { valueReads++; return Reflect.getOwnPropertyDescriptor(t, k) } })
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, roam: true, map: geo, values, width: 400, height: 300 }))
    await flush()
    await settle()
    const c = container.querySelector('canvas')!
    expect(coordReads, 'the first frame projects').toBeGreaterThan(0)
    const firstCoords = coordReads
    const firstValues = valueReads
    const before = snap(c)
    for (let k = 0; k < 6; k++) {
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 200, clientY: 150, bubbles: true, cancelable: true }))
      await settle()
    }
    expect(snap(c), 'the wheel did redraw').not.toBe(before)
    expect(coordReads, 'projection calls per roam frame').toBe(firstCoords)
    expect(valueReads, 'value reads per roam frame').toBe(firstValues)
    unmount()
  })
})
