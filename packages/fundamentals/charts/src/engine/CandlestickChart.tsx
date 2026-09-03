// `<CandlestickChart>` — open/high/low/close per period.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { hitCandle, ohlcExtent } from './candlestick'
import { candlestickFrame, renderCandlestickChart } from './candlestick-chart'
import type { CandleOptions, Ohlc } from './candlestick'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { placeTooltip } from './tooltip'
import { plain } from './format'
import type { Formatter } from './format'
import type { Double, MeasureText } from './types'

const FONT = 'system-ui, sans-serif'

export interface CandlestickChartProps<T> {
  data: T[] | (() => T[])
  open: (d: T, index: number) => Double
  high: (d: T, index: number) => Double
  low: (d: T, index: number) => Double
  close: (d: T, index: number) => Double
  /** Period label per datum, shown on the x axis. */
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  class?: string
  title?: string
  candle?: CandleOptions
  /** Formats prices — the tooltip and nothing else reads it yet. */
  format?: Formatter
  /** Fired with the candle index on tap, or -1 for a miss. */
  onSelect?: (index: number) => void
  /**
   * OHLC tooltip following the pointer. Off by default for the same reason
   * as `PlotChart`'s: pointer handlers and a DOM overlay are dead weight in
   * a static report.
   */
  tooltip?: boolean
}

export function CandlestickChart<T>(props: CandlestickChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null
  let tip: HTMLDivElement | null = null

  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)

  /** The width the current layout would use — the handlers must agree with the draw. */
  const widthOf = (el: HTMLCanvasElement): Double => {
    const box = el.parentElement
    return props.width ?? ((box?.clientWidth ?? 0) > 0 ? box!.clientWidth : 300)
  }

  // Candles + layout for a given size — the SHARED engine frame, so the draw,
  // both pointer handlers and the native canvas can never disagree.
  const categoriesOf = (rows: T[]): string[] => (props.x !== undefined ? rows.map((d, i) => props.x!(d, i)) : [])
  const frameFor = (rows: T[], w: Double, hgt: Double, fontSize: Double, measure: MeasureText) =>
    candlestickFrame(toCandles(rows), w, hgt, categoriesOf(rows), fontSize, measure)
  const toCandles = (rows: T[]): Ohlc[] =>
    rows.map((d, i) => ({
      open: props.open(d, i),
      high: props.high(d, i),
      low: props.low(d, i),
      close: props.close(d, i),
    }))

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const box = el.parentElement
    const w = props.width ?? ((box?.clientWidth ?? 0) > 0 ? box!.clientWidth : 300)
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const t = { ...defaultTheme, ...props.theme }
    const rows = readData()
    const cmds = renderCandlestickChart(toCandles(rows), w, hgt, categoriesOf(rows), t, props.candle ?? {}, canvasMeasure(ctx, FONT))
    paint(ctx, cmds, w, hgt, FONT)
  }

  effect(() => {
    readData()
    draw()
  })

  const describe = (): string => {
    const candles = toCandles(readData())
    const title = props.title ?? 'Candlestick chart'
    if (candles.length === 0) return `${title}: no data.`
    const ext = ohlcExtent(candles)
    const last = candles[candles.length - 1]!
    return `${title}: ${candles.length} periods, range ${ext.min} to ${ext.max}, last close ${last.close}.`
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = widthOf(el)
    const hgt = props.height ?? 200
    const t = { ...defaultTheme, ...props.theme }
    const { candles, layout: l } = frameFor(readData(), w, hgt, t.fontSize, canvasMeasure(ctx, FONT))
    const r = el.getBoundingClientRect()
    cb(hitCandle(candles.length, l.plot, ev.clientX - r.left, ev.clientY - r.top))
  }

  const handleMove = (ev: MouseEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = widthOf(el)
    const hgt = props.height ?? 200
    const t = { ...defaultTheme, ...props.theme }
    const rows = readData()
    const { candles, layout: l } = frameFor(rows, w, hgt, t.fontSize, canvasMeasure(ctx, FONT))
    const r = el.getBoundingClientRect()
    const px = ev.clientX - r.left
    const py = ev.clientY - r.top
    const idx = hitCandle(candles.length, l.plot, px, py)
    if (idx < 0) {
      box.style.display = 'none'
      return
    }
    const c = candles[idx]!
    const fmt = props.format ?? plain
    const label = props.x !== undefined ? props.x(rows[idx]!, idx) : `#${idx + 1}`
    box.textContent = [
      label,
      `O ${fmt(c.open)}`,
      `H ${fmt(c.high)}`,
      `L ${fmt(c.low)}`,
      `C ${fmt(c.close)}`,
    ].join('\n')
    box.style.display = 'block'
    // Measure AFTER filling it — placement depends on the rendered size.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w, h: hgt }, 12)
    box.style.left = `${at.x}px`
    box.style.top = `${at.y}px`
  }

  const handleLeave = (): void => {
    if (tip !== null) tip.style.display = 'none'
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describe(),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
    ...(props.tooltip === true
      ? { onMouseMove: handleMove, onMouseLeave: handleLeave }
      : {}),
  })

  if (props.tooltip !== true) return canvasNode

  // Same overlay contract as PlotChart's tooltip, stable hook included.
  return h(
    'div',
    { style: 'position:relative' },
    canvasNode,
    h('div', {
      'data-pyreon-chart-tooltip': 'true',
      style:
        'position:absolute;display:none;pointer-events:none;white-space:pre;' +
        'background:rgba(16,22,29,0.92);color:#f7f9fa;font:11px ' +
        FONT +
        ';padding:6px 8px;border-radius:4px;z-index:1',
      ref: (el: HTMLDivElement | null) => {
        tip = el
      },
    }),
  )
}
