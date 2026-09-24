// Large-series decimation — the `Pt[]` wrapper.
//
// A canvas cannot show more points than it has pixel columns, so plotting
// 100,000 points into an 800px plot spends ~99% of the work drawing over
// itself. Downsampling first is what makes big series interactive rather than
// merely possible — and it matters MOST on the target with the least headroom,
// which is why the arithmetic lives in `decimate-values.ts` and crosses to
// Swift and Kotlin through the generated chart engine.
//
// This file holds only what cannot cross: a `Pt[]` signature. One
// implementation underneath, so a native chart and a web chart cannot thin a
// series differently.

import { lttbIndices, minMaxBuckets } from './decimate-values'
import type { Pt } from './types'

export { lttbIndices, minMaxBuckets }

/**
 * Largest-Triangle-Three-Buckets over `Pt[]`.
 *
 * Kept on real `x` values rather than the point's position, because this is a
 * public export from `@pyreon/charts/plot` and a caller's `x` may be a
 * timestamp or a measurement — collapsing it to the index would silently change
 * what "largest triangle" means for unevenly spaced data. The chart's own path
 * passes evenly spaced rows and goes through {@link lttbIndices} directly with
 * no `xs`, which skips materialising `0…n-1`.
 */
export function lttb(points: Pt[], threshold: number): Pt[] {
  const keep = lttbIndices(
    points.map((p) => p.x),
    points.map((p) => p.y),
    threshold,
  )
  if (keep.length === 0) return points
  return keep.map((i) => points[i]!)
}
