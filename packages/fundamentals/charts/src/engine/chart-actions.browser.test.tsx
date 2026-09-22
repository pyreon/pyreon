import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars } from './marks'
import { PlotChart } from './Chart'
import { OptionChart } from './OptionChart'
import { createChartHandle } from './link'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
type Sel = { seriesIndex: number; dataIndex: number[] }[]
const alpha = (c: HTMLCanvasElement): number => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) n += d[i]!
  return n
}

describe('dispatch — brush and timeline actions (real browser)', () => {
  it('PlotChart: a dispatched brush dims and reports, takeGlobalCursor arms a drag, restore clears', async () => {
    const handle = createChartHandle()
    const got: Sel[] = []
    const rows = Array.from({ length: 8 }, (_, i) => ({ v: i + 2 }))
    const { container } = mountInBrowser(() => PlotChart({ data: rows, marks: [bars((d: { v: number }) => d.v)], width: 400, height: 220, animate: false, handle, onBrushSelected: (s) => got.push(s) }))
    await flush()
    const c = container.querySelector('canvas')!
    const plain = alpha(c)
    // A lineX area over the right half of the plot.
    handle.dispatch({ type: 'brush', areas: [{ type: 'lineX', points: [{ x: 200, y: 0 }, { x: 400, y: 220 }] }] })
    await flush()
    const sel = got[got.length - 1]!
    expect(sel[0]!.dataIndex.length).toBeGreaterThan(0)
    expect(sel[0]!.dataIndex.length).toBeLessThan(rows.length)
    expect(alpha(c)).toBeLessThan(plain)
    // Nothing is armed, so a drag brushes nothing; takeGlobalCursor arms it.
    expect(handle.brushType()).toBe('')
    handle.dispatch({ type: 'takeGlobalCursor', brushType: 'rect' })
    expect(handle.brushType()).toBe('rect')
    const r = c.getBoundingClientRect()
    const fire = (type: string, x: number, y: number) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 2 }))
    fire('pointerdown', 40, 5)
    fire('pointermove', 100, 100)
    fire('pointermove', 150, 215)
    fire('pointerup', 150, 215)
    await flush()
    expect(handle.brushAreas()).toHaveLength(1)
    expect(handle.brushAreas()[0]!.type).toBe('rect')
    handle.dispatch({ type: 'restore' })
    await flush()
    expect(got[got.length - 1]).toEqual([{ seriesIndex: 0, dataIndex: [] }])
    expect(alpha(c)).toBe(plain)
  })

  it('OptionChart: timelineChange moves the step, dataZoom the window, select pins', async () => {
    const handle = createChartHandle()
    const steps: number[] = []
    const option: EChartsOption = {
      animation: false,
      baseOption: { timeline: { data: ['a', 'b', 'c'] }, xAxis: { type: 'category', data: ['x', 'y', 'z'] }, yAxis: { min: 0, max: 10 }, series: [{ type: 'bar' }] },
      options: [{ series: [{ data: [1, 1, 1] }] }, { series: [{ data: [5, 5, 5] }] }, { series: [{ data: [9, 9, 9] }] }],
    }
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 260, handle, onTimelineChange: (i: number) => steps.push(i) }))
    await flush()
    await wait(150)
    const c = m.container.querySelector('canvas')!
    const first = alpha(c)
    handle.dispatch({ type: 'timelineChange', index: 2 })
    await flush()
    await wait(50)
    expect(handle.step()).toBe(2)
    expect(alpha(c)).toBeGreaterThan(first)
    handle.dispatch({ type: 'timelinePlayChange', playing: false })
    expect(handle.playing()).toBe(false)
    handle.dispatch({ type: 'select', index: 1 })
    expect(handle.selected()).toEqual([1])
  })
})
