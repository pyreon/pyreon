/**
 * The option tooltip's default content against real ECharts, in real
 * Chromium: ECharts draws its tooltip as HTML on hover (never in its SSR
 * output), so the comparison mounts both, points both at the same datum, and
 * compares what the reader sees — the lines of text, the row swatches, and
 * the box's edge colour.
 */
import { describe, expect, it } from 'vitest'
import * as echarts from 'echarts'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

interface TipFacts { lines: string[]; swatches: string[]; edge: string }

const W = 400
const H = 300
const PALETTE = ['#5070dd', '#b6d634']

const swatchesOf = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('span')].filter((s) => s.style.borderRadius === '10px').map((s) => s.style.backgroundColor)
const linesOf = (el: HTMLElement): string[] => el.innerText.split('\n').map((l) => l.trim()).filter((l) => l !== '')

async function echartsTip(option: object, at: { seriesIndex: number; dataIndex: number }): Promise<TipFacts> {
  const host = document.createElement('div')
  host.style.cssText = `width:${W}px;height:${H}px;position:relative`
  document.body.appendChild(host)
  const chart = echarts.init(host, null, { renderer: 'canvas' })
  chart.setOption({ animation: false, color: PALETTE, ...option })
  chart.dispatchAction({ type: 'showTip', ...at })
  await new Promise((r) => setTimeout(r, 250))
  const box = [...host.querySelectorAll('div')].find((d) => d.style.position === 'absolute' && d.innerText.trim() !== '')!
  // Its arrow (an empty, absolutely placed div) carries no text.
  const facts = { lines: linesOf(box), swatches: swatchesOf(box), edge: box.style.borderColor }
  chart.dispose()
  host.remove()
  return facts
}

async function ourTip(option: object, x: number, y: number): Promise<TipFacts> {
  const { container } = mountInBrowser(h(OptionChart, { option: { animation: false, color: PALETTE, ...option } as EChartsOption, width: W, height: H }))
  await flush()
  const c = container.querySelector('canvas')!
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1 }))
  await flush()
  const box = container.querySelector('[data-pyreon-chart-tooltip]') as HTMLElement
  expect(box.style.display).toBe('block')
  return { lines: linesOf(box), swatches: swatchesOf(box), edge: box.style.borderColor }
}

const cartesian = (tooltip: object): object => ({
  tooltip,
  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
  yAxis: { type: 'value' },
  series: [{ name: 'Sales', type: 'bar', data: [120, 2000, 150] }, { name: 'Cost', type: 'line', data: [80, 90, 1234.5] }],
})

describe('ECharts differential: tooltip content (real browser)', () => {
  // Tue's bar: ECharts' grid puts it in the second of three bands; the pointer sits well inside it.
  const tueX = W * 0.15 + (W * 0.75) / 3 * 1.5
  const inBar = H - 80 - 20

  it('item: the series name, then a row of swatch, datum name and comma-grouped value', async () => {
    const e = await echartsTip(cartesian({ trigger: 'item' }), { seriesIndex: 0, dataIndex: 1 })
    const u = await ourTip(cartesian({ trigger: 'item' }), tueX, inBar)
    expect(u.lines).toEqual(e.lines)
    expect(u.swatches).toEqual(e.swatches)
    expect(u.edge).toBe(e.edge)
  })

  it('axis: the category, then one row per series', async () => {
    const e = await echartsTip(cartesian({ trigger: 'axis' }), { seriesIndex: 0, dataIndex: 1 })
    const u = await ourTip(cartesian({ trigger: 'axis' }), tueX, inBar)
    expect(u.lines).toEqual(e.lines)
    expect(u.swatches).toEqual(e.swatches)
    expect(u.edge).toBe(e.edge)
  })

  it('a fractional value keeps its decimals while its thousands group', async () => {
    const wedX = W * 0.15 + (W * 0.75) / 3 * 2.5
    const e = await echartsTip(cartesian({ trigger: 'axis' }), { seriesIndex: 1, dataIndex: 2 })
    const u = await ourTip(cartesian({ trigger: 'axis' }), wedX, inBar)
    expect(u.lines).toEqual(e.lines)
  })

  it('a pie item: the series name, then the slice', async () => {
    const pie = { tooltip: { trigger: 'item' }, series: [{ name: 'Share', type: 'pie', data: [{ name: 'A', value: 3 }, { name: 'B', value: 5000 }] }] }
    const e = await echartsTip(pie, { seriesIndex: 0, dataIndex: 1 })
    // B runs from 135° to 360° clockwise from 12 o'clock; point at its middle, inside the 50% radius.
    const a = ((135 + 360) / 2) * (Math.PI / 180)
    const u = await ourTip(pie, W / 2 + Math.sin(a) * 40, H / 2 - Math.cos(a) * 40)
    expect(u.lines).toEqual(e.lines)
    expect(u.swatches).toEqual(e.swatches)
    expect(u.edge).toBe(e.edge)
  })

  it('valueFormatter shapes every value', async () => {
    const tip = { trigger: 'axis', valueFormatter: (v: number) => `$${v}` }
    const e = await echartsTip(cartesian(tip), { seriesIndex: 0, dataIndex: 1 })
    const u = await ourTip(cartesian(tip), tueX, inBar)
    expect(u.lines).toEqual(e.lines)
  })
})
