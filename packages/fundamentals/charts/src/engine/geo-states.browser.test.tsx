// The map host in real Chromium: hover emphasis, persistent selection (pointer and keyboard), the accessible state,
// a join by id, feature properties in the tooltip, and the proof a roam frame does not re-project or re-align.
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { MapChart } from './MapChart'
import { layoutGeo } from './geo-web'
import { FLORIDA_LAKE, SOUTH_AFRICA_LESOTHO } from './__fixtures__/geo-holes'
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
    // The state is spoken: the live region reads the row as the table names it, and so does the table.
    key('Home')
    await settle()
    expect(container.querySelector('[role="status"]')!.textContent).toBe('A (selected), 1')
    expect([...container.querySelectorAll('table tbody th')].map((e) => e.textContent)).toEqual(['A (selected)', 'B (selected)'])
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

  it('a hole is cut out of the fill in a real canvas, with no seam along the bridge', async () => {
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, map: FLORIDA_LAKE, values: { Florida: 5 }, width: 400, height: 300, options: { borderWidth: 0 } }))
    await flush()
    const c = container.querySelector('canvas')!
    const dpr = window.devicePixelRatio || 1
    const alphaAt = (x: number, y: number): number => c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data[3]!
    const layout = layoutGeo(FLORIDA_LAKE, { x: 0, y: 0, w: 400, h: 300 }, { padding: 4 })
    const r = layout.regions[0]!
    const lake = r.holes[0]!
    const lakeAt = { x: lake.reduce((a, p) => a + p.x, 0) / lake.length, y: lake.reduce((a, p) => a + p.y, 0) / lake.length }
    expect(alphaAt(lakeAt.x, lakeAt.y), 'the lake is empty').toBe(0)
    // land beside the lake
    expect(alphaAt(lakeAt.x, lakeAt.y - 18)).toBe(255)
    // every bridge midpoint of the fill ring is solid: the bridge edges are walked in and out, so they cancel
    const fill = r.fills[0]!
    const ring = r.rings[0]!
    for (let i = 1; i < fill.length; i++) {
      const a = fill[i - 1]!
      const b = fill[i]!
      const onOutline = ring.some((p) => p.x === a.x && p.y === a.y) && ring.some((p) => p.x === b.x && p.y === b.y) && Math.abs(ring.findIndex((p) => p === a) - ring.findIndex((p) => p === b)) === 1
      const onHole = lake.some((p) => p.x === a.x && p.y === a.y) && lake.some((p) => p.x === b.x && p.y === b.y)
      if (onOutline || onHole) continue
      expect(alphaAt((a.x + b.x) / 2, (a.y + b.y) / 2), 'a bridge midpoint').toBe(255)
    }
    unmount()
  })

  it('Lesotho is a hole in South Africa and is drawn by its own feature on top', async () => {
    const { container, unmount } = mountInBrowser(() => MapChart({ animate: false, map: SOUTH_AFRICA_LESOTHO, values: { 'South Africa': 1, Lesotho: 100 }, width: 400, height: 300, options: { borderWidth: 0 } }))
    await flush()
    const c = container.querySelector('canvas')!
    const layout = layoutGeo(SOUTH_AFRICA_LESOTHO, { x: 0, y: 0, w: 400, h: 300 }, { padding: 4 })
    const ls = layout.regions[1]!.centroid
    const dpr = window.devicePixelRatio || 1
    const px = c.getContext('2d')!.getImageData(Math.round(ls.x * dpr), Math.round(ls.y * dpr), 1, 1).data
    const za = layout.regions[0]!.rings[0]![2]!
    const zaPx = c.getContext('2d')!.getImageData(Math.round((za.x + 6) * dpr), Math.round((za.y - 6) * dpr), 1, 1).data
    expect(px[3]).toBe(255)
    expect(`${px[0]},${px[1]},${px[2]}`, 'Lesotho (value 100) is not South Africa\'s colour (value 1)').not.toBe(`${zaPx[0]},${zaPx[1]},${zaPx[2]}`)
    unmount()
  })

  // Bridge seams show up through anti-aliasing at fractional scales. The proof is exact: render the same land WITHOUT the
  // lake and require every pixel outside the lake (the bridge, the coast, the land between) to be identical, at device
  // pixel ratios 1, 1.5 and 2 and roam zooms 0.7, 1 and 3.3; the lake itself must be empty. The tolerance is 4 levels
  // of 255: where the bridge meets the coast two coverage contributions round differently by one to three levels, which
  // is not a seam (a real seam, measured by the first version of this test along the bridge, was 20 to 180 levels).
  for (const dpr of [1, 1.5, 2]) {
    for (const zoom of [0.7, 1, 3.3]) {
      it(`a lake leaves no seam at devicePixelRatio ${dpr}, zoom ${zoom}: the land outside it is the same, to within 4 of 255, as the same land without it`, async () => {
        const real = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => dpr })
        try {
          const solid: GeoJson = { ...FLORIDA_LAKE, features: [{ ...FLORIDA_LAKE.features[0]!, geometry: { type: 'Polygon', coordinates: [(FLORIDA_LAKE.features[0]!.geometry as { coordinates: number[][][] }).coordinates[0]!] } }] }
          const draw = async (geo: GeoJson): Promise<{ c: HTMLCanvasElement; done: () => void }> => {
            const m = mountInBrowser(() => MapChart({ animate: false, map: geo, values: { Florida: 5 }, width: 400, height: 300, options: { borderWidth: 0, zoom } }))
            await flush()
            return { c: m.container.querySelector('canvas')!, done: m.unmount }
          }
          const withLake = await draw(FLORIDA_LAKE)
          const without = await draw(solid)
          const w = withLake.c.width
          const h = withLake.c.height
          const a = withLake.c.getContext('2d')!.getImageData(0, 0, w, h).data
          const b = without.c.getContext('2d')!.getImageData(0, 0, w, h).data
          const layout = layoutGeo(FLORIDA_LAKE, { x: 0, y: 0, w: 400, h: 300 }, { padding: 4, zoom })
          const lake = layout.regions[0]!.holes[0]!
          const pad = 2.5
          const x0 = (Math.min(...lake.map((p) => p.x)) - pad) * dpr
          const x1 = (Math.max(...lake.map((p) => p.x)) + pad) * dpr
          const y0 = (Math.min(...lake.map((p) => p.y)) - pad) * dpr
          const y1 = (Math.max(...lake.map((p) => p.y)) + pad) * dpr
          const bad: string[] = []
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue
              const i = (y * w + x) * 4
              if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!), Math.abs(a[i + 3]! - b[i + 3]!)) > 4) bad.push(`${x},${y}:${a[i]},${a[i + 1]},${a[i + 2]},${a[i + 3]}/${b[i]},${b[i + 1]},${b[i + 2]},${b[i + 3]}`)
            }
          }
          expect(bad.length, `${bad.length} pixels differ outside the lake: ${bad.slice(0, 4).join(' | ')}`).toBe(0)
          // The lake's centre is empty (alpha 0) with it, solid without it.
          const cx = Math.round(((x0 + x1) / 2))
          const cy = Math.round(((y0 + y1) / 2))
          // (At a large zoom the lake can be panned off the canvas: then only the surrounding land is compared.)
          if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
            expect(a[(cy * w + cx) * 4 + 3], 'lake centre with the lake').toBe(0)
            expect(b[(cy * w + cx) * 4 + 3], 'lake centre without it').toBe(255)
          }
          withLake.done()
          without.done()
        } finally {
          if (real !== undefined) Object.defineProperty(window, 'devicePixelRatio', real)
          else delete (window as unknown as Record<string, unknown>).devicePixelRatio
        }
      })
    }
  }
})
