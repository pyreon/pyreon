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
    expect(container.querySelector('canvas')!.style.display).toBe('none')
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
    const c = container.querySelector('canvas')!
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
