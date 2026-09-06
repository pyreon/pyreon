// `<PieChart>` — the radial family's component surface.
//
// Separate from `<PlotChart>` rather than a mark on it, because a pie has no
// cartesian plot: no axes, no gutters, no shared y domain. Folding it into the
// same component would mean every bar chart carried the radial code and every
// pie carried the axis layout it never uses. Two components keep both
// tree-shakeable.

import { h } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { resolveChartTheme, useChartTheme } from './theme'
import { paletteAt } from './palette'
import type { ChartTheme } from './render'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { fitCircle, hitArc, layoutArcs, renderGauge, renderPie } from './arc'
import type { GaugeOptions, Slice } from './arc'
import { paint, prepareCanvas } from './canvas-web'
import { plain } from './format'
import type { Double, Rect } from './types'
import { observeWidth, radialWidth } from './radial-host'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'


export interface PieChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  /** Per-slice colour; the theme palette otherwise. */
  color?: (d: T, index: number) => string
  /** 0 for a pie, 0..1 for a donut — the hole as a fraction of the radius. */
  innerRadius?: Double
  /** Value labels on the slices (default on). */
  showLabels?: boolean
  /** Fired with the slice index under the click, or -1 for a miss. */
  onSelect?: (index: number) => void
  /** The engine's INDEX hit — identical to `onSelect` here; the multiplatform-safe name every host carries. */
  onSelectIndex?: (index: number) => void
}

export function PieChart<T>(props: PieChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const slices = (palette: string[]): Slice[] =>
    readData().map((d, i) => ({ value: props.value(d, i), label: props.label(d, i), color: props.color?.(d, i) ?? paletteAt(palette, i) }))
  return canvasHost<PieGeometry>({
    props,
    defaultHeight: 240,
    caption: 'Pie data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => ({ slices: slices(theme.palette), box }),
    render: (g, _measure, theme) =>
      renderPie(g.slices, g.box, { innerRadius: props.innerRadius ?? 0, showLabels: props.showLabels ?? true, labelColor: '#ffffff', fontSize: theme.fontSize }),
    legend: (g) => g.slices.map((x) => ({ label: x.label, color: x.color })),
    select: (g, px, py) => {
      const i = hitAt(g, px, py, props.innerRadius ?? 0)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    tooltip: (g, px, py) => {
      const i = hitAt(g, px, py, props.innerRadius ?? 0)
      const s = g.slices[i]
      if (s === undefined) return null
      let total = 0.0
      for (const x of g.slices) total += x.value
      return [s.label, `${plain(s.value)} (${total > 0 ? Math.round((s.value / total) * 100) : 0}%)`]
    },
    a11y: (g) => ({
      title: props.title,
      categories: g.slices.map((x) => x.label),
      series: [{ label: 'Value', values: g.slices.map((x) => x.value), kind: 'pie' }],
    }),
  })
}

interface PieGeometry { slices: Slice[]; box: Rect }

function hitAt(g: PieGeometry, px: Double, py: Double, innerRadius: Double): number {
  const { center, radius } = fitCircle(g.box)
  return hitArc(layoutArcs(g.slices), center, radius, radius * innerRadius, { x: px, y: py })
}

export interface GaugeChartProps {
  /** Token overrides merged over the theme in scope (`<ChartThemeProvider>`, else the system scheme). */
  theme?: Partial<ChartTheme>
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
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readValue = (): Double => {
    const v = props.value
    return typeof v === 'function' ? (v as () => Double)() : v
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = radialWidth(el, props.width, 240)
    const hgt = props.height ?? 140
    const ctx = prepareCanvas(el, w, hgt, theme().background)
    if (ctx === null) return
    const min = props.min ?? 0
    const max = props.max ?? 100
    const v = readValue()
    const opts: GaugeOptions = {
      min,
      max,
      sweep: Math.PI,
      thickness: props.thickness ?? 22,
      trackColor: props.trackColor ?? theme().grid,
      valueColor: props.valueColor ?? paletteAt(theme().palette, 0),
    }
    // A half-circle occupies the top half of its box, so the drawing box is
    // twice the visible height — otherwise the arc is squashed into a quarter.
    const cmds = renderGauge(v, { x: 0, y: 0, w, h: hgt * 2 }, opts)
    if (props.showValue !== false) {
      cmds.push({
        kind: 'text',
        text: plain(v),
        at: { x: w / 2, y: hgt - 6 },
        fill: theme().text,
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
      if (el === null) {
        sizeObserver?.disconnect()
        sizeObserver = null
        return
      }
      draw()
      sizeObserver = observeWidth(el, () => radialWidth(el, props.width, 240), draw)
    },
  })
}
