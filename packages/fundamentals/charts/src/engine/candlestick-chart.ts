// The candlestick chart's whole frame — price domain, cartesian layout, grid,
// tick labels and the candles — as pure geometry, so the web host and the
// native canvas paint the SAME command list from the same inputs.

import { hitCandle, ohlcExtent, renderCandles } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { computeLayout } from './layout'
import type { LayoutConfig, PlotLayout } from './layout'
import type { ChartTheme } from './render'
import { niceDomain } from './scale'
import type { Domain, Double, DrawCmd, MeasureText } from './types'

export interface CandlestickFrame {
  candles: Ohlc[]
  domain: Domain
  layout: PlotLayout
}

/**
 * Candles + layout for a given size — shared by the draw and the hit test, so
 * a hit can never disagree with what was painted. The price domain is niced
 * so the axis lands on readable ticks; the extent alone puts the top tick at
 * e.g. 197.3. `categories` (one per candle, or empty) label the x axis.
 */
export function candlestickFrame(
  candles: Ohlc[],
  w: Double,
  h: Double,
  categories: string[],
  fontSize: Double,
  measure: MeasureText,
): CandlestickFrame {
  const domain = niceDomain(ohlcExtent(candles), 5.0)
  const n = candles.length
  const cfg: LayoutConfig = {
    width: w,
    height: h,
    xDomain: { min: 0.0, max: n > 1 ? n - 1 : 1.0 },
    yDomain: domain,
    categories,
    fontSize,
    xTickCount: 5.0,
    yTickCount: 5.0,
    showXAxis: true,
    showYAxis: true,
  }
  const layout = computeLayout(cfg, measure)
  return { candles, domain, layout }
}

/** Grid lines, y tick labels, x tick labels, then the candles — painter's order. */
export function renderCandlestickChart(
  candles: Ohlc[],
  w: Double,
  h: Double,
  categories: string[],
  theme: ChartTheme,
  options: CandleOptions | undefined,
  measure: MeasureText,
): DrawCmd[] {
  const f = candlestickFrame(candles, w, h, categories, theme.fontSize, measure)
  const l = f.layout
  const cmds: DrawCmd[] = []
  for (const tick of l.yTicks) {
    cmds.push({
      kind: 'line',
      from: { x: l.plot.x, y: tick.pos },
      to: { x: l.plot.x + l.plot.w, y: tick.pos },
      stroke: theme.grid,
      width: 1.0,
    })
    cmds.push({
      kind: 'text',
      text: tick.label,
      at: { x: l.plot.x - 6.0, y: tick.pos },
      fill: theme.label,
      size: theme.fontSize,
      align: 'end',
      baseline: 'middle',
    })
  }
  for (const tick of l.xTicks) {
    cmds.push({
      kind: 'text',
      text: tick.label,
      at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 },
      fill: theme.label,
      size: theme.fontSize,
      align: 'middle',
      baseline: 'top',
    })
  }
  const body = renderCandles(candles, l.plot, f.domain, options)
  for (const c of body) cmds.push(c)
  return cmds
}

/** The candle index under (px, py) for the same frame the chart painted, or -1. */
export function hitCandlestickChart(
  candles: Ohlc[],
  w: Double,
  h: Double,
  categories: string[],
  fontSize: Double,
  measure: MeasureText,
  px: Double,
  py: Double,
): number {
  const f = candlestickFrame(candles, w, h, categories, fontSize, measure)
  return hitCandle(candles.length, f.layout.plot, px, py)
}
