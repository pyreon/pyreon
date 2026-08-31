// Large-series decimation.
//
// A canvas cannot show more points than it has pixel columns, so plotting
// 100,000 points into an 800px plot spends ~99% of the work drawing over
// itself. Downsampling first is what makes big series interactive rather than
// merely possible.

import type { Double, Pt } from './types'

/**
 * Largest-Triangle-Three-Buckets.
 *
 * Chosen over naive every-nth sampling because nth-sampling DROPS SPIKES: a
 * one-sample spike between two sampled indices disappears entirely, which on a
 * monitoring chart is the single most important feature to preserve. LTTB picks
 * the point in each bucket forming the largest triangle with its neighbours,
 * which keeps visual extremes.
 *
 * First and last points are always kept so the series still spans its range.
 */
export function lttb(points: Pt[], threshold: number): Pt[] {
  const n = points.length
  if (threshold >= n || threshold < 3) return points

  const out: Pt[] = [points[0]!]
  // Buckets exclude the pinned first and last points.
  const every = (n - 2) / (threshold - 2)
  let a = 0

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * every) + 1
    const rangeEnd = Math.min(Math.floor((i + 2) * every) + 1, n - 1)

    // Average of the NEXT bucket forms the triangle's third vertex.
    let avgX = 0.0
    let avgY = 0.0
    const avgStart = Math.floor((i + 1) * every) + 1
    const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n)
    const avgCount = Math.max(1, avgEnd - avgStart)
    for (let j = avgStart; j < avgEnd; j++) {
      avgX = avgX + points[j]!.x
      avgY = avgY + points[j]!.y
    }
    avgX = avgX / avgCount
    avgY = avgY / avgCount

    let best = rangeStart
    let bestArea = -1.0
    const pa = points[a]!
    for (let j = rangeStart; j < rangeEnd; j++) {
      const p = points[j]!
      const area = Math.abs(
        (pa.x - avgX) * (p.y - pa.y) - (pa.x - p.x) * (avgY - pa.y),
      )
      if (area > bestArea) {
        bestArea = area
        best = j
      }
    }
    out.push(points[best]!)
    a = best
  }

  out.push(points[n - 1]!)
  return out
}

/**
 * Min/max decimation over raw values, for bars and dense line series.
 *
 * Keeps BOTH extremes per bucket, so the drawn envelope still covers the real
 * range — a mean would smooth away exactly the outliers a reader is looking
 * for.
 */
export function minMaxBuckets(values: Double[], buckets: number): Double[] {
  const n = values.length
  if (buckets <= 0 || n <= buckets * 2) return values
  const out: Double[] = []
  const size = n / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size)
    const end = Math.min(n, Math.floor((b + 1) * size))
    if (start >= end) continue
    let lo = values[start]!
    let hi = values[start]!
    for (let i = start; i < end; i++) {
      const v = values[i]!
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    // Emit in the order they occur so the line does not zig-zag backwards.
    out.push(lo, hi)
  }
  return out
}
