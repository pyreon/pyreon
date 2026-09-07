// `<GanttChart>` — a task timeline on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { ganttTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { ganttDurationDays, hitGanttIndex, layoutGantt, renderGantt } from './gantt'
import { hitGantt } from './gantt-web'
import type { GanttLayout, GanttOptions, GanttRow, GanttTask } from './gantt'

export interface GanttChartProps extends CanvasHostProps {
  tasks: GanttTask[] | (() => GanttTask[])
  gantt?: GanttOptions
  /** Fired with the row under the click, or null for a miss. */
  onSelect?: (row: GanttRow | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

export function GanttChart(props: GanttChartProps): VNode {
  const readTasks = (): GanttTask[] => (typeof props.tasks === 'function' ? props.tasks() : props.tasks)
  const opts = (palette: readonly string[]): GanttOptions => ({ palette, ...props.gantt })
  return canvasHost<GanttLayout>({
    props,
    defaultHeight: 320,
    caption: 'Gantt data',
    track: () => {
      readTasks()
    },
    layout: (box, measure, theme) => layoutGantt(readTasks(), { x: box.x + 4.0, y: box.y + 4.0, w: box.w - 8.0, h: box.h - 8.0 }, opts(theme.palette), measure),
    animates: true,
    render: (layout, _measure, theme, progress) => renderGantt(layout, { ...opts(theme.palette), progress }),
    select: (layout, px, py) => {
      props.onSelect?.(hitGantt(layout, px, py))
      props.onSelectIndex?.(hitGanttIndex(layout, px, py))
    },
    tooltip: (layout, px, py) => orNull(ganttTip(layout, px, py)),
    a11y: (layout) => ({
      title: props.title,
      categories: layout.rows.map((r) => r.task.name),
      series: [{ label: props.title ?? 'Duration (days)', values: layout.rows.map((r) => ganttDurationDays(r)), kind: 'bars' }],
    }),
  })
}
