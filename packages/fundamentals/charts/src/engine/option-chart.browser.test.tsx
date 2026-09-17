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

  it('dataZoom: the slider band drags the window, the wheel zooms it, and a click reports the GLOBAL index', async () => {
    const cats = Array.from({ length: 20 }, (_, i) => `c${i}`)
    const option: EChartsOption = { animation: false, xAxis: { type: 'category', data: cats }, yAxis: {}, dataZoom: [{ type: 'inside', start: 0, end: 50 }, { type: 'slider' }], series: [{ type: 'bar', data: cats.map((_, i) => i + 1) }] }
    const windows: { start: number; end: number }[] = []
    const picked: number[] = []
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 260, onDataZoom: (w: { start: number; end: number }) => windows.push(w), onSelectIndex: (i: number) => picked.push(i) }))
    await flush()
    await wait(300)
    const c = m.container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    const fire = (type: string, x: number, y: number) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 7 }))
    // The strip sits in the bottom 36px; the band covers its left half. Drag the band right by a quarter of the strip.
    const stripY = 260 - 18
    fire('pointerdown', 100, stripY)
    fire('pointermove', 100 + 96, stripY)
    fire('pointerup', 100 + 96, stripY)
    // The click a browser fires at the end of that drag is swallowed, not a selection.
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 196, clientY: r.top + stripY }))
    await flush()
    expect(picked).toEqual([])
    expect(windows.length).toBeGreaterThan(0)
    const moved = windows[windows.length - 1]!
    expect(moved.start).toBeGreaterThan(15)
    expect(moved.end - moved.start).toBeCloseTo(50, 0)
    // A click on the first visible bar reports its index in the full data.
    await wait(50)
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 70, clientY: r.top + 150 }))
    expect(picked[picked.length - 1]).toBeGreaterThanOrEqual(Math.floor((moved.start / 100) * 20))
    // The wheel zooms in about the pointer: the span narrows.
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -400, clientX: r.left + 200, clientY: r.top + 100 }))
    await flush()
    const zoomed = windows[windows.length - 1]!
    expect(zoomed.end - zoomed.start).toBeLessThan(50)
    m.unmount()
  })

  it('timeline: a checkpoint click jumps, prev / next step and wrap, play runs to the end without loop and stops', async () => {
    const option: EChartsOption = {
      baseOption: { animation: false, timeline: { data: ['2019', '2020', '2021'], loop: false, playInterval: 60 }, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar' }] },
      options: [{ series: [{ data: [1, 2] }] }, { series: [{ data: [3, 4] }] }, { series: [{ data: [5, 6] }] }],
    }
    const changes: number[] = []
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 240, onTimelineChange: (i: number) => changes.push(i) }))
    await flush()
    const c = m.container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    const root = m.container.querySelector('[data-pyreon-step]')!
    const click = (x: number) => c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + 240 - 24 }))
    // The axis runs from x 72 (after play + prev) to 352 (before next); the last checkpoint sits at 352.
    click(352)
    await flush()
    expect(changes).toEqual([2])
    expect(root.getAttribute('data-pyreon-step')).toBe('2')
    // Next wraps from the last step to the first; previous wraps back.
    click(400 - 24 - 9)
    await flush()
    expect(changes[changes.length - 1]).toBe(0)
    click(24 + 18 + 6 + 9)
    await flush()
    expect(changes[changes.length - 1]).toBe(2)
    // Play from step 0: it runs to the last step and, without loop, stops there.
    click(212)
    click(24 + 9)
    await wait(400)
    expect(changes.slice(-2)).toEqual([1, 2])
    const settled = changes.length
    await wait(200)
    expect(changes.length).toBe(settled)
    m.unmount()
  })

  it('timeline on a family chart: the strip is its own canvas under the host, and a click jumps', async () => {
    const option: EChartsOption = {
      baseOption: { animation: false, timeline: { data: ['q1', 'q2'] }, series: [{ type: 'pie' }] },
      options: [{ series: [{ data: [{ name: 'x', value: 1 }, { name: 'y', value: 2 }] }] }, { series: [{ data: [{ name: 'x', value: 5 }, { name: 'y', value: 1 }] }] }],
    }
    const changes: number[] = []
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 240, onTimelineChange: (i: number) => changes.push(i) }))
    await flush()
    const canvases = m.container.querySelectorAll('canvas')
    const bar = canvases[canvases.length - 1]!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    const r = bar.getBoundingClientRect()
    bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 352, clientY: r.top + 16 }))
    await flush()
    expect(changes).toEqual([1])
    m.unmount()
  })

  it('toolbox: magicType, box zoom with back, dataView, restore and saveAsImage from option.toolbox', async () => {
    const cats = Array.from({ length: 10 }, (_, i) => `c${i}`)
    const option: EChartsOption = {
      animation: false,
      toolbox: { feature: { dataZoom: {}, dataView: {}, magicType: { type: ['line', 'bar', 'stack'] }, restore: {}, saveAsImage: { name: 'sales' } } },
      xAxis: { type: 'category', data: cats },
      yAxis: {},
      series: [{ type: 'bar', data: cats.map((_, i) => i + 1) }, { type: 'bar', data: cats.map((_, i) => 10 - i) }],
    }
    const windows: { start: number; end: number }[] = []
    const saved: string[] = []
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 260, onDataZoom: (w: { start: number; end: number }) => windows.push(w), onSaveImage: (d: string) => saved.push(d) }))
    await flush()
    await wait(200)
    const c = m.container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    const click = (x: number, y: number) => c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + y }))
    const ink = (): string => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).join(',')
    // Tools right-aligned 25px apart: dataZoom, back, dataView, line, bar, stack, restore, saveAsImage.
    const at = (k: number) => 390.5 - 25 * (7 - k)
    const base = ink()
    click(at(3), 9)
    await flush()
    expect(ink()).not.toBe(base)
    click(at(6), 9)
    await flush()
    expect(ink()).toBe(base)
    // The box zoom: select mode, a drag over the plot, then back.
    click(at(0), 9)
    await flush()
    const fire = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + 140, pointerId: 5 }))
    fire('pointerdown', 120)
    fire('pointermove', 180)
    fire('pointermove', 240)
    fire('pointerup', 240)
    click(240, 140)
    await flush()
    const zoomed = windows[windows.length - 1]!
    expect(zoomed.end - zoomed.start).toBeLessThan(80)
    click(at(1), 9)
    await flush()
    expect(windows[windows.length - 1]).toEqual({ start: 0, end: 100 })
    click(at(2), 9)
    await flush()
    const view = m.container.querySelector('[data-pyreon-dataview]')!
    expect(view.querySelectorAll('tbody tr')).toHaveLength(10)
    click(at(7), 9)
    await flush()
    expect(saved[0]!.startsWith('data:image/png')).toBe(true)
    m.unmount()
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
