// The indicator ARITHMETIC — pure `Double[]` over `Double[]`, no accessors and
// no generics, so it crosses to Swift and Kotlin through the generated chart
// engine.
//
// Split out of `indicators.ts` for exactly that reason: the mark
// constructors beside it are generic (`sma<T>(y, window)`), and PMTC cannot
// represent a type parameter — the generator REFUSES an emit with warnings,
// so one generic function in the file would take the whole thing web-only.
// Same shape as `boxplot.ts` / `boxplot-chart.ts`.
import type { Double } from './types'

/**
 * Finite check written for the native subset — the same one `render.ts` uses.
 *
 * `Number.isFinite` has no lowering inside a crossing module: the generator
 * emits it VERBATIM and does not warn, so the first sign is `cannot find
 * 'Number' in scope` from swiftc. A NaN is the only value not equal to
 * itself, and this arithmetic never produces infinities.
 */
function finite(v: Double): boolean {
  return v === v
}

/**
 * `window` is an INTEGER count by contract.
 *
 * These functions used to `Math.floor` it defensively, and `Math.floor` has
 * no lowering here — it produces a `Double` that then cannot index or compare
 * against the `Int` loop counter, and the generator does not warn: the first
 * sign is `operator '==' cannot be applied to 'Int' and 'Double'` from
 * kotlinc. The rounding moved to the mark constructors in `indicators.ts`,
 * which is where a user-supplied window actually arrives.
 */

/** NaN, written so it lowers — the gap marker this file produces. */
const GAP: Double = 0.0 / 0.0

// Technical indicators — derived line marks over a series (Highcharts Stock's
// vocabulary: SMA, EMA, Bollinger bands, a linear trend).
//
// Each indicator is a MARK whose values are computed from the whole series
// rather than per datum, through `Mark.transform`. Warm-up positions (the
// first `window - 1` points of a moving average) are NaN, which the engine
// renders as a GAP — the line starts where the indicator is defined instead
// of lying with a zero. Pure, Double-only, so the math lowers to native.


/** Simple moving average over a trailing window. */
export function smaValues(values: Double[], window: number): Double[] {
  const n = values.length
  const out: Double[] = []
  const w = window < 1 ? 1 : window
  let sum = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    sum = sum + (finite(v) ? v : 0.0)
    if (i >= w) {
      const gone = values[i - w]!
      sum = sum - (finite(gone) ? gone : 0.0)
    }
    out.push(i >= w - 1 ? sum / w : GAP)
  }
  return out
}

/** Exponential moving average; seeded with the first window's SMA. */
export function emaValues(values: Double[], window: number): Double[] {
  const n = values.length
  const out: Double[] = []
  const w = window < 1 ? 1 : window
  const alpha = 2.0 / (w + 1.0)
  let prev = GAP
  let seed = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const vv = finite(v) ? v : 0.0
    if (i < w - 1) {
      seed = seed + vv
      out.push(GAP)
    } else if (i === w - 1) {
      prev = (seed + vv) / w
      out.push(prev)
    } else {
      prev = vv * alpha + prev * (1.0 - alpha)
      out.push(prev)
    }
  }
  return out
}

/** Rolling standard deviation (population) over a trailing window. */
export function stdevValues(values: Double[], window: number): Double[] {
  const n = values.length
  const out: Double[] = []
  const w = window < 1 ? 1 : window
  for (let i = 0; i < n; i++) {
    if (i < w - 1) {
      out.push(GAP)
      continue
    }
    let mean = 0.0
    for (let k = i - w + 1; k <= i; k++) mean = mean + values[k]!
    mean = mean / w
    let acc = 0.0
    for (let k = i - w + 1; k <= i; k++) {
      const d = values[k]! - mean
      acc = acc + d * d
    }
    out.push(Math.sqrt(acc / w))
  }
  return out
}

/** Least-squares line through the series, evaluated at every index. */
export function trendValues(values: Double[]): Double[] {
  const n = values.length
  const out: Double[] = []
  if (n === 0) return out
  let sx = 0.0
  let sy = 0.0
  let sxx = 0.0
  let sxy = 0.0
  let m = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    if (!finite(v)) continue
    const x = i * 1.0
    sx = sx + x
    sy = sy + v
    sxx = sxx + x * x
    sxy = sxy + x * v
    m = m + 1.0
  }
  const denom = m * sxx - sx * sx
  const slope = m < 2.0 || denom === 0.0 ? 0.0 : (m * sxy - sx * sy) / denom
  const intercept = m === 0.0 ? 0.0 : (sy - slope * sx) / m
  for (let i = 0; i < n; i++) out.push(intercept + slope * i)
  return out
}
