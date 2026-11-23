// Non-linear value axes as a VIEW: `log`, `sqrt` and `symlog`.
//
// A chart on one of these scales lays out LINEARLY over transformed values (the
// trick the y-log view has always used): `applyScaleView` replaces each value
// with `viewForward(kind, v, param)` and pins the domain to the transformed
// bounds, so bars, lines, points, hits, the crosshair and annotations all use
// the ordinary arithmetic. The ticks are the only place the real values
// reappear: they are "nice" in the REAL space and positioned through the
// transform (`viewTicks`).
//
// What a scale does with a value it cannot place:
//   - log:    a value <= 0 is a gap
//   - sqrt:   a value <  0 is a gap
//   - symlog: nothing is a gap (sign(v) * log10(1 + |v| / c): linear-looking
//             near zero, logarithmic far from it; `c` is the constant, 1 by default)
// A gap is NaN, which the engine already draws as nothing (and never as a NaN
// pixel).
//
// Nothing in the engine core imports this file: a descriptor (`sqrt()`,
// `symlog()`, `log()` in `scale-descriptors.ts`) carries `apply` and `ticks`
// on the spec, so a chart that never imports one does not bundle any of it; the
// native emitter builds the same struct and calls these functions.

import { groupThousands } from './format'
import type { Formatter } from './format'
import { leftAxisSeries, logBounds, pinDomain, seriesOnRightAxis } from './render'
import type { Annotation, ChartSpec, Series } from './render'
import { extent, isFiniteNumber, makeTicks, scaleLinear } from './scale'
import { logViewTicks } from './scale-extra'
import type { Domain, Double, Tick } from './types'

/** A real value as its view value; NaN (a gap) where the scale cannot place it. `param` is the log floor (the real value that maps to 0) or the symlog constant. */
export function viewForward(kind: string, v: Double, param: Double): Double {
  if (kind === 'log') return v > 0.0 ? Math.log10(v / param) : NaN
  if (kind === 'sqrt') return v >= 0.0 ? Math.sqrt(v) : NaN

  return v >= 0.0 ? Math.log10(1.0 + v / param) : -Math.log10(1.0 - v / param)
}

/** The view domain of a real domain. */
export function viewDomain(kind: string, real: Domain, param: Double): Domain {
  const lo = real.min > 0.0 ? real.min : 1.0

  return kind === 'log' ? { min: 0.0, max: Math.log10(real.max / lo) } : { min: viewForward(kind, real.min, param), max: viewForward(kind, real.max, param) }
}

/** Decade ticks of a symlog axis: 0 and +/- 1, 10, 100, ... inside the real domain. */
function symlogTicks(real: Domain, r0: Double, r1: Double, param: Double, fmt: Formatter): Tick[] {
  const view = viewDomain('symlog', real, param)
  const out: Tick[] = []
  const reach = Math.max(Math.abs(real.min), Math.abs(real.max))
  const decades = reach >= 1.0 ? Math.floor(Math.log10(reach)) : 0.0
  // Candidates in ascending order; no closure over `out` or `fmt` (an escaping closure may not capture a non-escaping parameter on Swift).
  const cands: Double[] = []
  let down = decades
  while (down >= 0.0) {
    cands.push(-Math.pow(10.0, down))
    down = down - 1.0
  }
  cands.push(0.0)
  let up = 0.0
  while (up <= decades) {
    cands.push(Math.pow(10.0, up))
    up = up + 1.0
  }
  for (const v of cands) {
    if (v >= real.min - 1e-9 * reach && v <= real.max + 1e-9 * reach) out.push({ value: v, pos: scaleLinear(view, r0, r1, viewForward('symlog', v, param)), label: fmt(v) })
  }

  return out
}

/**
 * Ticks for a view axis, labelled with the REAL values: decades (with 1-2-5
 * minors when the span is short) for log, the ordinary nice values for sqrt,
 * decades either side of zero for symlog.
 */
// oxlint-disable-next-line max-params -- positional like the sibling tick builders (`makeTicks`, `logViewTicks`)
export function viewTicks(kind: string, real: Domain, r0: Double, r1: Double, count: Double, format: Formatter | undefined, param: Double): Tick[] {
  if (kind === 'log') return logViewTicks(real.min, real.max, r0, r1, format)
  if (kind === 'symlog') return symlogTicks(real, r0, r1, param, format ?? groupThousands)
  const out: Tick[] = []
  const view = viewDomain(kind, real, param)
  for (const t of makeTicks(real, 0.0, 1.0, count, format)) out.push({ value: t.value, pos: scaleLinear(view, r0, r1, viewForward('sqrt', t.value, 1.0)), label: t.label })

  return out
}

/** The REAL bounds an x view maps: the placeable extent (log: above zero; sqrt: from zero up). */
function xRealBounds(kind: string, xs: Double[]): Domain {
  const placed: Double[] = []
  for (const x of xs) {
    if (isFiniteNumber(x) && (kind !== 'log' || x > 0.0) && (kind !== 'sqrt' || x >= 0.0)) placed.push(x)
  }

  return placed.length === 0 ? { min: 1.0, max: 10.0 } : extent(placed)
}

/** A reference rule or band in the view; a bound the scale cannot place is dropped like a gap. */
function viewAnnotation(a: Annotation, kind: string, param: Double, onX: boolean): Annotation {
  const map = (v: Double | undefined): Double | undefined => (v === undefined ? v : keepFinite(viewForward(kind, v, param)))
  if (onX) return { ...a, x: map(a.x), xFrom: map(a.xFrom), xTo: map(a.xTo), x1: map(a.x1), x2: map(a.x2) }

  return { ...a, y: map(a.y), yFrom: map(a.yFrom), yTo: map(a.yTo), y1: map(a.y1), y2: map(a.y2) }
}

function keepFinite(v: Double): Double | undefined {
  return isFiniteNumber(v) ? v : undefined
}

/** One series' values and error bounds through the view. */
function viewSeries(s: Series, kind: string, param: Double): Series {
  const values: Double[] = []
  for (const v of s.values) values.push(viewForward(kind, v, param))
  const lows: Double[] = []
  const highs: Double[] = []
  for (const v of s.errLow ?? []) lows.push(viewForward(kind, v, param))
  for (const v of s.errHigh ?? []) highs.push(viewForward(kind, v, param))

  return { ...s, values, errLow: s.errLow === undefined ? undefined : lows, errHigh: s.errHigh === undefined ? undefined : highs }
}

function applyY(spec: ChartSpec, kind: string, param: Double): ChartSpec {
  const real = kind === 'log' ? logBounds(spec) : spec.yDomain ?? pinDomain(spec, leftAxisSeries(spec))
  const bounds = kind === 'sqrt' && real.min < 0.0 ? { min: 0.0, max: real.max } : real
  const lo = kind === 'log' ? bounds.min : param
  const series: Series[] = []
  for (const s of spec.series) series.push(seriesOnRightAxis(s, spec) ? s : viewSeries(s, kind, lo))
  const notes: Annotation[] = []
  for (const a of spec.annotations ?? []) notes.push(viewAnnotation(a, kind, lo, false))

  return { ...spec, series, annotations: spec.annotations === undefined ? undefined : notes, yDomain: viewDomain(kind, bounds, lo), yReal: bounds, yViewApplied: true }
}

function applyX(spec: ChartSpec, kind: string, param: Double): ChartSpec {
  const xs: Double[] = spec.xValues ?? []
  // A time axis (or one with no numeric x) stays linear; the view drops out.
  if (xs.length === 0 || spec.xTime === true) return { ...spec, xView: undefined }
  const real = xRealBounds(kind, xs)
  const lo = kind === 'log' ? real.min : param
  const xView: Double[] = []
  for (const x of xs) xView.push(viewForward(kind, x, lo))
  // A datum whose x the scale cannot place becomes a gap, so no NaN pixel is ever emitted for it.
  const series: Series[] = []
  for (const s of spec.series) {
    const values: Double[] = []
    let i = 0
    for (const v of s.values) {
      values.push(i < xView.length && !isFiniteNumber(xView[i]!) ? NaN : v)
      i = i + 1
    }
    series.push({ ...s, values })
  }
  const notes: Annotation[] = []
  for (const a of spec.annotations ?? []) notes.push(viewAnnotation(a, kind, lo, true))

  return { ...spec, series, annotations: spec.annotations === undefined ? undefined : notes, xValues: xView, xReal: real, xViewApplied: true }
}

/** The spec in a scale's view, for the named axis: what a scale descriptor's `apply` calls. */
export function applyScaleView(spec: ChartSpec, axis: string, kind: string, param: Double): ChartSpec {
  if (axis === 'x') return spec.xViewApplied === true ? spec : applyX(spec, kind, param)

  return spec.yViewApplied === true ? spec : applyY(spec, kind, param)
}
