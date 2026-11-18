// One call from data to an `<svg>` string.
//
// The composition the other modules make possible: resolve marks, lay out,
// render to commands, serialize. Nothing here is new capability — it exists so
// that the common case is a single import rather than five, and so the a11y
// text is wired by default instead of by remembering to.

import { describeChart } from './a11y'
import type { ItemFill } from './item-colors'
import type { Mark } from './marks'
import { resolveCategories, resolveMarks } from './marks'
import { defaultTheme, renderChart } from './render'
import { mirrorCmds } from './rtl'
import type { Annotation, ChartTheme, PointMarker } from './render'
import { measureApprox, renderSvg } from './svg'
import type { Formatter } from './format'
import type { SvgOptions } from './svg'
import type { Domain, Double, MeasureText } from './types'

/** Options for {@link chartToSvg}. */
export interface ChartToSvgOptions<T> {
  data: readonly T[]
  marks: readonly Mark<T>[]
  /** Category label per datum. Omit for a purely numeric x axis. */
  x?: (d: T, index: number) => string
  /**
   * Lay the chart out right-to-left — the mirror of the LTR drawing about the
   * canvas centreline. Text is repositioned, never reversed.
   */
  rtl?: boolean
  width?: Double
  height?: Double
  theme?: ChartTheme
  showXAxis?: boolean
  showYAxis?: boolean
  showGrid?: boolean
  /** Pins the y domain; derived from the data when absent. */
  yDomain?: Domain
  /** Pins the RIGHT y domain (dual-axis: marks carrying `axis: 'right'`). */
  y2Domain?: Domain
  /** Tick label formatting for the right axis. */
  y2Format?: Formatter
  /**
   * Formats the y-axis tick labels and the derived description. The default
   * prints the number, which is wrong for money and percentages; `currency`,
   * `percent`, `compact` and `fixed` ship alongside.
   */
  format?: Formatter
  /** Reference rules and bands — see `Annotation`. */
  annotations?: readonly Annotation[]
  /** Datum-anchored point markers — see `PointMarker`. */
  markers?: readonly PointMarker[]
  /** Flip the frame — categories on Y, bars growing rightward. Bar marks only. */
  horizontal?: boolean
  /** Bar thickness in px (a ceiling) — see `PlotChartProps.barWidth`. */
  barWidth?: number
  /** Space between the bars of a group, as a fraction of a bar — see `PlotChartProps.barGap`. */
  barGap?: number
  /** Space between categories, as a fraction of the band — see `PlotChartProps.barCategoryGap`. */
  barCategoryGap?: number
  /** Reverse the value axis — see `PlotChartProps.yInverse`. */
  yInverse?: boolean
  /** Reverse the right axis — see `PlotChartProps.y2Inverse`. */
  y2Inverse?: boolean
  /**
   * Text measurement. Defaults to the approximation, which is what makes this
   * callable on a server — pass `canvasMeasure(ctx, font)` in a browser when
   * label widths need to be exact.
   */
  measure?: MeasureText
  /**
   * Accessible name. Defaults to nothing rather than to a generic string: an
   * `aria-label` of "Chart" is worse than none, because it looks labelled.
   */
  title?: string
  /**
   * Long description. When omitted AND a title is given, one is DERIVED from
   * the data via `describeChart` — a chart whose only accessible text is its
   * title tells a screen-reader user that a graphic exists and nothing about
   * what it shows. Pass an empty string to opt out.
   */
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/**
 * Render a chart to a standalone `<svg>` string.
 *
 * Pure — no DOM, no canvas, no measurement context required — so this is the
 * form that works in an SSG build, a serverless function, or an email
 * pipeline, and the form whose output a test can assert on directly.
 */
export function chartToSvg<T>(options: ChartToSvgOptions<T>): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const theme = options.theme ?? defaultTheme
  const series = resolveMarks(options.data, options.marks, undefined, theme.ramp)
  // A per-datum colour descriptor adds its ramp legend above the plot (see `item-colors.ts`).
  const legend = (options.marks.find((m) => m.options.fill !== undefined)?.options.fill as ItemFill<T> | undefined)?.legend?.(series, { x: 0, y: 0, w: width }, theme)
  const spec = {
    width,
    height: height - (legend?.height ?? 0),
    series,
    categories: resolveCategories(options.data, options.x),
    theme,
    showXAxis: options.showXAxis ?? true,
    showYAxis: options.showYAxis ?? true,
    showGrid: options.showGrid ?? true,
    // Assigned, not conditionally spread — see the note in `render.ts`: the
    // `...(cond ? { k } : {})` idiom emits an empty object literal, which PMTC
    // cannot lower.
    yDomain: options.yDomain,
    yFormat: options.format,
    y2Domain: options.y2Domain,
    y2Format: options.y2Format,
    annotations: options.annotations,
    markers: options.markers,
    horizontal: options.horizontal === true,
    barWidth: options.barWidth,
    barGap: options.barGap,
    barCategoryGap: options.barCategoryGap,
    yInverse: options.yInverse,
    y2Inverse: options.y2Inverse,
  }
  const measure = options.measure ?? measureApprox()
  // Same seam as the canvas host's `present`: RTL is the mirror of the
  // finished list, so the static path and the live one cannot drift.
  const plotted = renderChart(spec, measure)
  const drawn = legend === undefined ? plotted : [...legend.cmds, ...legend.shift(plotted)]
  const cmds = options.rtl === true ? mirrorCmds(drawn, width) : drawn

  const description =
    options.description ??
    (options.title !== undefined
      ? describeChart({
          series,
          categories: spec.categories,
          title: options.title,
          format: options.format,
        })
      : undefined)

  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
