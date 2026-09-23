// A 120-day candlestick option, as the docs gallery renders it. Its x labels
// drew one per candle, on top of each other, because the renderer ignored the
// thinning its own layout computed; and its `dataZoom` was dropped, so a chart
// meant to open on its latest stretch opened on all of it.
import { describe, expect, it } from 'vitest'
import { renderCandlestickChart } from './candlestick-chart'
import { compileFamily } from './option-family'
import { defaultTheme } from './render'
import type { Ohlc } from './candlestick'

const N = 120
const days = Array.from({ length: N }, (_, i) => `D${i + 1}`)
const candles: Ohlc[] = Array.from({ length: N }, (_, i) => ({ open: 100 + i, close: 101 + i, low: 99 + i, high: 102 + i }))
const measure = (t: string, s: number): number => t.length * s * 0.6

describe('candlestick x labels follow the layout', () => {
  it('120 categories draw only the labels that fit', () => {
    const cmds = renderCandlestickChart(candles, 640, 340, days, defaultTheme, undefined, measure)
    const labels = cmds.filter((c) => c.kind === 'text' && /^D\d+$/.test(c.text))
    expect(labels.length).toBeGreaterThan(3)
    // The layout slants them and keeps about one per 1.3 font heights — ~40 at this width, not 120.
    expect(labels.length).toBeLessThanOrEqual(45)
  })

  it('a few categories still draw every label', () => {
    const cmds = renderCandlestickChart(candles.slice(0, 5), 640, 340, days.slice(0, 5), defaultTheme, undefined, measure)
    expect(cmds.filter((c) => c.kind === 'text' && /^D\d+$/.test(c.text))).toHaveLength(5)
  })
})

describe("a candlestick option's dataZoom", () => {
  const option = (zoom: unknown) => ({
    xAxis: { type: 'category', data: days },
    yAxis: { type: 'value', scale: true },
    ...(zoom === undefined ? {} : { dataZoom: zoom }),
    series: [{ type: 'candlestick', data: candles.map((c) => [c.open, c.close, c.low, c.high]) }],
  })
  const rowsOf = (o: unknown) => {
    const f = compileFamily(o as never)
    if (f === null || f.plan.kind !== 'candlestick') throw new Error('not a candlestick plan')
    return { rows: f.plan.rows, warnings: f.warnings.map((w) => w.message) }
  }

  it('opens on the window it sets', () => {
    const { rows } = rowsOf(option([{ type: 'inside', start: 50, end: 100 }]))
    expect(rows).toHaveLength(60)
    expect(rows[0]!.x).toBe('D61')
    expect(rows[59]!.x).toBe('D120')
  })

  it('says the slider and gestures are not drawn, instead of calling dataZoom ignored', () => {
    const { warnings } = rowsOf(option([{ type: 'slider', start: 50, end: 100 }]))
    expect(warnings.some((m) => m.includes('opening window'))).toBe(true)
    expect(warnings.some((m) => m.includes('"dataZoom" has no mapping'))).toBe(false)
  })

  it('without one, every candle is drawn', () => {
    expect(rowsOf(option(undefined)).rows).toHaveLength(N)
  })
})
