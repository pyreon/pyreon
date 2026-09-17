import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { OptionHit } from './OptionChart'
import type { EChartsOption } from './option'

const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('OptionChart (real browser)', () => {
  it('paints a tiled decal inside a bar: decal-coloured pixels over the bar fill', async () => {
    const option: EChartsOption = { animation: false, xAxis: { data: ['a'] }, yAxis: { min: 0, max: 10 }, series: [{ type: 'bar', itemStyle: { color: '#0000ff', decal: { symbol: 'rect', color: '#ff0000', dashArrayX: [4, 4], dashArrayY: [4, 4] } }, data: [10] }] }
    const plain: EChartsOption = { ...option, series: [{ type: 'bar', itemStyle: { color: '#0000ff' }, data: [10] }] }
    const count = async (o: EChartsOption): Promise<number> => {
      const m = mountInBrowser(h(OptionChart, { option: o, width: 300, height: 200 }))
      await flush()
      await wait(900)
      const c = m.container.querySelector('canvas')!
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let red = 0
      for (let i = 0; i < d.length; i += 4) if (d[i]! > 200 && d[i + 2]! < 60 && d[i + 1]! < 60) red++
      m.unmount()
      return red
    }
    expect(await count(plain)).toBe(0)
    expect(await count(option)).toBeGreaterThan(50)
  })

  it('paints image fills, image:// decals and path:// decals once the texture loads', async () => {
    const tile = document.createElement('canvas')
    tile.width = 8
    tile.height = 8
    const tctx = tile.getContext('2d')!
    tctx.fillStyle = '#00ff00'
    tctx.fillRect(0, 0, 8, 8)
    const green = tile.toDataURL('image/png')
    const count = async (o: EChartsOption, match: (r: number, g: number, b: number) => boolean): Promise<number> => {
      const m = mountInBrowser(h(OptionChart, { option: o, width: 300, height: 200 }))
      await flush()
      await wait(900)
      const c = m.container.querySelector('canvas')!
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (match(d[i]!, d[i + 1]!, d[i + 2]!)) n++
      m.unmount()
      return n
    }
    const isGreen = (r: number, g: number, b: number) => g > 200 && r < 60 && b < 60
    const isRed = (r: number, g: number, b: number) => r > 200 && g < 60 && b < 60
    const bar = (itemStyle: Record<string, unknown>): EChartsOption => ({ animation: false, xAxis: { data: ['a'] }, yAxis: { min: 0, max: 10 }, series: [{ type: 'bar', itemStyle: { color: '#0000ff', ...itemStyle }, data: [10] }] })
    expect(await count(bar({}), isGreen)).toBe(0)
    // An image fill: the loaded texture replaces the bar's colour.
    expect(await count(bar({ color: { image: green, repeat: 'repeat' } }), isGreen)).toBeGreaterThan(500)
    // An image:// decal tiles the texture on the decal pitch.
    expect(await count(bar({ decal: { symbol: 'image://' + green, dashArrayX: [6, 4], dashArrayY: [6, 4] } }), isGreen)).toBeGreaterThan(50)
    // A path:// decal draws the path's shape in the decal colour.
    expect(await count(bar({ decal: { symbol: 'path://M0 0L10 0L5 10Z', color: '#ff0000', dashArrayX: [8, 4], dashArrayY: [8, 4] } }), isRed)).toBeGreaterThan(50)
  })

  it('animates a lines trail on a frame clock: the canvas changes between frames, and holds still under reduced motion', async () => {
    const option: EChartsOption = { xAxis: {}, yAxis: {}, series: [{ type: 'lines', effect: { show: true, period: 1, trailLength: 0.3, color: '#ff0000', symbolSize: 10 }, data: [{ coords: [[0, 0], [10, 10]] }] }] }
    const snapshot = (c: HTMLCanvasElement): string => {
      const ctx = c.getContext('2d')!
      return Array.from(ctx.getImageData(0, 0, c.width, c.height).data).join(',')
    }
    const moving = mountInBrowser(h(OptionChart, { option, width: 300, height: 160 }))
    await flush()
    const c = moving.container.querySelector('canvas')!
    const a = snapshot(c)
    await wait(250)
    const b = snapshot(c)
    expect(b).not.toBe(a)
    moving.unmount()
    // Under prefers-reduced-motion the clock never starts and the trail holds at its first frame.
    const realMatch = window.matchMedia
    window.matchMedia = ((q: string) => ({ ...realMatch.call(window, q), matches: q.includes('reduce') })) as typeof window.matchMedia
    try {
      const still = mountInBrowser(h(OptionChart, { option, width: 300, height: 160 }))
      await flush()
      const s = still.container.querySelector('canvas')!
      const first = snapshot(s)
      await wait(250)
      expect(snapshot(s)).toBe(first)
      still.unmount()
    } finally {
      window.matchMedia = realMatch
    }
  })

  it('retains omitted option fields across reactive updates and can replace selected components', async () => {
    const option = signal<EChartsOption>({
      xAxis: { data: ['a', 'b'] },
      yAxis: {},
      series: [{ id: 'main', type: 'bar', name: 'Main', data: [1, 2] }, { id: 'extra', type: 'line', name: 'Extra', data: [2, 1] }],
    })
    const merged = mountInBrowser(h(OptionChart, { option: () => option(), optionUpdate: { mode: 'merge' }, width: 300, height: 160 }))
    await flush()
    option.set({ series: [{ id: 'main', data: [5, 6] }] })
    await flush()
    expect(merged.container.querySelector('table')!.textContent).toContain('a')
    expect(merged.container.querySelector('table')!.textContent).toContain('Extra')

    const replacement = signal<EChartsOption>({
      xAxis: { data: ['a', 'b'] },
      yAxis: {},
      series: [{ id: 'main', type: 'bar', name: 'Main', data: [1, 2] }, { id: 'extra', type: 'line', name: 'Extra', data: [2, 1] }],
    })
    const replacing = mountInBrowser(h(OptionChart, {
      option: () => replacement(),
      optionUpdate: { mode: 'merge', replaceKeys: 'series' },
      width: 300,
      height: 160,
    }))
    await flush()
    replacement.set({ series: [{ id: 'main', type: 'bar', name: 'Main', data: [5, 6] }] })
    await flush()
    expect(replacing.container.querySelector('table')!.textContent).not.toContain('Extra')
  })

  it('paints a bar option on canvas, hit-tests clicks against the painted geometry, and repaints on option change', async () => {
    const option = signal<EChartsOption>({ title: { text: 'Sales' }, xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'bar', data: [3, 1, 2] }] })
    const hits: (OptionHit | null)[] = []
    const { container } = mountInBrowser(h(OptionChart, { option: () => option(), width: 300, height: 160, onSelect: (hit: OptionHit | null) => hits.push(hit) }))
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    expect(container.querySelector('table')!.textContent).toContain('b')
    const r = c.getBoundingClientRect()
    // Sweep the lower plot: every category must be reported, in order.
    for (let x = 2; x < 300; x += 4) c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + 130, bubbles: true }))
    const seen: string[] = []
    for (const hh of hits) if (hh !== null && (seen.length === 0 || seen[seen.length - 1] !== hh.name)) seen.push(hh.name)
    expect(seen).toEqual(['a', 'b', 'c'])
    const b = hits.find((hh) => hh !== null && hh.name === 'b')!
    expect(b!.seriesIndex).toBe(0)
    expect(b!.dataIndex).toBe(1)
    expect(b!.value).toBe(1)
    option.set({ xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'bar', data: [3, 1, 2] }, { type: 'line', data: [1, 2, 3] }] })
    await flush()
    expect(inked(c)).not.toBe(before)
  })

  it('a host-less family option (single axis) renders through the facade as an inline svg', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: { singleAxis: { type: 'value' }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [[1, 2], [3, 4]] }] }, width: 300, height: 200 }))
    await flush()
    expect(container.querySelector('svg')).not.toBeNull()
    // No canvas at all: the cartesian surface mounts only for a cartesian plan.
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('a timeline auto-plays at its interval and stops when the option loses it', async () => {
    const option = signal<EChartsOption>({
      baseOption: { timeline: { data: ['2019', '2020', '2021'], autoPlay: true, playInterval: 120 }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar' }] },
      options: [{ series: [{ data: [1] }] }, { series: [{ data: [2] }] }, { series: [{ data: [3] }] }],
    })
    const changes: number[] = []
    // Mounted as a VNode, not as an accessor factory: a function child is sampled once for classification
    // and then bound, so `() => OptionChart(...)` would run the setup (and start the interval) TWICE.
    const { container } = mountInBrowser(h(OptionChart, { option: () => option(), width: 300, height: 200, onTimelineChange: (i: number) => changes.push(i) }))
    await flush()
    // The step rides the wrapper (the canvas itself belongs to the shared host).
    const c = container.querySelector('[data-pyreon-step]')!
    expect(c.getAttribute('data-pyreon-step')).toBe('0')
    await wait(170)
    expect(c.getAttribute('data-pyreon-step')).toBe('1')
    expect(changes).toEqual([1])
    option.set({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    await flush()
    const after = changes.length
    await wait(260)
    expect(changes.length).toBe(after)
  })
})
