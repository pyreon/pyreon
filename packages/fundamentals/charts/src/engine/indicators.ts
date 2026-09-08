// Indicator MARKS — the generic constructors over an accessor.
//
// The arithmetic lives in `indicator-values.ts` and CROSSES to native; these
// are generic in the row type, which PMTC cannot represent, so they stay web.
import type { Accessor, Mark, MarkOptions } from './marks'
import type { Double } from './types'
import { emaValues, smaValues, stdevValues, trendValues } from './indicator-values'

export { emaValues, smaValues, stdevValues, trendValues }


function derived<T>(y: Accessor<T>, transform: (values: Double[]) => Double[], options: MarkOptions): Mark<T> {
  return { kind: 'line', y, options, r: undefined, transform }
}

/** A simple-moving-average line over the accessor's values. */
export function sma<T>(y: Accessor<T>, window: number, options: MarkOptions = {}): Mark<T> {
  // Rounded HERE, not in the arithmetic: `Math.floor` does not cross to
  // native, and this is where a user-supplied window arrives.
  return derived(y, (v) => smaValues(v, Math.floor(window)), options)
}

/** An exponential-moving-average line. */
export function ema<T>(y: Accessor<T>, window: number, options: MarkOptions = {}): Mark<T> {
  return derived(y, (v) => emaValues(v, Math.floor(window)), options)
}

/** A least-squares trend line. */
export function trend<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return derived(y, (v) => trendValues(v), options)
}

/**
 * Bollinger bands: the envelope as a filled `band`, plus the middle line —
 * two marks, spread them into `marks`. `k` is the band width in standard
 * deviations (2 by default).
 *
 * It used to return THREE lines. The mark is named "bands", every charting
 * tool draws it as a shaded channel, and a `band` could not express it until
 * a band's bounds could be COMPUTED from the series rather than read off each
 * datum (`Mark.transform2`). Three thin lines was the shape the engine could
 * build, not the shape the indicator is.
 *
 * Breaking for anyone destructuring three marks — deliberately, per the
 * repo's pre-1.0 preference for a clean API over a compatibility shim.
 */
export function bollinger<T>(y: Accessor<T>, window: number, k: Double = 2.0, options: MarkOptions = {}): Mark<T>[] {
  const edge = (sign: Double): ((v: Double[]) => Double[]) => (v: Double[]): Double[] => {
    const mid = smaValues(v, Math.floor(window))
    const sd = stdevValues(v, Math.floor(window))
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
    {
      kind: 'band',
      y,
      options: { ...options, label: label + ' band' },
      r: undefined,
      transform: edge(1.0),
      transform2: edge(-1.0),
      errorLow: undefined,
      errorHigh: undefined,
    },
    derived(y, (v) => smaValues(v, Math.floor(window)), { ...options, label: label + ' middle' }),
  ]
}
