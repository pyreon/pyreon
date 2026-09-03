// The web-facing half of parallel coordinates: the mixed-type row adapter
// (strings for categories, null for gaps), the per-row colour callback, the
// gap-splitting `lineRuns` helper and the nullable hit. The geometry in
// parallel.ts is crossed into the native engine and speaks in numeric rows.

import { hitParallelIndex } from './parallel'
import type { ParallelAxis, ParallelLayout, ParallelLine } from './parallel'
import type { Double, Pt } from './types'

/** A row as authored on the web: a number, a category name (or index), or null for a gap, per axis. */
export type ParallelRow = (Double | string | null)[]

/** Rows as the engine takes them: a category as its index in the axis's `categories`, a gap (null, unknown category, non-number) as NaN. */
export function parallelRows(axes: ParallelAxis[], rows: ParallelRow[]): Double[][] {
  const out: Double[][] = []
  for (const row of rows) {
    const values: Double[] = []
    for (let a = 0; a < axes.length; a++) {
      const v = row[a] ?? null
      const axis = axes[a]!
      if (v === null) values.push(Number.NaN)
      else if (typeof v === 'string') {
        const idx = axis.type === 'category' ? (axis.categories ?? []).indexOf(v) : -1
        values.push(idx < 0 ? Number.NaN : idx)
      } else values.push(v !== v ? Number.NaN : v)
    }
    out.push(values)
  }
  return out
}

/** Per-row colours from a callback, for `ParallelOptions.lineColors`. */
export function parallelLineColors(rows: ParallelRow[], colorOf: (row: ParallelRow, index: number) => string): string[] {
  return rows.map((row, i) => colorOf(row, i))
}

/** Split a line at gaps into drawable runs of at least two points. */
export function lineRuns(points: Pt[], present: boolean[]): Pt[][] {
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    if (present[i] === true) cur.push(points[i]!)
    else {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    }
  }
  if (cur.length >= 2) runs.push(cur)
  return runs
}

/** The nearest line within `tolerance` pixels, or null. */
export function hitParallel(layout: ParallelLayout, px: Double, py: Double, tolerance?: Double): ParallelLine | null {
  const i = hitParallelIndex(layout, px, py, tolerance)
  return i < 0 ? null : layout.lines[i]!
}
