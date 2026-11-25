import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { chartNumber } from './locale'
import { singleAxisTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitSingleAxis, layoutSingleAxis, renderSingleAxis } from './single-axis'
import type { SingleAxisLayout, SingleAxisOptions, SingleAxisPoint, SingleAxisSpec } from './single-axis'

export interface SingleAxisChartProps extends CanvasHostProps {
  axis: SingleAxisSpec
  points: readonly SingleAxisPoint[] | (() => readonly SingleAxisPoint[])
  singleAxis?: SingleAxisOptions
  onSelect?: (index: number) => void
  onSelectIndex?: (index: number) => void
}

export function SingleAxisChart(props: SingleAxisChartProps): VNode {
  const readPoints = (): readonly SingleAxisPoint[] => typeof props.points === 'function' ? props.points() : props.points
  // The number format for what it draws and its tooltip: `format`, else `locale`'s digits.
  const num = chartNumber(props)
  return canvasHost<SingleAxisLayout>({
    props,
    defaultHeight: 160,
    caption: 'Single axis data',
    track: readPoints,
    layout: (box, _measure, theme) => layoutSingleAxis(props.axis, readPoints(), box, { labelColor: theme.label, axisColor: theme.axis, ...props.singleAxis }, num()),
    animates: true,
    render: (layout, _measure, theme, progress) => renderSingleAxis(layout, { labelColor: theme.label, axisColor: theme.axis, ...props.singleAxis, progress }),
    tooltip: (layout, px, py) => orNull(singleAxisTip(layout, readPoints(), px, py, num())),
    select: (layout, px, py) => {
      const index = hitSingleAxis(layout, px, py)
      props.onSelect?.(index)
      props.onSelectIndex?.(index)
    },
    pick: (_layout, index) => {
      props.onSelect?.(index)
      props.onSelectIndex?.(index)
    },
    focusRect: (layout, index) => {
      const point = layout.points[index]
      return point === undefined ? null : { x: point.at.x - point.radius, y: point.at.y - point.radius, w: point.radius * 2, h: point.radius * 2 }
    },
    a11y: (_l, m) => ({
      title: props.title,
      categories: readPoints().map((point, index) => point.name ?? String(index + 1)),
      series: [{ label: props.axis.name ?? m?.valueLabel ?? 'Value', values: readPoints().map((point) => point.x), kind: 'points' }],
    }),
  })
}
