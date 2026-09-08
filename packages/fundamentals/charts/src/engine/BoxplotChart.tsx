// `<BoxplotChart>` — five-number boxes per category from raw samples, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { fiveNumber, hitBox } from './boxplot'
import type { BoxplotOptions, FiveNumber } from './boxplot'
import { boxplotFrame, renderBoxplotChart } from './boxplot-chart'
import type { Formatter } from './format'
import type { Double, MeasureText, Rect } from './types'

export interface BoxplotChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  /** The raw samples per category; reduced with `fiveNumber`. */
  values: (d: T, index: number) => Double[]
  x?: (d: T, index: number) => string
  box?: BoxplotOptions
  /** Formats the value axis and the tooltip. */
  format?: Formatter
  /** Fired with the box index under the click, or -1 for a miss. */
  onSelect?: (index: number) => void
  /** The engine's INDEX hit — identical to `onSelect` here; the multiplatform-safe name every host carries. */
  onSelectIndex?: (index: number) => void
}

interface Geometry { rows: FiveNumber[]; categories: string[]; box: Rect; plot: Rect; fontSize: Double; measure: MeasureText }

export function BoxplotChart<T>(props: BoxplotChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const hitAt = (g: Geometry, px: Double, py: Double): number => hitBox(g.rows.length, g.plot, px - g.box.x, py - g.box.y)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 240,
    caption: 'Boxplot data',
    track: () => {
      readData()
    },
    layout: (box, measure, theme) => {
      const data = readData()
      const rows = data.map((d, i) => fiveNumber(props.values(d, i)))
      const categories = props.x !== undefined ? data.map((d, i) => props.x!(d, i)) : rows.map((_, i) => `${i + 1}`)
      // The frame the canvas and the native hosts share (`boxplot-chart.ts`); its plot rect is what the hit test runs against.
      const plot = boxplotFrame(rows, box.w, box.h, props.x !== undefined ? categories : [], theme.fontSize, measure, props.format).layout.plot
      return { rows, categories, box, plot, fontSize: theme.fontSize, measure }
    },
    animates: true,
    render: (g, measure, theme, progress) => shiftCmds(renderBoxplotChart(g.rows, g.box.w, g.box.h, props.x !== undefined ? g.categories : [], theme, props.box ?? {}, measure, props.format, progress), g.box.x, g.box.y),
    select: (g, px, py) => {
      const i = hitAt(g, px, py)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    pick: (_g, i) => {
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    focusRect: (g, i) => {
      const n = g.rows.length
      if (i < 0 || i >= n) return null
      const bw = g.plot.w / n
      return { x: g.box.x + g.plot.x + bw * i, y: g.box.y + g.plot.y, w: bw, h: g.plot.h }
    },
    tooltip: (g, px, py) => {
      const r = g.rows[hitAt(g, px, py)]
      if (r === undefined) return null
      const fmt = props.format ?? ((v: Double) => String(v))
      return [g.categories[hitAt(g, px, py)] ?? '', `max ${fmt(r.max)}`, `q3 ${fmt(r.q3)}`, `median ${fmt(r.median)}`, `q1 ${fmt(r.q1)}`, `min ${fmt(r.min)}`]
    },
    a11y: (g) => ({
      title: props.title,
      categories: g.categories,
      series: [
        { label: 'Median', values: g.rows.map((r) => r.median), kind: 'points' },
        { label: 'Q1', values: g.rows.map((r) => r.q1), kind: 'points' },
        { label: 'Q3', values: g.rows.map((r) => r.q3), kind: 'points' },
      ],
      format: props.format,
    }),
  })
}
