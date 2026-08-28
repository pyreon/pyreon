// `<PieChart>` — the radial family's component surface.
//
// Separate from `<PlotChart>` rather than a mark on it, because a pie has no
// cartesian plot: no axes, no gutters, no shared y domain. Folding it into the
// same component would mean every bar chart carried the radial code and every
// pie carried the axis layout it never uses. Two components keep both
// tree-shakeable.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { fitCircle, hitArc, layoutArcs, renderGauge, renderPie } from './arc'
import type { GaugeOptions, Slice } from './arc'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { renderLegend } from './legend'
import { chartTable, describeChart } from './a11y'
import { plain } from './format'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface PieChartProps<T> {
  data: T[] | (() => T[])
  /** The slice magnitude. */
  value: (d: T, index: number) => Double
  /** The slice name — used by the legend, the labels and the a11y table. */
  label: (d: T, index: number) => string
  /** Per-slice colour; falls back to a built-in palette. */
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  /** 0 for a pie, 0..1 for a donut hole. */
  innerRadius?: Double
  showLabels?: boolean
  showLegend?: boolean
  title?: string
  onSelect?: (index: number) => void
  accessibleTable?: boolean
  class?: string
}

export function PieChart<T>(props: PieChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null

  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }

  const slices = (): Slice[] =>
    readData().map((d, i) => ({
      value: props.value(d, i),
      label: props.label(d, i),
      color: props.color?.(d, i) ?? PALETTE[i % PALETTE.length]!,
    }))

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = props.width ?? el.clientWidth ?? 300
    const hgt = props.height ?? 240
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const s = slices()
    const measure = canvasMeasure(ctx, FONT)

    // Lay the legend out FIRST and subtract the height it reports, because a
    // horizontal legend wraps: reserving a fixed strip would clip it on a
    // narrow chart and leave a gap on a wide one.
    let legendH = 0
    const legendCmds = props.showLegend === true
      ? (() => {
          const l = renderLegend(
            s.map((x) => ({ label: x.label, color: x.color })),
            { x: 8, y: 8, w: w - 16, h: hgt },
            { fontSize: 11, labelColor: '#5a6b7a', swatch: 10, gap: 12, orientation: 'horizontal' },
            measure,
          )
          legendH = l.height
          return l.cmds
        })()
      : []

    const box = { x: 0, y: legendH, w, h: hgt - legendH }
    const cmds = renderPie(s, box, {
      innerRadius: props.innerRadius ?? 0,
      showLabels: props.showLabels ?? true,
      labelColor: '#ffffff',
      fontSize: 11,
    })
    paint(ctx, [...legendCmds, ...cmds], w, hgt, FONT)
  }

  effect(() => {
    readData()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = props.width ?? el.clientWidth ?? 300
    const hgt = props.height ?? 240
    const box = { x: 0, y: 0, w, h: hgt }
    const { center, radius } = fitCircle(box)
    const rect = el.getBoundingClientRect()
    cb(
      hitArc(
        layoutArcs(slices()),
        center,
        radius,
        radius * (props.innerRadius ?? 0),
        { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      ),
    )
  }

  const a11y = () => {
    const s = slices()
    return {
      title: props.title,
      categories: s.map((x) => x.label),
      series: [{ label: 'Value', values: s.map((x) => x.value), kind: 'pie' }],
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describeChart(a11y()),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
  })

  if (props.accessibleTable === false) return canvasNode

  const table = (): VNode => {
    const t = chartTable(a11y())
    return h(
      'div',
      {
        style:
          'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0',
      },
      h(
        'table',
        null,
        h('caption', null, props.title ?? 'Chart data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h(
          'tbody',
          null,
          ...t.rows.map((r) =>
            h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))),
          ),
        ),
      ),
    )
  }

  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}

export interface GaugeChartProps {
  value: Double | (() => Double)
  min?: Double
  max?: Double
  width?: Double
  height?: Double
  thickness?: Double
  trackColor?: string
  valueColor?: string
  /** Draw the value in the middle. */
  showValue?: boolean
  title?: string
  class?: string
}

/** A single-value gauge. */
export function GaugeChart(props: GaugeChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  const readValue = (): Double => {
    const v = props.value
    return typeof v === 'function' ? (v as () => Double)() : v
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = props.width ?? el.clientWidth ?? 240
    const hgt = props.height ?? 140
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const min = props.min ?? 0
    const max = props.max ?? 100
    const v = readValue()
    const opts: GaugeOptions = {
      min,
      max,
      sweep: Math.PI,
      thickness: props.thickness ?? 22,
      trackColor: props.trackColor ?? 'rgba(132,150,165,0.22)',
      valueColor: props.valueColor ?? '#0f766e',
    }
    // A half-circle occupies the top half of its box, so the drawing box is
    // twice the visible height — otherwise the arc is squashed into a quarter.
    const cmds = renderGauge(v, { x: 0, y: 0, w, h: hgt * 2 }, opts)
    if (props.showValue !== false) {
      cmds.push({
        kind: 'text',
        text: plain(v),
        at: { x: w / 2, y: hgt - 6 },
        fill: '#10161d',
        size: 20,
        align: 'middle',
        baseline: 'bottom',
      })
    }
    paint(ctx, cmds, w, hgt, FONT)
  }

  effect(() => {
    readValue()
    draw()
  })

  return h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () =>
      `${props.title ?? 'Gauge'}: ${plain(readValue())} of ${plain(props.max ?? 100)}`,
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
  })
}
