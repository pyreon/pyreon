// The decimation ARITHMETIC — plain `Double[]` in, `number[]` (indices) out, no
// `Pt`, no generics — so it crosses to Swift and Kotlin through the generated
// chart engine.
//
// Split out of `decimate.ts` for the same reason `indicator-values.ts` was split
// out of `indicators.ts`: the wrapper beside it takes `Pt[]`, and one
// non-crossing signature in a file takes the WHOLE file web-only.
//
// Everything here indexes and loops on INTEGERS. The obvious formulation of
// LTTB computes bucket edges as `Math.floor(i * every)` over a fractional
// `every`, and that does not cross: `Math.floor` lowers to a Double, a Double
// cannot bound a Swift `for … in a..<b` or a Kotlin `for (i in a until b)`, and
// `min(n, floor(x))` mixes Int with Double. Division is no escape — the
// emitters wrap BOTH operands of `/` in `Double`, so there is no integer
// division to fall back on. Bucket edges are therefore advanced by integer
// ACCUMULATION, which equals the floor of the fraction exactly and never leaves
// the integers. (Verified by generating the engine and reading the emit: the
// previous formulation produced `for j in avgStart..<avgEnd` with Double bounds
// and `values[start]` with a Double subscript, neither of which compiles.)

import { scaleLinear } from './scale'
import type { Domain, Double, Pt, Rect } from './types'

/**
 * The bucket edges of a decimation pass: `edge(i) = floor(i * span / count)` for
 * `i` in `0…count + 1`, computed without a division or a floor.
 *
 * Each step adds `span` to a running remainder and carries whole `count`s out of
 * it. The carry loop advances `edge` a total of `span` times across the whole
 * pass, so this is O(span + count) — the same order as the walk that consumes
 * it.
 */
function bucketEdges(span: number, count: number): number[] {
  const edges: number[] = [0]
  let acc = 0
  let edge = 0
  // A `while` rather than a `for`, because the counter is not read in the body
  // and swiftc warns on an unused loop binding — a warning in GENERATED code is
  // noise every consumer of the runtime sees.
  let i = 0
  while (i <= count) {
    acc = acc + span
    while (acc >= count) {
      acc = acc - count
      edge = edge + 1
    }
    edges.push(edge)
    i = i + 1
  }
  return edges
}

/**
 * The x of point `i` — the INDEX when `xs` is empty.
 *
 * A function, and `i * 1.0`, for one native reason each. Written inline as
 * `useIndexX ? i : xs[i]` Kotlin types the branch as `Number & Comparable<*>`
 * (the common supertype of Int and Double) and then refuses to add it to a
 * Double; Swift coerced it and Kotlin did not, so the emit compiled on one
 * target only. `i * 1.0` promotes the Int to a Double on both, at a single
 * place instead of at each of the three read sites.
 */
function xOf(xs: Double[], i: number): Double {
  if (xs.length === 0) return i * 1.0
  return xs[i]!
}

/**
 * Largest-Triangle-Three-Buckets, as the INDICES it keeps.
 *
 * Chosen over naive every-nth sampling because nth-sampling DROPS SPIKES: a
 * one-sample spike between two sampled indices disappears entirely, which on a
 * monitoring chart is the single most important feature to preserve. LTTB picks
 * the point in each bucket forming the largest triangle with its neighbours,
 * which keeps visual extremes.
 *
 * Indices rather than points, because every caller wants them: the web maps them
 * back to rows so a hit still reports the GLOBAL index of the datum it drew, and
 * the native emit slices its row array through them so every mark, category and
 * error bar stays aligned on the same rows.
 *
 * `xs` EMPTY means "x is the index" — the chart's case on both platforms, where
 * rows are evenly spaced and materialising `0…n-1` would be an allocation per
 * decimation for no information. Pass real x values (same length as `ys`) when
 * they carry meaning, which is what the public `lttb(Pt[])` wrapper does.
 *
 * Returns an EMPTY array when nothing would be dropped, which callers read as
 * "use the rows as they are" rather than materialising an identity map.
 *
 * NOTE this selects different points than the version that shipped through
 * 0.51, and deliberately: that one indexed its buckets one place to the right,
 * which had two consequences. The first interior bucket was never considered at
 * all, and the last one degenerated to the half-open range `[n-1, n-1)` — no
 * candidates, so `best` kept its initial value of `n - 1` and the pinned final
 * row was emitted TWICE. Measured across 3,781 (size, threshold) pairs, 3,608
 * of them ended in a duplicate, so `maxPoints={N}` drew `N - 1` distinct rows.
 * The same shift made the third triangle vertex the centroid of the bucket
 * being selected FROM rather than the next one, which is not the LTTB criterion
 * — the comment beside it said "next bucket" while the indices said otherwise.
 */
export function lttbIndices(xs: Double[], ys: Double[], threshold: number): number[] {
  const n = ys.length
  if (threshold >= n || threshold < 3) return []

  const span = n - 2
  const count = threshold - 2
  const edges = bucketEdges(span, count)

  const out: number[] = [0]
  let a = 0

  for (let i = 0; i < count; i++) {
    // Bucket `i` covers the interior rows `[edge(i) + 1, edge(i + 1) + 1)`; the
    // `+ 1` skips the pinned first row, and the last bucket therefore stops
    // BEFORE `n - 1`, which the pinned last row occupies.
    const lo = edges[i]! + 1
    const hi = edges[i + 1]! + 1

    // The third triangle vertex is the centroid of the NEXT bucket. For the
    // final bucket there is none, so it falls back to its own — the alternative
    // is a zero-area comparison that would always select the first candidate.
    let avgLo = edges[i + 1]! + 1
    let avgHi = edges[i + 2]! + 1
    if (avgHi > n) avgHi = n
    let avgCount = avgHi - avgLo
    /* v8 ignore next 5 — defensive: `count` is `threshold - 2` and the guard
       above keeps `threshold < n`, so `count <= span - 1` and every bucket
       window holds at least one row. Kept because the arithmetic crosses to
       Swift/Kotlin, where an empty window would subscript out of range. */
    if (avgCount < 1) {
      avgLo = lo
      avgHi = hi
      avgCount = hi - lo
      if (avgCount < 1) avgCount = 1
    }

    let avgX = 0.0
    let avgY = 0.0
    for (let j = avgLo; j < avgHi; j++) {
      avgX = avgX + xOf(xs, j)
      avgY = avgY + ys[j]!
    }
    avgX = avgX / avgCount
    avgY = avgY / avgCount

    const paX = xOf(xs, a)
    const paY = ys[a]!
    let best = lo
    let bestArea = -1.0
    for (let j = lo; j < hi; j++) {
      const pX = xOf(xs, j)
      const pY = ys[j]!
      const area = Math.abs((paX - avgX) * (pY - paY) - (paX - pX) * (avgY - paY))
      if (area > bestArea) {
        bestArea = area
        best = j
      }
    }
    out.push(best)
    a = best
  }

  out.push(n - 1)
  return out
}

/**
 * Min/max decimation over raw values, for bars and dense line series.
 *
 * Keeps BOTH extremes per bucket, so the drawn envelope still covers the real
 * range — a mean would smooth away exactly the outliers a reader is looking for.
 *
 * Bucket edges come from the same integer accumulation as LTTB's, for the same
 * reason: `Math.floor(b * size)` cannot bound a native loop.
 */
export function minMaxBuckets(values: Double[], buckets: number): Double[] {
  const n = values.length
  if (buckets <= 0 || n <= buckets * 2) return values

  const edges = bucketEdges(n, buckets)
  const out: Double[] = []

  for (let b = 0; b < buckets; b++) {
    const start = edges[b]!
    let end = edges[b + 1]!
    if (end > n) end = n
    if (start >= end) continue

    let lo = values[start]!
    let hi = values[start]!
    for (let i = start; i < end; i++) {
      const v = values[i]!
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    // Emit in the order they occur so the line does not zig-zag backwards.
    out.push(lo)
    out.push(hi)
  }
  return out
}

/**
 * M4 over already-placed polyline points: per column keep the first, the
 * lowest, the highest and the last point, in drawing order. Columns are
 * `1 / perPx` CSS pixels wide — half a pixel by default, so a 2× display's
 * device pixels each get their own column.
 *
 * A line with more points than pixels cannot show them — a 1,000,000-point
 * series on an 800px plot draws 1,250 segments per column on top of each
 * other. Keeping those four per column draws the SAME pixels (every vertical
 * extent and every column-to-column join survives) from at most 4 × width
 * points (8 × width at the default resolution), which is what uPlot does. Points must run left to right; anything
 * else (a horizontal chart, a scatter) is returned untouched, as is a line
 * already sparse enough.
 */
export function m4Pixels(pts: Pt[], perPx: Double = 2.0): Pt[] {
  const n = pts.length
  if (n < 8) return pts
  const span = pts[n - 1]!.x - pts[0]!.x
  if (!(n > span * perPx * 4.0 + 8.0)) return pts
  for (let i = 1; i < n; i++) if (pts[i]!.x < pts[i - 1]!.x) return pts
  const out: Pt[] = []
  let i = 0
  while (i < n) {
    const col = Math.floor(pts[i]!.x * perPx)
    const first = i
    let lo = i
    let hi = i
    let j = i
    while (j < n && Math.floor(pts[j]!.x * perPx) === col) {
      if (pts[j]!.y < pts[lo]!.y) lo = j
      if (pts[j]!.y > pts[hi]!.y) hi = j
      j = j + 1
    }
    const last = j - 1
    out.push(pts[first]!)
    const a = lo < hi ? lo : hi
    const b = lo < hi ? hi : lo
    if (a !== first) out.push(pts[a]!)
    if (b !== a && b !== last) out.push(pts[b]!)
    if (last !== first && last !== a) out.push(pts[last]!)
    i = j
  }
  return out
}

/**
 * `m4Pixels` over a category line, computed from the VALUES: the same points
 * `m4Pixels(layoutSeriesPoints(values, plot, dom))` returns, without placing
 * one point object per datum first. At 1M values that placement was ~40% of
 * mount time, mostly the garbage collector reclaiming points M4 then dropped
 * — uPlot reduces from its value arrays for the same reason.
 *
 * Picks per column the first datum, the lowest and highest VALUE (the lowest
 * and highest y, in either axis direction) and the last, with the same
 * first-occurrence ties, so the output is identical to the placed path.
 * Returns an EMPTY list when the line is not dense enough to reduce or has a
 * gap (a gap splits the line into runs, which the general path handles).
 */
/** A category datum's x — `layoutSeriesPoints`' own expression, so the value path and the placed path agree to the bit. */
function bandCenter(x: Double, band: Double, k: number): Double {
  return x + band * k + band / 2.0
}

export function m4CategoryPoints(values: Double[], plot: Rect, dom: Domain, perPx: Double = 2.0): Pt[] {
  // "Declined" is an EMPTY list rather than null: the engine's optional
  // narrowing does not carry into the generated Swift.
  const out: Pt[] = []
  const n = values.length
  if (n < 8) return out
  const band = plot.w / n
  const span = (bandCenter(plot.x, band, (n - 1))) - (plot.x + band / 2.0)
  if (!(n > span * perPx * 4.0 + 8.0)) return out
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    if (!(v - v === 0.0)) return out
  }
  // The same expressions `layoutSeriesPoints` evaluates, so every kept point
  // is bit-identical to the one the placed path would have produced.
  const top = plot.y + plot.h
  let i = 0
  while (i < n) {
    const col = Math.floor((bandCenter(plot.x, band, i)) * perPx)
    const first = i
    let lo = i
    let hi = i
    let loY = scaleLinear(dom, top, plot.y, values[i]!)
    let hiY = loY
    let j = i
    while (j < n && Math.floor((bandCenter(plot.x, band, j)) * perPx) === col) {
      const y = scaleLinear(dom, top, plot.y, values[j]!)
      if (y < loY) {
        lo = j
        loY = y
      }
      if (y > hiY) {
        hi = j
        hiY = y
      }
      j = j + 1
    }
    const last = j - 1
    const a = lo < hi ? lo : hi
    const b = lo < hi ? hi : lo
    out.push({ x: bandCenter(plot.x, band, first), y: scaleLinear(dom, top, plot.y, values[first]!) })
    if (a !== first) out.push({ x: bandCenter(plot.x, band, a), y: scaleLinear(dom, top, plot.y, values[a]!) })
    if (b !== a && b !== last) out.push({ x: bandCenter(plot.x, band, b), y: scaleLinear(dom, top, plot.y, values[b]!) })
    if (last !== first && last !== a) out.push({ x: bandCenter(plot.x, band, last), y: scaleLinear(dom, top, plot.y, values[last]!) })
    i = j
  }
  return out
}
