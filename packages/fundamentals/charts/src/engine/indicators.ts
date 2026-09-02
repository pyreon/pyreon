// Technical indicators — derived line marks over a series (Highcharts Stock's
// vocabulary: SMA, EMA, Bollinger bands, a linear trend).
//
// Each indicator is a MARK whose values are computed from the whole series
// rather than per datum, through `Mark.transform`. Warm-up positions (the
// first `window - 1` points of a moving average) are NaN, which the engine
// renders as a GAP — the line starts where the indicator is defined instead
// of lying with a zero. Pure, Double-only, so the math lowers to native.

import type { Accessor, Mark, MarkOptions } from './marks'
import type { Double } from './types'

/** Simple moving average over a trailing window. */
export function smaValues(values: Double[], window: number): Double[] {
  const n = values.length
  const out: Double[] = []
  const w = window < 1 ? 1 : Math.floor(window)
  let sum = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    sum = sum + (Number.isFinite(v) ? v : 0.0)
    if (i >= w) {
      const gone = values[i - w]!
      sum = sum - (Number.isFinite(gone) ? gone : 0.0)
    }
    out.push(i >= w - 1 ? sum / w : NaN)
  }
  return out
}

/** Exponential moving average; seeded with the first window's SMA. */
export function emaValues(values: Double[], window: number): Double[] {
  const n = values.length
  const out: Double[] = []
  const w = window < 1 ? 1 : Math.floor(window)
  const alpha = 2.0 / (w + 1.0)
  let prev = NaN
  let seed = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const vv = Number.isFinite(v) ? v : 0.0
    if (i < w - 1) {
      seed = seed + vv
      out.push(NaN)
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
  const w = window < 1 ? 1 : Math.floor(window)
  for (let i = 0; i < n; i++) {
    if (i < w - 1) {
      out.push(NaN)
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
    if (!Number.isFinite(v)) continue
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

function derived<T>(y: Accessor<T>, transform: (values: Double[]) => Double[], options: MarkOptions): Mark<T> {
  return { kind: 'line', y, options, r: undefined, transform }
}

/** A simple-moving-average line over the accessor's values. */
export function sma<T>(y: Accessor<T>, window: number, options: MarkOptions = {}): Mark<T> {
  return derived(y, (v) => smaValues(v, window), options)
}

/** An exponential-moving-average line. */
export function ema<T>(y: Accessor<T>, window: number, options: MarkOptions = {}): Mark<T> {
  return derived(y, (v) => emaValues(v, window), options)
}

/** A least-squares trend line. */
export function trend<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return derived(y, (v) => trendValues(v), options)
}

/**
 * Bollinger bands: [upper, middle, lower] as three line marks — spread them
 * into `marks`. `k` is the band width in standard deviations (2 by default).
 */
export function bollinger<T>(y: Accessor<T>, window: number, k: Double = 2.0, options: MarkOptions = {}): Mark<T>[] {
  const band = (sign: Double): ((v: Double[]) => Double[]) => (v: Double[]): Double[] => {
    const mid = smaValues(v, window)
    const sd = stdevValues(v, window)
    const out: Double[] = []
    for (let i = 0; i < v.length; i++) {
      const m = mid[i]!
      const s = sd[i]!
      out.push(Number.isFinite(m) && Number.isFinite(s) ? m + sign * k * s : NaN)
    }
    return out
  }
  const label = options.label ?? 'Bollinger'
  return [
    derived(y, band(1.0), { ...options, label: label + ' upper' }),
    derived(y, (v) => smaValues(v, window), { ...options, label: label + ' middle' }),
    derived(y, band(-1.0), { ...options, label: label + ' lower' }),
  ]
}
