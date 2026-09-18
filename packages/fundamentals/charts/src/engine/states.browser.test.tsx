import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars } from './marks'
import { PlotChart } from './Chart'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
interface Row { a: number; b: number }
const ROWS: Row[] = [{ a: 6, b: 2 }, { a: 5, b: 3 }, { a: 4, b: 4 }]
describe('states (real browser)', () => {
  it('selectedMode "series" outlines every datum of the series a click lands on, and a second click clears it', async () => {
    const picks: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: ROWS,
        marks: [bars((d) => d.a, { color: '#ff0000' }), bars((d) => d.b, { color: '#00ff00' })],
        width: 400,
        height: 220,
        animate: false,
        selectedMode: 'series',
        onSelectIndex: (i) => picks.push(i),
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    // A whole-series pin outlines every bar of the series — no per-mark select colour to author on
    // PlotChart (that lives on the ECharts-shaped option layer), so the outline is the signal here.
    const outlineInk = (): number => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
      return n
    }
    const before = outlineInk()
    const r = c.getBoundingClientRect()
    const click = (x: number, y: number) => c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + y }))
    // The first series' first bar: left of centre, near the floor.
    click(60, 180)
    await flush()
    const after = outlineInk()
    expect(after).toBeGreaterThan(before)
    expect(picks.length).toBeGreaterThan(0)
    click(60, 180)
    await flush()
    expect(outlineInk()).toBe(before)
  })

  it('OptionChart: emphasis.label prints on the highlighted datum and emphasis.scale grows its symbol', async () => {
    const option: EChartsOption = {
      animation: false,
      xAxis: { type: 'category', data: ['a', 'b', 'c'] },
      yAxis: { min: 0, max: 40 },
      series: [{ type: 'scatter', data: [11, 23, 37], emphasis: { label: { show: true }, scale: 3 } }],
    }
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 240, crosshair: true }))
    await flush()
    await wait(120)
    const c = m.container.querySelector('canvas')!
    const ink = (): number => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
      return n
    }
    const plain = ink()
    const r = c.getBoundingClientRect()
    // Hover the middle datum: its label appears and its symbol grows, so more pixels carry ink.
    c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 200, clientY: r.top + 120, pointerId: 1 }))
    await flush()
    await wait(60)
    expect(ink()).toBeGreaterThan(plain)
  })
})
