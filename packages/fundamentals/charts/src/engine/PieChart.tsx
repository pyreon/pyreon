// `<PieChart>` — the radial family's component surface.
//
// Separate from `<PlotChart>` rather than a mark on it, because a pie has no
// cartesian plot: no axes, no gutters, no shared y domain. Folding it into the
// same component would mean every bar chart carried the radial code and every
// pie carried the axis layout it never uses. Two components keep both
// tree-shakeable.

import { canvasHost, orNull } from './canvas-host'
import { pieLegend, pieTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { paletteAt } from './palette'
import type { VNode } from '@pyreon/core'
import { fitCircle, hitArc, layoutArcs, renderGauge, renderPie } from './arc'
import type { GaugeOptions, Slice } from './arc'
import { plain } from './format'
import type { Double, Rect } from './types'


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
  const slices = (palette: readonly string[]): Slice[] =>
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
    legend: (g) => pieLegend(g.slices),
    select: (g, px, py) => {
      const i = hitAt(g, px, py, props.innerRadius ?? 0)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    tooltip: (g, px, py) => orNull(pieTip(g.slices, g.box, props.innerRadius ?? 0, px, py)),
    pick: (_g, i) => {
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
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

export interface GaugeChartProps extends CanvasHostProps {
  value: Double | (() => Double)
  min?: Double
  max?: Double
  thickness?: Double
  trackColor?: string
  valueColor?: string
  /** Draw the value in the middle. */
  showValue?: boolean
}

interface GaugeGeometry {
  value: Double
  min: Double
  max: Double
  box: Rect
}

/**
 * A single-value gauge — over the shared canvas host like every other family,
 * so it carries the same theme, title, accessible description and data table
 * (the manifest promised that contract; the earlier hand-rolled canvas kept
 * none of it).
 */
export function GaugeChart(props: GaugeChartProps): VNode {
  const readValue = (): Double => {
    const v = props.value
    return typeof v === 'function' ? (v as () => Double)() : v
  }
  return canvasHost<GaugeGeometry>({
    props,
    defaultHeight: 140,
    caption: 'Gauge',
    track: () => {
      readValue()
    },
    layout: (box) => ({ value: readValue(), min: props.min ?? 0, max: props.max ?? 100, box }),
    render: (g, _measure, theme) => {
      const opts: GaugeOptions = {
        min: g.min,
        max: g.max,
        sweep: Math.PI,
        thickness: props.thickness ?? 22,
        trackColor: props.trackColor ?? theme.grid,
        valueColor: props.valueColor ?? paletteAt(theme.palette, 0),
      }
      // A half-circle occupies the top half of its box, so the drawing box is
      // twice the visible height — otherwise the arc is squashed into a quarter.
      const cmds = renderGauge(g.value, { x: g.box.x, y: g.box.y, w: g.box.w, h: g.box.h * 2 }, opts)
      if (props.showValue !== false) {
        cmds.push({
          kind: 'text',
          text: plain(g.value),
          at: { x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h - 6 },
          fill: theme.text,
          size: 20,
          align: 'middle',
          baseline: 'bottom',
        })
      }
      return cmds
    },
    describe: (g) => `${props.title ?? 'Gauge'}: ${plain(g.value)} of ${plain(g.max)}`,
    a11y: (g) => ({
      title: props.title,
      categories: [props.title ?? 'Gauge'],
      series: [{ label: 'Value', values: [g.value], kind: 'gauge' }],
    }),
  })
}
