// Binning — a value list into equal-width buckets, the histogram's geometry.
//
// Pure arithmetic so it crosses to native with the rest of the engine: the
// web `histogram()` helper turns rows into bins here, and a native host can
// do the same over a `[Double]`.

import { plain } from './format'
import { niceDomain, niceStep } from './scale'
import type { Double } from './types'

/** One bucket: `[x0, x1)` (the last is closed), and how many values fell in it. */
export interface Bin {
  x0: Double
  x1: Double
  count: Double
}

/**
 * Bucket `values` into about `count` equal-width bins over a nice domain.
 *
 * `count` is a target, as with ticks: the bin edges land on nice-step
 * multiples (a histogram of ages should bin at 10s, not at 9.7s), so the
 * actual number is whatever the step yields. A gap (NaN) is skipped, an
 * empty list is empty, and a flat list gets one unit-wide bin.
 */
export function binValues(values: Double[], count: Double): Bin[] {
  const finite: Double[] = []
  for (const v of values) if (v === v) finite.push(v)
  const out: Bin[] = []
  if (finite.length === 0) return out
  let lo = finite[0]!
  let hi = finite[0]!
  for (const v of finite) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const target = count < 1.0 ? 1.0 : count
  if (hi === lo) {
    out.push({ x0: lo, x1: lo + 1.0, count: finite.length })
    return out
  }
  const dom = niceDomain({ min: lo, max: hi }, target)
  const step = niceStep((hi - lo) / target)
  // Bounded like the tick loops: a pathological domain must not spin.
  const limit = 500
  let x0 = dom.min
  let k = 0
  while (x0 < dom.max - step * 0.000001 && k < limit) {
    out.push({ x0, x1: x0 + step, count: 0.0 })
    x0 = x0 + step
    k = k + 1
  }
  if (out.length === 0) out.push({ x0: dom.min, x1: dom.max, count: 0.0 })
  const last = out.length - 1
  for (const v of finite) {
    // The bin index as an INT, by walking the edges: `Math.floor` yields a
    // Double on both native targets and cannot index a list. The walk also
    // clamps — a value below the first edge stays in bin 0, one past the
    // last edge lands in the last (closed) bin.
    let idx = 0
    let edge = dom.min + step
    while (edge <= v && idx < last) {
      idx = idx + 1
      edge = edge + step
    }
    out[idx]!.count = out[idx]!.count + 1.0
  }
  return out
}

/**
 * A bin's axis label — its half-open range, `x0–x1`.
 *
 * In the engine rather than in the web `histogram()` helper because the
 * native `<Histogram>` desugar needs the SAME string: a bin labelled one way
 * on the web and another on iOS is the kind of divergence nobody notices
 * until a screenshot is compared.
 */
export function binLabel(b: Bin): string {
  return `${plain(b.x0)}–${plain(b.x1)}`
}
