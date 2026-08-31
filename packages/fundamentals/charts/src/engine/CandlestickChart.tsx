// `<CandlestickChart>` — open/high/low/close per period.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { renderCandles, ohlcExtent } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { computeLayout } from './layout'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { niceDomain } from './scale'
import type { Double, DrawCmd } from './types'

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
}

export function CandlestickChart<T>(props: CandlestickChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null

  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)

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
    const candles = toCandles(rows)
    // The price domain is niced so the axis lands on readable ticks; the
    // extent alone puts the top tick at e.g. 197.3.
    const domain = niceDomain(ohlcExtent(candles), 5.0)
    const measure = canvasMeasure(ctx, FONT)
    const l = computeLayout(
      {
        width: w,
        height: hgt,
        xDomain: { min: 0.0, max: candles.length > 1 ? candles.length - 1 : 1.0 },
        yDomain: domain,
        categories: props.x !== undefined ? rows.map((d, i) => props.x!(d, i)) : [],
        fontSize: t.fontSize,
        xTickCount: 5.0,
        yTickCount: 5.0,
        showXAxis: true,
        showYAxis: true,
      },
      measure,
    )
    const cmds: DrawCmd[] = []
    for (const tick of l.yTicks) {
      cmds.push({
        kind: 'line',
        from: { x: l.plot.x, y: tick.pos },
        to: { x: l.plot.x + l.plot.w, y: tick.pos },
        stroke: t.grid,
        width: 1.0,
      })
      cmds.push({
        kind: 'text',
        text: tick.label,
        at: { x: l.plot.x - 6.0, y: tick.pos },
        fill: t.label,
        size: t.fontSize,
        align: 'end',
        baseline: 'middle',
      })
    }
    for (const tick of l.xTicks) {
      cmds.push({
        kind: 'text',
        text: tick.label,
        at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 },
        fill: t.label,
        size: t.fontSize,
        align: 'middle',
        baseline: 'top',
      })
    }
    cmds.push(...renderCandles(candles, l.plot, domain, props.candle ?? {}))
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

  return h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describe(),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
  })
}
