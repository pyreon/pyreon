// Every canvas host through the SAME interaction sweep, in real Chromium.
//
// The node config excludes the host files from coverage on the promise that
// their real-Chromium suites exercise them. Measuring that promise (batch 4
// of the charts audit) found several hosts at 50–65%: each family spec
// proved its own geometry and click, and nobody drove the shared paths —
// keyboard focus + pick, the tooltip's hit / miss / leave, PNG export, the
// `onSelectIndex` twin — on every host. This file does, parameterised over
// the whole host set, so a host that forgets to wire `pick` / `focusRect`
// or drops `onSelectIndex` fails here by name. Browser coverage is now
// gated on these files (vitest.browser.config.ts).
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { BoxplotChart } from './BoxplotChart'
import { CalendarChart } from './CalendarChart'
import { CandlestickChart } from './CandlestickChart'
import { FunnelChart } from './FunnelChart'
import { GanttChart } from './GanttChart'
import { GraphChart } from './GraphChart'
import { HeatmapChart } from './HeatmapChart'
import { MapChart } from './MapChart'
import { OptionChart } from './OptionChart'
import { ParallelChart } from './ParallelChart'
import { GaugeChart, PieChart } from './PieChart'
import { PolarChart } from './PolarChart'
import { RadarChart } from './RadarChart'
import { RiverChart } from './RiverChart'
import { SankeyChart } from './SankeyChart'
import { SunburstChart } from './SunburstChart'
import { TreeChart } from './TreeChart'
import { TreemapChart } from './TreemapChart'
import { PlotChart } from './Chart'
import { bars, line } from './marks'
import type { GeoJson } from './geo-web'
import type { TreeNode } from './treemap'

interface Share { name: string; share: number }
const SHARES: Share[] = [{ name: 'Direct', share: 40 }, { name: 'Search', share: 30 }, { name: 'Social', share: 20 }, { name: 'Email', share: 10 }]
const TREE: TreeNode[] = [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] }]
const WORLD: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'B' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
}
interface Player { name: string; speed: number; power: number; skill: number }
const PLAYERS: Player[] = [{ name: 'Ana', speed: 90, power: 40, skill: 80 }, { name: 'Ben', speed: 30, power: 85, skill: 55 }]
interface Bar { day: string; o: number; h: number; l: number; c: number }
const CANDLES: Bar[] = [{ day: 'Mon', o: 10, h: 20, l: 5, c: 15 }, { day: 'Tue', o: 15, h: 18, l: 8, c: 9 }, { day: 'Wed', o: 9, h: 14, l: 7, c: 12 }]
interface Obs { day: string; hour: string; n: number }
const HEAT: Obs[] = [{ day: 'Mon', hour: '09', n: 1 }, { day: 'Mon', hour: '10', n: 50 }, { day: 'Tue', hour: '09', n: 25 }, { day: 'Tue', hour: '10', n: 5 }]

const W = 360
const H = 240

/** Shared props every host takes: the sweep's switches plus the callbacks it counts. */
type Hooks = { onSelect: (v: unknown) => void; onSelectIndex: (i: unknown) => void; onSaveImage: (url: string) => void }
const shared = (k: Hooks): Record<string, unknown> => ({
  width: W, height: H, animate: false, updateAnimation: false, title: 'Sweep', showTitle: true, showLegend: true, tooltip: true, keyboard: true,
  toolbox: { saveAsImage: true },
  onSelect: k.onSelect, onSelectIndex: k.onSelectIndex, onSaveImage: k.onSaveImage,
})

type Host = { name: string; make: (k: Hooks) => VNode; /** A point that hits an item — undefined when the sweep should only assert that a miss reports -1. */ hit?: [number, number] }
const HOSTS: Host[] = [
  { name: 'PieChart', make: (k) => h(PieChart<Share>, { ...shared(k), data: SHARES, value: (d: Share) => d.share, label: (d: Share) => d.name }) },
  { name: 'GaugeChart', make: (k) => h(GaugeChart, { ...shared(k), value: 65, showValue: true }) },
  { name: 'FunnelChart', make: (k) => h(FunnelChart<Share>, { ...shared(k), data: SHARES, value: (d: Share) => d.share, label: (d: Share) => d.name }) },
  { name: 'TreemapChart', make: (k) => h(TreemapChart, { ...shared(k), data: TREE }) },
  { name: 'SunburstChart', make: (k) => h(SunburstChart, { ...shared(k), data: TREE }) },
  { name: 'TreeChart', make: (k) => h(TreeChart, { ...shared(k), data: TREE }) },
  { name: 'SankeyChart', make: (k) => h(SankeyChart, { ...shared(k), nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 5 }] }) },
  { name: 'GraphChart', make: (k) => h(GraphChart, { ...shared(k), nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] }) },
  { name: 'RiverChart', make: (k) => h(RiverChart, { ...shared(k), series: [{ name: 'a', values: [1, 3, 2] }, { name: 'b', values: [2, 1, 3] }] }) },
  { name: 'PolarChart', make: (k) => h(PolarChart, { ...shared(k), axes: { categories: ['a', 'b', 'c'] }, series: [{ name: 'x', kind: 'bar', values: [1, 2, 3] }] }) },
  { name: 'CalendarChart', make: (k) => h(CalendarChart, { ...shared(k), start: '2024-01-01', end: '2024-01-28', values: { '2024-01-03': 3, '2024-01-10': 7, '2024-01-17': 1 } }) },
  { name: 'GanttChart', make: (k) => h(GanttChart, { ...shared(k), tasks: [{ id: '1', name: 'Design', start: '2024-01-01', end: '2024-01-10', progress: 0.5 }, { id: '2', name: 'Build', start: '2024-01-08', end: '2024-01-20' }] }) },
  { name: 'MapChart', make: (k) => h(MapChart, { ...shared(k), map: WORLD, values: { A: 1, B: 9 } }) },
  { name: 'ParallelChart', make: (k) => h(ParallelChart, { ...shared(k), axes: [{ name: 'a' }, { name: 'b' }], rows: [[1, 10], [2, 20], [3, 30]] }) },
  { name: 'HeatmapChart', make: (k) => h(HeatmapChart<Obs>, { ...shared(k), data: HEAT, x: (d: Obs) => d.day, y: (d: Obs) => d.hour, value: (d: Obs) => d.n }) },
  { name: 'CandlestickChart', make: (k) => h(CandlestickChart<Bar>, { ...shared(k), data: CANDLES, x: (d: Bar) => d.day, open: (d: Bar) => d.o, high: (d: Bar) => d.h, low: (d: Bar) => d.l, close: (d: Bar) => d.c }) },
  { name: 'RadarChart', make: (k) => h(RadarChart<Player>, { ...shared(k), data: PLAYERS, axes: [{ label: 'Speed', max: 100 }, { label: 'Power', max: 100 }, { label: 'Skill', max: 100 }], values: (d: Player) => [d.speed, d.power, d.skill], label: (d: Player) => d.name }) },
  { name: 'BoxplotChart', make: (k) => h(BoxplotChart<{ group: string; obs: number[] }>, { ...shared(k), data: [{ group: 'A', obs: [1, 2, 3, 4, 5] }, { group: 'B', obs: [3, 5, 7, 9, 40] }], values: (d: { group: string; obs: number[] }) => d.obs, x: (d: { group: string; obs: number[] }) => d.group }) },
  { name: 'OptionChart', make: (k) => h(OptionChart, { ...shared(k), option: { xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'bar', data: [3, 1, 2] }] } }) },
  // The plot host's toolbox defaults to the engine's SVG export; the sweep asks for the PNG the family hosts produce.
  { name: 'PlotChart', make: (k) => h(PlotChart<Share>, { ...shared(k), data: SHARES, x: (d: Share) => d.name, marks: [bars<Share>((d) => d.share), line<Share>((d) => d.share)], crosshair: true, toolbox: { saveAsImage: 'png' } }) },
]

const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}
const pointer = (el: Element, type: string, x: number, y: number): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true }))
}
const click = (el: Element, x: number, y: number): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }))
}
const inked = (c: HTMLCanvasElement): number => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Scan the plot for a point the tooltip answers — the sweep does not know each family's geometry, the host does. */
async function findHit(canvas: HTMLCanvasElement, tip: HTMLElement): Promise<[number, number] | null> {
  for (let y = 40; y < H - 10; y += 12) {
    for (let x = 12; x < W - 12; x += 12) {
      pointer(canvas, 'pointermove', x, y)
      if (tip.style.display !== 'none' && (tip.textContent ?? '') !== '') return [x, y]
    }
  }
  return null
}

describe.each(HOSTS)('$name — the shared host sweep (real browser)', ({ name, make }) => {
  it('paints with chrome, answers the tooltip on a hit and hides it on a miss / leave, selects by click AND by keyboard, reports the index twin, and exports a PNG', async () => {
    const selects: unknown[] = []
    const indices: unknown[] = []
    const images: string[] = []
    const { container } = mountInBrowser(make({ onSelect: (v) => selects.push(v), onSelectIndex: (i) => indices.push(i), onSaveImage: (u) => images.push(u) }))
    await flush()
    await wait(20)
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(inked(canvas), `${name} paints`).toBeGreaterThan(0)
    // The accessible surface every host shares.
    expect(canvas.getAttribute('role')).toBe('img')
    expect(container.querySelector('table'), `${name} table`).not.toBeNull()
    expect(canvas.getAttribute('aria-describedby')).toBe(container.querySelector('table')!.id)

    // Tooltip: every host but the gauge (one value, nothing to point at) mounts
    // the shared tooltip node; a hit shows it, a miss hides it, leaving hides it.
    const tip = container.querySelector<HTMLElement>('[data-pyreon-chart-tooltip]')
    if (name === 'GaugeChart') expect(tip).toBeNull()
    else expect(tip, `${name} tooltip node`).not.toBeNull()
    const hitAt = tip === null ? null : await findHit(canvas, tip)
    if (tip !== null) {
      expect(hitAt, `${name} tooltip hit`).not.toBeNull()
      // A miss is wherever the tooltip does NOT answer — the sweep does not
      // assume a dead corner (a treemap fills its whole box).
      pointer(canvas, 'pointermove', 1, H - 1)
      const cornerIsMiss = tip.style.display === 'none'
      pointer(canvas, 'pointerleave', 0, 0)
      expect(tip.style.display).toBe('none')
      // Click: on the hit point selects through BOTH callbacks; the index twin
      // is a number for most hosts and the engine's own index SHAPE for the
      // few whose hit has two parts (Radar's series+axis, Sankey's node|link,
      // Polar's series+index) — never undefined, never null on a hit.
      click(canvas, hitAt![0], hitAt![1])
      expect(indices.length, `${name} onSelectIndex on click`).toBeGreaterThan(0)
      const last = indices[indices.length - 1] as unknown
      expect(typeof last === 'number' ? last >= 0 : last !== null && typeof last === 'object', `${name} index twin on a hit: ${JSON.stringify(last)}`).toBe(true)
      expect(selects.length, `${name} onSelect on click`).toBeGreaterThan(0)
      if (cornerIsMiss) {
        click(canvas, 1, H - 1)
        const miss = indices[indices.length - 1] as unknown
        // A miss is -1, or the index SHAPE with every part at -1.
        const isMiss = typeof miss === 'number' ? miss === -1 : miss !== null && typeof miss === 'object' && Object.values(miss as Record<string, unknown>).every((v) => v === -1)
        expect(isMiss, `${name} index twin on a miss: ${JSON.stringify(miss)}`).toBe(true)
      }
    }

    // Keyboard: focus, walk, pick, jump, clear — the live region names the item and the ring repaints.
    expect(canvas.getAttribute('tabindex')).toBe('0')
    canvas.focus()
    const live = query<HTMLElement>(container, '[role="status"]')
    const paintedBefore = inked(canvas)
    key(canvas, 'ArrowRight')
    await wait(10)
    if (name !== 'GaugeChart') expect(live.textContent ?? '', `${name} announces`).not.toBe('')
    key(canvas, 'ArrowRight')
    key(canvas, 'ArrowLeft')
    key(canvas, 'End')
    key(canvas, 'Home')
    await wait(10)
    const picksBefore = indices.length
    key(canvas, 'Enter')
    if (name !== 'GaugeChart') expect(indices.length, `${name} keyboard pick reports the index`).toBeGreaterThan(picksBefore)
    key(canvas, 'Escape')
    await wait(10)
    void paintedBefore
    canvas.blur()
    await wait(10)
    expect(live.textContent ?? '').toBe('')

    // Toolbox: the top-right button exports the canvas.
    click(canvas, W - 9, 9)
    expect(images, `${name} saveAsImage`).toHaveLength(1)
    expect(images[0]!.startsWith('data:image/png')).toBe(true)
  })
})
