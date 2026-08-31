import { describe, expect, it } from 'vitest'
import { ohlcExtent, renderCandles } from './candlestick'
import type { Ohlc } from './candlestick'
import type { Rect } from './types'

const PLOT: Rect = { x: 0, y: 0, w: 100, h: 100 }

const CANDLES: Ohlc[] = [
  { open: 10, high: 20, low: 5, close: 15 },   // up
  { open: 15, high: 18, low: 8, close: 9 },    // down
]

describe('ohlcExtent', () => {
  it('spans the lowest low to the highest high', () => {
    expect(ohlcExtent(CANDLES)).toEqual({ min: 5, max: 20 })
  })
  it('degenerates safely for empty and flat inputs', () => {
    expect(ohlcExtent([])).toEqual({ min: 0, max: 1 })
    const flat = ohlcExtent([{ open: 7, high: 7, low: 7, close: 7 }])
    expect(flat.max).toBeGreaterThan(flat.min)
  })
})

describe('renderCandles', () => {
  const domain = { min: 0, max: 20 }

  it('emits a wick FIRST and the body over it, per candle', () => {
    const cmds = renderCandles(CANDLES, PLOT, domain)
    expect(cmds).toHaveLength(4)
    expect(cmds[0]!.kind).toBe('line')
    expect(cmds[1]!.kind).toBe('rect')
    // The wick spans high..low at the candle's centre.
    if (cmds[0]!.kind !== 'line') throw new Error('wick')
    expect(cmds[0]!.from.x).toBeCloseTo(cmds[0]!.to.x, 5)
  })

  it('colors direction by close vs open — the near-universal convention', () => {
    const cmds = renderCandles(CANDLES, PLOT, domain, { upColor: '#0f0', downColor: '#f00' })
    if (cmds[1]!.kind !== 'rect' || cmds[3]!.kind !== 'rect') throw new Error('bodies')
    expect(cmds[1]!.fill).toBe('#0f0')
    expect(cmds[3]!.fill).toBe('#f00')
  })

  it('a DOJI keeps a visible 1px body — flat trading is a fact, not missing data', () => {
    const cmds = renderCandles([{ open: 10, high: 12, low: 8, close: 10 }], PLOT, domain)
    const body = cmds[1]!
    if (body.kind !== 'rect') throw new Error('body')
    expect(body.rect.h).toBe(1)
  })

  it('the body sits between open and close regardless of direction', () => {
    const cmds = renderCandles(CANDLES, PLOT, domain)
    const upBody = cmds[1]!
    if (upBody.kind !== 'rect') throw new Error('body')
    // Domain 0..20 over 100px: open 10 → y 50, close 15 → y 25.
    expect(upBody.rect.y).toBeCloseTo(25, 5)
    expect(upBody.rect.h).toBeCloseTo(25, 5)
  })

  it('clamps the width ratio rather than emitting zero or overlapping bodies', () => {
    const thin = renderCandles(CANDLES, PLOT, domain, { widthRatio: 0 })
    const wide = renderCandles(CANDLES, PLOT, domain, { widthRatio: 5 })
    if (thin[1]!.kind !== 'rect' || wide[1]!.kind !== 'rect') throw new Error('bodies')
    expect(thin[1]!.rect.w).toBeGreaterThan(0)
    expect(wide[1]!.rect.w).toBeLessThanOrEqual((PLOT.w / 2) * 0.9)
  })

  it('is empty for no candles', () => {
    expect(renderCandles([], PLOT, domain)).toHaveLength(0)
  })
})
