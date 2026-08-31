// One call from data to an `<svg>` string.
//
// The composition the other modules make possible: resolve marks, lay out,
// render to commands, serialize. Nothing here is new capability — it exists so
// that the common case is a single import rather than five, and so the a11y
// text is wired by default instead of by remembering to.

import { describeChart } from './a11y'
import type { Mark } from './marks'
import { resolveCategories, resolveMarks } from './marks'
import { defaultTheme, renderChart } from './render'
import type { Annotation, ChartTheme } from './render'
import { measureApprox, renderSvg } from './svg'
import type { Formatter } from './format'
import type { SvgOptions } from './svg'
import type { Domain, Double, MeasureText } from './types'

/** Options for {@link chartToSvg}. */
export interface ChartToSvgOptions<T> {
  data: T[]
  marks: Mark<T>[]
  /** Category label per datum. Omit for a purely numeric x axis. */
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: ChartTheme
  showXAxis?: boolean
  showYAxis?: boolean
  showGrid?: boolean
  /** Pins the y domain; derived from the data when absent. */
  yDomain?: Domain
  /**
   * Formats the y-axis tick labels and the derived description. The default
   * prints the number, which is wrong for money and percentages; `currency`,
   * `percent`, `compact` and `fixed` ship alongside.
   */
  format?: Formatter
  /** Reference rules and bands — see `Annotation`. */
  annotations?: Annotation[]
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
  const series = resolveMarks(options.data, options.marks)
  const spec = {
    width,
    height,
    series,
    categories: resolveCategories(options.data, options.x),
    theme: options.theme ?? defaultTheme,
    showXAxis: options.showXAxis ?? true,
    showYAxis: options.showYAxis ?? true,
    showGrid: options.showGrid ?? true,
    // Assigned, not conditionally spread — see the note in `render.ts`: the
    // `...(cond ? { k } : {})` idiom emits an empty object literal, which PMTC
    // cannot lower.
    yDomain: options.yDomain,
    yFormat: options.format,
    annotations: options.annotations,
  }
  const measure = options.measure ?? measureApprox()
  const cmds = renderChart(spec, measure)

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
