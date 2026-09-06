// `<CandlestickChart>` — OHLC candles on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { hitCandle, ohlcExtent } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { candlestickFrame, renderCandlestickChart } from './candlestick-chart'
import { plain } from './format'
import type { Formatter } from './format'
import type { Double, MeasureText, Rect } from './types'

export interface CandlestickChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  open: (d: T, index: number) => Double
  high: (d: T, index: number) => Double
  low: (d: T, index: number) => Double
  close: (d: T, index: number) => Double
  /** Period label per datum, shown on the x axis. */
  x?: (d: T, index: number) => string
  candle?: CandleOptions
  /** Formats prices in the tooltip. */
  format?: Formatter
  /** Fired with the candle index under the click, or -1 for a miss. */
  onSelect?: (index: number) => void
  /** The engine's INDEX hit — identical to `onSelect` here; the multiplatform-safe name every host carries. */
  onSelectIndex?: (index: number) => void
}

interface Geometry { rows: unknown[]; candles: Ohlc[]; plot: Rect; box: Rect; categories: string[] }

export function CandlestickChart<T>(props: CandlestickChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const toCandles = (rows: T[]): Ohlc[] => rows.map((d, i) => ({ open: props.open(d, i), high: props.high(d, i), low: props.low(d, i), close: props.close(d, i) }))
  const categoriesOf = (rows: T[]): string[] => (props.x !== undefined ? rows.map((d, i) => props.x!(d, i)) : [])
  const hitAt = (g: Geometry, px: Double, py: Double): number => hitCandle(g.candles.length, g.plot, px - g.box.x, py - g.box.y)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 200,
    caption: 'Candlestick data',
    track: () => {
      readData()
    },
    layout: (box, measure: MeasureText, theme) => {
      const rows = readData()
      const candles = toCandles(rows)
      const categories = categoriesOf(rows)
      return { rows, candles, categories, box, plot: candlestickFrame(candles, box.w, box.h, categories, theme.fontSize, measure).layout.plot }
    },
    render: (g, measure, theme) => shiftCmds(renderCandlestickChart(g.candles, g.box.w, g.box.h, g.categories, theme, props.candle ?? {}, measure), g.box.x, g.box.y),
    select: (g, px, py) => {
      const i = hitAt(g, px, py)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    tooltip: (g, px, py) => {
      const idx = hitAt(g, px, py)
      const c = g.candles[idx]
      if (c === undefined) return null
      const fmt = props.format ?? plain
      const label = g.categories[idx] ?? `#${idx + 1}`
      return [label, `O ${fmt(c.open)}`, `H ${fmt(c.high)}`, `L ${fmt(c.low)}`, `C ${fmt(c.close)}`]
    },
    describe: (g) => {
      const title = props.title ?? 'Candlestick chart'
      if (g.candles.length === 0) return `${title}: no data.`
      const ext = ohlcExtent(g.candles)
      const last = g.candles[g.candles.length - 1]!
      return `${title}: ${g.candles.length} periods, range ${ext.min} to ${ext.max}, last close ${last.close}.`
    },
    a11y: (g) => {
      return {
        title: props.title,
        categories: g.categories.length > 0 ? g.categories : g.candles.map((_, i) => `#${i + 1}`),
        series: [
          { label: 'Open', values: g.candles.map((c) => c.open), kind: 'points' },
          { label: 'Close', values: g.candles.map((c) => c.close), kind: 'points' },
        ],
        format: props.format,
      }
    },
  })
}
