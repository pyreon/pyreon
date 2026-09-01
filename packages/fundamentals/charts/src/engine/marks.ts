// The authoring surface: marks over data.
//
// Each mark is an ordinary exported function returning a plain descriptor. That
// is what makes the library tree-shakeable BY CONSTRUCTION: `bars` is an
// imported binding, so a bundler that never sees the import drops the mark and
// everything only it reaches. A string-keyed option bag (`type: 'bars'`) cannot
// have this property at any price, because no bundler can trace a string to
// the code that handles it.
//
// The shape is settled prior art — Swift Charts, Observable Plot, Vega-Lite and
// Recharts all converge on marks-over-data rather than one nested config object.

import type { Series } from './render'
import type { Double, Pt } from './types'

/** Reads one numeric channel out of a datum. */
export type Accessor<T> = (d: T, index: number) => Double

export interface MarkOptions {
  /** Name for the legend, the tooltip and the accessible table. */
  label?: string
  /** Series colour. Defaults are the caller's business — a theme sets them. */
  color?: string
  /** Stroke width for line and area outlines. */
  width?: Double
  /** Point radius. */
  radius?: Double
  /**
   * Curve interpolator for line and area — `smooth` and `step` from `./curve`,
   * or any `(points) => points` densifier. An imported binding rather than a
   * string, so an unused curve tree-shakes like an unused mark.
   */
  curve?: (points: Pt[]) => Pt[]
  /**
   * Draw each value above its bar.
   *
   * Off by default: value labels on a dense series overlap into noise, so
   * turning them on is a statement that this chart is sparse enough to carry
   * them. Formatted with the chart's `format`.
   */
  showValues?: boolean
  /**
   * Which y axis this mark scales against; absent = left.
   *
   * Only the independent marks honor 'right': stacked/grouped marks are laid
   * out as ONE set against ONE scale, and the horizontal frame has a single
   * value axis — both pin to left by design rather than silently mis-scaling.
   */
  axis?: 'left' | 'right'
}

/** A mark bound to its accessor, resolved against data at render time. */
export interface Mark<T> {
  kind: Series['kind']
  y: Accessor<T>
  options: MarkOptions
  /** Per-datum radius accessor — the bubble channel; `points` only. */
  r?: Accessor<T> | undefined
  /** Rendered-radius bounds for the r channel. */
  minRadius?: Double | undefined
  maxRadius?: Double | undefined
}

/**
 * Default series colours. A single default would render a two-series chart in
 * one colour, which reads as one series — so the palette is indexed by series
 * position and an explicit `color` always wins.
 */
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

function mark<T>(kind: Series['kind'], y: Accessor<T>, options: MarkOptions): Mark<T> {
  return { kind, y, options, r: undefined }
}

/** Vertical bars, one per datum, measured from the zero line. */
export function bars<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('bars', y, options)
}

/**
 * Bars stacked on one another rather than side by side.
 *
 * A separate factory rather than an option, so the stacking geometry is only
 * reachable when you import it — the same reason each mark is its own binding.
 * Every `stackedBars` mark in one chart forms a single stack, in the order
 * given.
 */
export function stackedBars<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('stacked', y, options)
}

/** Bars sharing a band, one per series. */
export function groupedBars<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('grouped', y, options)
}

/** A polyline through every datum. */
export function line<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('line', y, options)
}

/** A filled band between the line and the baseline. */
export function area<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('area', y, options)
}

/** A dot per datum. */
export function points<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('points', y, options)
}

export interface BubbleOptions extends MarkOptions {
  /** Smallest and largest rendered radius; the r channel maps between them. */
  minRadius?: Double
  maxRadius?: Double
}

/**
 * Dots sized by a second channel — the bubble chart.
 *
 * The r channel is mapped by AREA, not by radius: a datum twice another's
 * value gets twice the ink, where doubling the radius would give it four
 * times. Radius-proportional bubbles are the classic way a bubble chart
 * exaggerates its own data.
 */
export function bubble<T>(
  y: Accessor<T>,
  r: Accessor<T>,
  options: BubbleOptions = {},
): Mark<T> {
  return {
    kind: 'points',
    y,
    options,
    r,
    minRadius: options.minRadius ?? 3.0,
    maxRadius: options.maxRadius ?? 18.0,
  }
}

/**
 * Resolve marks against data into the engine's `Series[]`.
 *
 * A non-finite accessor result becomes 0 rather than propagating: `NaN` in a
 * domain makes every scale NaN, and the failure surfaces as a blank chart with
 * nothing to trace it by. Zero is visibly wrong at the right datum, which is
 * the better failure.
 */
export function resolveMarks<T>(data: T[], marks: Mark<T>[]): Series[] {
  return marks.map((m, seriesIndex) => {
    const values: Double[] = []
    for (let i = 0; i < data.length; i++) {
      const v = m.y(data[i]!, i)
      values.push(Number.isFinite(v) ? v : 0)
    }
    // The r channel resolves to RADII here, area-mapped over the series'
    // own extent, so the engine only ever sees pixels.
    let radii: Double[] | undefined = undefined
    const rAcc = m.r
    if (rAcc !== undefined) {
      const raw: Double[] = []
      for (let i = 0; i < data.length; i++) {
        const rv = rAcc(data[i]!, i)
        raw.push(Number.isFinite(rv) && rv > 0.0 ? rv : 0.0)
      }
      let hi = 0.0
      for (const rv of raw) if (rv > hi) hi = rv
      const minR = m.minRadius ?? 3.0
      const maxR = m.maxRadius ?? 18.0
      radii = raw.map((rv) =>
        hi === 0.0 ? minR : minR + Math.sqrt(rv / hi) * (maxR - minR),
      )
    }
    return {
      kind: m.kind,
      values,
      color: m.options.color ?? PALETTE[seriesIndex % PALETTE.length]!,
      width: m.options.width ?? 2,
      radius: m.options.radius ?? 3,
      label: m.options.label ?? `Series ${seriesIndex + 1}`,
      curve: m.options.curve,
      showValues: m.options.showValues === true,
      radii,
      axis: m.options.axis,
    }
  })
}

/** Category labels for the x axis, from an accessor over the same data. */
export function resolveCategories<T>(data: T[], x?: (d: T, index: number) => string): string[] {
  if (x === undefined) return []
  return data.map((d, i) => x(d, i))
}
