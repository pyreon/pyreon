import { layoutSingleAxis, renderSingleAxis } from './single-axis'
import type { SingleAxisOptions, SingleAxisPoint, SingleAxisSpec } from './single-axis'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, MeasureText } from './types'

export interface SingleAxisToSvgOptions {
  axis: SingleAxisSpec
  points: SingleAxisPoint[]
  width?: Double
  height?: Double
  options?: SingleAxisOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

export function singleAxisToSvg(o: SingleAxisToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 120.0
  const layout = layoutSingleAxis(o.axis, o.points, { x: 0.0, y: 0.0, w: width, h: height }, o.options)
  void (o.measure ?? measureApprox())
  const cmds = renderSingleAxis(layout, o.options)
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${o.points.length} points on a ${o.axis.type ?? 'value'} axis.` : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
