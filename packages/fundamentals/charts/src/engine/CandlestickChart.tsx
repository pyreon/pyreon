// `<CandlestickChart>` — OHLC candles on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { hitCandle, ohlcExtent } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { candlestickFrame, renderCandlestickChart } from './candlestick-chart'
import { groupThousands } from './format'
import type { Formatter } from './format'
import { navigatorDrag, navigatorHit } from './navigator'
import { renderSliderZoom, sliderRect } from './slider-zoom'
import type { DrawCmd, Double, MeasureText, Rect } from './types'
import { panWindow, sliceRange, zoomWindow } from './zoom'
import type { ZoomWindow } from './zoom'

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
  /**
   * Zoom over the candles: the window opens where it says, `slider` draws a
   * strip under the plot (drag the band or a handle), and `inside` zooms on
   * the wheel and pans on a drag inside the plot. Indices reported by
   * `onSelect` stay GLOBAL (into `data`).
   */
  zoom?: CandlestickZoom | undefined
}

/** How `<CandlestickChart zoom>` zooms. Every field is optional. */
export interface CandlestickZoom {
  /** Wheel / pinch zoom and drag pan inside the plot. Default `true`. */
  inside?: boolean | undefined
  /** The navigator strip under the plot. Default `true`. */
  slider?: boolean | undefined
  /** The initial window, as fractions of the data. Default the whole range. */
  window?: ZoomWindow | undefined
  /** The span is fixed; the window only pans. Default `false`. */
  lock?: boolean | undefined
  /** The smallest and largest span, as fractions. Default `0` and `1`. */
  minSpan?: Double | undefined
  maxSpan?: Double | undefined
}

interface ResolvedZoom {
  inside: boolean
  slider: boolean
  window: ZoomWindow
  lock: boolean
  minSpan: Double
  maxSpan: Double
}

const resolveZoom = (z: CandlestickZoom | undefined): ResolvedZoom | undefined =>
  z === undefined
    ? undefined
    : {
        inside: z.inside ?? true,
        slider: z.slider ?? true,
        window: z.window ?? { start: 0.0, end: 1.0 },
        lock: z.lock ?? false,
        minSpan: z.minSpan ?? 0.0,
        maxSpan: z.maxSpan ?? 1.0,
      }

interface Geometry {
  rows: unknown[]
  candles: Ohlc[]
  plot: Rect
  box: Rect
  categories: string[]
  /** The first shown row's index into the data (the zoom window's start). */
  offset: number
  /** Every row's close, for the slider's data shadow. */
  allCloses: Double[]
  /** The slider strip, in canvas coordinates; null without a slider. */
  strip: Rect | null
  win: ZoomWindow
}

/** What the slider takes off the bottom of the chart: its 30px strip, the 15px edge gap and the 7px move handle. */
const SLIDER_BAND = 52.0
const NO_LENGTH = { mode: '', amount: 0.0 }

export function CandlestickChart<T>(props: CandlestickChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const toCandles = (rows: T[]): Ohlc[] => rows.map((d, i) => ({ open: props.open(d, i), high: props.high(d, i), low: props.low(d, i), close: props.close(d, i) }))
  const categoriesOf = (rows: T[]): string[] => (props.x !== undefined ? rows.map((d, i) => props.x!(d, i)) : [])
  const hitAt = (g: Geometry, px: Double, py: Double): number => hitCandle(g.candles.length, g.plot, px - g.box.x, py - g.box.y)
  const zoom = resolveZoom(props.zoom)
  const win = signal<ZoomWindow>(zoom?.window ?? { start: 0.0, end: 1.0 })
  // The drag the slider owns: what was grabbed (band / handle), where, and the window it started on.
  let grab: { kind: number; x: Double; from: ZoomWindow } | null = null
  // The last drawn frame — the plot an inside wheel / pan measures against.
  let lastFrame: Geometry | null = null
  const limit = (next: ZoomWindow): ZoomWindow => {
    if (zoom === undefined) return next
    const span = next.end - next.start
    if (span < zoom.minSpan || span > zoom.maxSpan) return win.peek()
    return next
  }
  return canvasHost<Geometry>({
    props,
    defaultHeight: 200,
    caption: 'Candlestick data',
    track: () => {
      readData()
      win()
    },
    layout: (box, measure: MeasureText, theme) => {
      const all = readData()
      const w = win()
      const range = zoom === undefined ? { from: 0, to: all.length } : sliceRange(w, all.length)
      const rows = all.slice(range.from, range.to)
      const candles = toCandles(rows)
      const categories = categoriesOf(rows)
      // The slider takes its band off the bottom; the candles lay out above it.
      const chartH = zoom?.slider === true ? Math.max(0.0, box.h - SLIDER_BAND) : box.h
      const plot = candlestickFrame(candles, box.w, chartH, categories, theme.fontSize, measure).layout.plot
      const strip =
        zoom?.slider === true
          ? (() => {
              const r = sliderRect({ left: NO_LENGTH, top: NO_LENGTH, right: NO_LENGTH, bottom: NO_LENGTH, width: NO_LENGTH, height: NO_LENGTH, brush: true }, plot, box.w, box.h)
              return { x: r.x + box.x, y: r.y + box.y, w: r.w, h: r.h }
            })()
          : null
      const allCloses = zoom?.slider === true ? toCandles(all).map((c) => c.close) : []
      return { rows, candles, categories, box: { x: box.x, y: box.y, w: box.w, h: chartH }, plot, offset: range.from, allCloses, strip, win: w }
    },
    render: (g, measure, theme) => {
      lastFrame = g
      const cmds: DrawCmd[] = shiftCmds(renderCandlestickChart(g.candles, g.box.w, g.box.h, g.categories, theme, props.candle ?? {}, measure), g.box.x, g.box.y)
      if (g.strip !== null) for (const c of renderSliderZoom(g.allCloses, g.win, g.strip, true)) cmds.push(c)
      return cmds
    },
    drag:
      zoom?.slider === true
        ? {
            start: (g, px, py) => {
              const r = g.strip
              // The move handle rides above the strip; pressing it drags the window, as in ECharts.
              if (r === null || px < r.x - 8.0 || px > r.x + r.w + 8.0 || py < r.y - 8.0 || py > r.y + r.h + 4.0) return false
              grab = { kind: navigatorHit(r, g.win, px), x: px, from: g.win }
              return true
            },
            move: (g, px) => {
              const r = g.strip
              if (grab === null || r === null || r.w <= 0.0) return
              if (zoom.lock && grab.kind !== 1) return
              win.set(limit(navigatorDrag(grab.kind, grab.from, (px - grab.x) / r.w)))
            },
            end: () => {
              grab = null
            },
          }
        : undefined,
    roam:
      zoom?.inside === true
        ? {
            move: () => true,
            scale: () => !zoom.lock,
            zoom: (factor, px) => {
              const f = lastFrame
              if (f === null || f.plot.w <= 0.0) return
              win.set(limit(zoomWindow(win.peek(), 1.0 / factor, (px - f.box.x - f.plot.x) / f.plot.w)))
            },
            pan: (dx) => {
              const f = lastFrame
              if (f === null || f.plot.w <= 0.0) return
              win.set(panWindow(win.peek(), -dx / f.plot.w))
            },
          }
        : undefined,
    select: (g, px, py) => {
      const hit = hitAt(g, px, py)
      const i = hit < 0 ? hit : hit + g.offset
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    pick: (g, i) => {
      props.onSelect?.(i + g.offset)
      props.onSelectIndex?.(i + g.offset)
    },
    focusRect: (g, i) => {
      const n = g.candles.length
      if (i < 0 || i >= n) return null
      const bw = g.plot.w / n
      return { x: g.box.x + g.plot.x + bw * i, y: g.box.y + g.plot.y, w: bw, h: g.plot.h }
    },
    tooltip: (g, px, py) => {
      const idx = hitAt(g, px, py)
      const c = g.candles[idx]
      if (c === undefined) return null
      const fmt = props.format ?? groupThousands
      const label = g.categories[idx] ?? `#${idx + 1}`
      return [label, `O ${fmt(c.open)}`, `H ${fmt(c.high)}`, `L ${fmt(c.low)}`, `C ${fmt(c.close)}`]
    },
    // ECharts' candlestick datum: [open, close, lowest, highest].
    item: (g, px, py) => {
      const idx = hitAt(g, px, py)
      const c = g.candles[idx]
      if (c === undefined) return null
      return { seriesIndex: 0, dataIndex: idx + g.offset, name: g.categories[idx] ?? '', value: [c.open, c.close, c.low, c.high] }
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
