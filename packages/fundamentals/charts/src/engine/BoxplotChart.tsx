// `<BoxplotChart>` — five-number boxes per category from raw samples, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { boxplotExtent, fiveNumber, hitBox, renderBoxplot } from './boxplot'
import type { BoxplotOptions, FiveNumber } from './boxplot'
import type { Formatter } from './format'
import { computeLayout } from './layout'
import type { PlotLayout } from './layout'
import { niceDomain } from './scale'
import type { Domain, Double, DrawCmd, Rect } from './types'

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

interface Geometry { rows: FiveNumber[]; categories: string[]; domain: Domain; l: PlotLayout; box: Rect }

export function BoxplotChart<T>(props: BoxplotChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const hitAt = (g: Geometry, px: Double, py: Double): number => hitBox(g.rows.length, g.l.plot, px - g.box.x, py - g.box.y)
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
      const domain = niceDomain(boxplotExtent(rows), 5.0)
      const l = computeLayout(
        {
          width: box.w,
          height: box.h,
          xDomain: { min: 0.0, max: rows.length > 1 ? rows.length - 1 : 1.0 },
          yDomain: domain,
          categories: props.x !== undefined ? categories : [],
          fontSize: theme.fontSize,
          xTickCount: 5.0,
          yTickCount: 5.0,
          showXAxis: true,
          showYAxis: true,
          yFormat: props.format,
        },
        measure,
      )
      return { rows, categories, domain, l, box }
    },
    animates: true,
    render: (g, _measure, theme, progress) => {
      const cmds: DrawCmd[] = []
      for (const tick of g.l.yTicks) {
        cmds.push({ kind: 'line', from: { x: g.l.plot.x, y: tick.pos }, to: { x: g.l.plot.x + g.l.plot.w, y: tick.pos }, stroke: theme.grid, width: 1.0 })
        cmds.push({ kind: 'text', text: tick.label, at: { x: g.l.plot.x - 6.0, y: tick.pos }, fill: theme.label, size: theme.fontSize, align: 'end', baseline: 'middle' })
      }
      for (const tick of g.l.xTicks) {
        cmds.push({ kind: 'text', text: tick.label, at: { x: tick.pos, y: g.l.plot.y + g.l.plot.h + 6.0 }, fill: theme.label, size: theme.fontSize, align: 'middle', baseline: 'top' })
      }
      for (const c of renderBoxplot(g.rows, g.l.plot, g.domain, { ...props.box, progress })) cmds.push(c)
      return shiftCmds(cmds, g.box.x, g.box.y)
    },
    select: (g, px, py) => {
      const i = hitAt(g, px, py)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
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
