import { layoutSingleAxis, renderSingleAxis } from './single-axis'
import type { SingleAxisOptions, SingleAxisPoint, SingleAxisSpec } from './single-axis'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import { svgLocale, svgNumber, svgSentence } from './svg-locale'
import type { ChartMessages } from './a11y'
import type { Double, MeasureText } from './types'

export interface SingleAxisToSvgOptions {
  axis: SingleAxisSpec
  points: readonly SingleAxisPoint[]
  width?: Double
  height?: Double
  options?: SingleAxisOptions
  measure?: MeasureText
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

export function singleAxisToSvg(o: SingleAxisToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 120.0
  const loc = svgLocale(o)
  const layout = layoutSingleAxis(o.axis, o.points, { x: 0.0, y: 0.0, w: width, h: height }, o.options, loc.format)
  void (o.measure ?? measureApprox())
  const cmds = renderSingleAxis(layout, o.options)
  const axisType = o.axis.type ?? 'value'
  const points = svgNumber(o.points.length, loc.number)
  const description = o.description ?? (o.title !== undefined ? svgSentence(loc.messages?.singleAxisDescription, () => `${o.title}: ${points} points on a ${axisType} axis.`, { title: o.title, points, axis: axisType }) : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
