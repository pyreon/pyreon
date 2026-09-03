// Candlestick geometry — open/high/low/close per period.
//
// Pure functions to flat commands, like everything else here. A candle is a
// BODY rect between open and close plus a WICK line to the high and low —
// two primitives every backend already executes, which is what keeps the
// finance family free on native: this file is written in the native subset
// and BUNDLED into the generated Swift/Kotlin engine.

import { scaleLinear } from './scale'
import type { Domain, Double, DrawCmd, Rect } from './types'

/** One period's prices. */
export interface Ohlc {
  open: Double
  high: Double
  low: Double
  close: Double
}

export interface CandleOptions {
  /** Fill for a period that closed ABOVE its open. */
  upColor?: string | undefined
  /** Fill for a period that closed BELOW its open. */
  downColor?: string | undefined
  /** Body width as a fraction of the band, clamped to 0.05..0.9. */
  widthRatio?: Double | undefined
}

/** The price extent across every period — the y domain a candle chart wants. */
export function ohlcExtent(candles: Ohlc[]): Domain {
  if (candles.length === 0) return { min: 0.0, max: 1.0 }
  let lo = candles[0]!.low
  let hi = candles[0]!.high
  for (const c of candles) {
    if (c.low < lo) lo = c.low
    if (c.high > hi) hi = c.high
  }
  if (hi <= lo) return { min: lo - 1.0, max: lo + 1.0 }
  return { min: lo, max: hi }
}

/**
 * Render candles into the plot rect.
 *
 * Direction is encoded by COLOR, decided by close vs open — up periods green,
 * down periods red by default (the near-universal convention; both
 * overridable). A DOJI (open == close) still gets a visible body: a 1px sliver
 * rather than nothing, because a period that traded flat is a fact, and a
 * missing candle reads as missing data. The wick is drawn FIRST so the body
 * sits over it — a wick line crossing the body's fill reads as an artifact.
 */
export function renderCandles(
  candles: Ohlc[],
  plot: Rect,
  domain: Domain,
  // Optional rather than defaulted to `{}`: an empty-object-literal default
  // has no native lowering, and the optional-chained reads below are the
  // same contract. This is what lets the finance family join the generated
  // Swift/Kotlin engine.
  options?: CandleOptions,
): DrawCmd[] {
  const up = options?.upColor ?? '#15803d'
  const down = options?.downColor ?? '#b42318'
  const rawRatio = options?.widthRatio ?? 0.6
  const ratio = rawRatio < 0.05 ? 0.05 : rawRatio > 0.9 ? 0.9 : rawRatio
  const out: DrawCmd[] = []
  const n = candles.length
  if (n === 0) return out
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const band = plot.w / nF
  const bw = band * ratio
  const y0 = plot.y + plot.h
  let iF = 0.0
  for (let i = 0; i < n; i++) {
    const c = candles[i]!
    const cx = plot.x + band * iF + band / 2.0
    const color = c.close >= c.open ? up : down
    // Wick first, body over it.
    out.push({ kind: 'line', from: { x: cx, y: scaleLinear(domain, y0, plot.y, c.high) }, to: { x: cx, y: scaleLinear(domain, y0, plot.y, c.low) }, stroke: color, width: 1.0 })
    const yo = scaleLinear(domain, y0, plot.y, c.open)
    const yc = scaleLinear(domain, y0, plot.y, c.close)
    const top = yo < yc ? yo : yc
    const rawH = yc - yo
    const h = rawH < 0.0 ? -rawH : rawH
    out.push({ kind: 'rect', rect: { x: cx - bw / 2.0, y: top, w: bw, h: h < 1.0 ? 1.0 : h }, fill: color })
    iF = iF + 1.0
  }
  return out
}

/**
 * The candle band index under the pointer, or -1 for a miss.
 *
 * The FULL column counts, not just the body: a wick is one pixel wide and a
 * doji body is one pixel tall, so asking the pointer to land on the drawn ink
 * would make selection a game of skill. A column is unambiguous — bands
 * partition the plot.
 */
export function hitCandle(count: number, plot: Rect, px: Double, py: Double): number {
  if (count <= 0) return -1
  if (px < plot.x || px > plot.x + plot.w) return -1
  if (py < plot.y || py > plot.y + plot.h) return -1
  const band = plot.w / count
  // Integer floor by scanning (Math.floor lowers to a Double natively).
  const target = (px - plot.x) / band
  let i = 0
  let jf = 0.0
  for (let j = 0; j < count; j++) {
    if (jf <= target) i = j
    jf = jf + 1.0
  }
  return i
}
