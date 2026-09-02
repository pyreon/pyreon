import { describe, expect, it } from 'vitest'
import { candlestickFrame, hitCandlestickChart, renderCandlestickChart } from './candlestick-chart'
import type { Ohlc } from './candlestick'
import type { DrawCmd } from './types'
import { defaultTheme } from './render'
import { measureApprox } from './svg'

const CANDLES: Ohlc[] = [
  { open: 10, high: 20, low: 5, close: 15 },
  { open: 15, high: 18, low: 8, close: 9 },
  { open: 9, high: 14, low: 7, close: 12 },
]
const measure = measureApprox()
const texts = (cs: DrawCmd[]) => cs.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')
const rects = (cs: DrawCmd[]) => cs.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')

describe('candlestickFrame', () => {
  it('nices the price domain and lays the plot out with one band per candle', () => {
    const f = candlestickFrame(CANDLES, 300, 160, ['Mon', 'Tue', 'Wed'], 11, measure)
    expect(f.candles).toBe(CANDLES)
    expect(f.domain.min).toBeLessThanOrEqual(5)
    expect(f.domain.max).toBeGreaterThanOrEqual(20)
    expect(f.layout.plot.w).toBeGreaterThan(0)
    expect(f.layout.plot.h).toBeGreaterThan(0)
    expect(f.layout.xTicks.map((t) => t.label)).toEqual(['Mon', 'Tue', 'Wed'])
    expect(f.layout.yTicks.length).toBeGreaterThan(1)
  })
  it('a single candle still gets a one-unit x domain, and no categories means numeric x ticks', () => {
    const f = candlestickFrame([CANDLES[0]!], 200, 100, [], 11, measure)
    expect(f.layout.xDomainUsed.min).toBe(0)
    expect(f.layout.xDomainUsed.max).toBe(1)
    expect(f.layout.xTicks.length).toBeGreaterThan(0)
  })
})

describe('renderCandlestickChart', () => {
  it('paints the grid, the y labels, the x labels and then the candles in painter order', () => {
    const cmds = renderCandlestickChart(CANDLES, 300, 160, ['Mon', 'Tue', 'Wed'], defaultTheme, undefined, measure)
    const kinds = cmds.map((c) => c.kind)
    const firstCandle = kinds.findIndex((k) => k === 'rect')
    expect(firstCandle).toBeGreaterThan(0)
    // Everything before the first candle body is frame: grid lines and labels.
    expect(new Set(kinds.slice(0, firstCandle))).toEqual(new Set(['line', 'text']))
    const xLabels = texts(cmds).filter((c) => c.baseline === 'top').map((c) => c.text)
    expect(xLabels).toEqual(['Mon', 'Tue', 'Wed'])
    const yLabels = texts(cmds).filter((c) => c.align === 'end')
    expect(yLabels.length).toBeGreaterThan(1)
    for (const t of yLabels) expect(t.fill).toBe(defaultTheme.label)
  })
  it('honors candle options through to the bodies', () => {
    const cmds = renderCandlestickChart(CANDLES, 300, 160, [], defaultTheme, { upColor: '#0a0', downColor: '#a00' }, measure)
    const fills = new Set(rects(cmds).map((c) => c.fill))
    expect(fills.has('#0a0')).toBe(true)
    expect(fills.has('#a00')).toBe(true)
  })
})

describe('hitCandlestickChart', () => {
  it('reports the band under the pointer, and -1 outside the plot', () => {
    const f = candlestickFrame(CANDLES, 300, 160, [], 11, measure)
    const p = f.layout.plot
    const band = p.w / 3
    expect(hitCandlestickChart(CANDLES, 300, 160, [], 11, measure, p.x + band * 0.5, p.y + p.h / 2)).toBe(0)
    expect(hitCandlestickChart(CANDLES, 300, 160, [], 11, measure, p.x + band * 2.5, p.y + p.h / 2)).toBe(2)
    expect(hitCandlestickChart(CANDLES, 300, 160, [], 11, measure, p.x - 5, p.y + p.h / 2)).toBe(-1)
    expect(hitCandlestickChart(CANDLES, 300, 160, [], 11, measure, p.x + 5, p.y + p.h + 5)).toBe(-1)
  })
  it('an empty series is always a miss', () => {
    expect(hitCandlestickChart([], 300, 160, [], 11, measure, 100, 80)).toBe(-1)
  })
})
