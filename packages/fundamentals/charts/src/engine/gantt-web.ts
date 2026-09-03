// The web-facing gantt hit: a nullable row over the crossed engine's index
// answer (a `T | null` return has no native form).

import { hitGanttIndex } from './gantt'
import type { GanttLayout, GanttRow } from './gantt'
import type { Double } from './types'

/** The task whose bar (or, failing that, whose row band right of the labels) is under a point, or null. */
export function hitGantt(layout: GanttLayout, px: Double, py: Double): GanttRow | null {
  const i = hitGanttIndex(layout, px, py)
  return i < 0 ? null : layout.rows[i]!
}
