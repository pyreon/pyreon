// `boxplotToSvg` — the boxplot's server-side SVG form, over the same frame the
// canvas host and the native canvases paint (`boxplot-chart.ts`).

import { fiveNumber } from './boxplot'
import type { BoxplotOptions, FiveNumber } from './boxplot'
import { renderBoxplotChart } from './boxplot-chart'
import type { Formatter } from './format'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, MeasureText } from './types'

export interface BoxplotToSvgOptions<T> {
  data: T[]
  /** Raw observations per datum — summarised with `fiveNumber`. */
  values: (d: T, index: number) => Double[]
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  box?: BoxplotOptions
  format?: Formatter
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
  /** Precomputed summaries (index-aligned with `data`) — skips `fiveNumber`. */
  summaries?: FiveNumber[]
}

/** Boxplot → `<svg>` string, server-safe. */
export function boxplotToSvg<T>(options: BoxplotToSvgOptions<T>): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 320.0
  const t = { ...defaultTheme, ...options.theme }
  const rows = options.summaries ?? options.data.map((d, i) => fiveNumber(options.values(d, i)))
  const measure = options.measure ?? measureApprox()
  const categories = options.x !== undefined ? options.data.map((d, i) => options.x!(d, i)) : []
  const cmds = renderBoxplotChart(rows, width, height, categories, t, options.box ?? {}, measure, options.format)
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${rows.length === 1 ? '1 box, median' : `${rows.length} boxes, medians`} ${rows.map((r) => r.median).join(', ')}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
