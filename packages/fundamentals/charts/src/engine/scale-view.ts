// Non-linear value axes as a VIEW: `log`, `sqrt` and `symlog`.
//
// A chart on one of these scales lays out LINEARLY over transformed values (the
// same trick the y-log view has always used): `geometrySpec` replaces each value
// with `viewForward(kind, v)` and pins the domain to the transformed bounds, so
// bars, lines, points, hits, the crosshair and annotations all use the ordinary
// arithmetic. The ticks are the only place the real values reappear: they are
// "nice" in the REAL space and positioned through the transform.
//
// What a scale does with a value it cannot place:
//   - log:    a value <= 0 is a gap
//   - sqrt:   a value <  0 is a gap
//   - symlog: nothing is a gap (sign(v) * log10(1 + |v|): linear-looking near
//             zero, logarithmic far from it; the constant is 1, fixed)
// A gap is NaN, which the engine already draws as nothing (and never as a NaN
// pixel). This file is shared by the web and the native engines, so a log, sqrt
// or symlog axis is the same axis on every target.

import { groupThousands } from './format'
import type { Formatter } from './format'
import { makeTicks, scaleLinear } from './scale'
import { logViewTicks } from './scale-extra'
import type { Domain, Double, Tick } from './types'

/** A real value as its view value; NaN (a gap) where the scale cannot place it. `lo` is the log floor (the real value that maps to 0). */
export function viewForward(kind: string, v: Double, lo: Double): Double {
  if (kind === 'log') return v > 0.0 ? Math.log10(v / lo) : 0.0 / 0.0
  if (kind === 'sqrt') return v >= 0.0 ? Math.sqrt(v) : 0.0 / 0.0

  return v >= 0.0 ? Math.log10(1.0 + v) : -Math.log10(1.0 - v)
}

/** The view domain of a real domain. */
export function viewDomain(kind: string, real: Domain): Domain {
  const lo = real.min > 0.0 ? real.min : 1.0

  return kind === 'log' ? { min: 0.0, max: Math.log10(real.max / lo) } : { min: viewForward(kind, real.min, lo), max: viewForward(kind, real.max, lo) }
}

/** Decade ticks of a symlog axis: 0 and +/- 1, 10, 100, ... inside the real domain. */
function symlogTicks(real: Domain, view: Domain, r0: Double, r1: Double, fmt: Formatter): Tick[] {
  const out: Tick[] = []
  const reach = Math.max(Math.abs(real.min), Math.abs(real.max))
  const decades = reach >= 1.0 ? Math.floor(Math.log10(reach)) : 0.0
  const push = (v: Double): void => {
    if (v >= real.min - 1e-9 * reach && v <= real.max + 1e-9 * reach) out.push({ value: v, pos: scaleLinear(view, r0, r1, viewForward('symlog', v, 1.0)), label: fmt(v) })
  }
  let down = decades
  while (down >= 0.0) {
    push(-Math.pow(10.0, down))
    down = down - 1.0
  }
  push(0.0)
  let up = 0.0
  while (up <= decades) {
    push(Math.pow(10.0, up))
    up = up + 1.0
  }

  return out
}

/**
 * Ticks for a view axis, labelled with the REAL values: decades (with 1-2-5
 * minors when the span is short) for log, the ordinary nice values for sqrt,
 * decades either side of zero for symlog.
 */
export function viewTicks(kind: string, real: Domain, r0: Double, r1: Double, count: Double, format?: Formatter): Tick[] {
  const view = viewDomain(kind, real)
  if (kind === 'log') return logViewTicks(real.min, real.max, r0, r1, format)
  if (kind === 'symlog') return symlogTicks(real, view, r0, r1, format ?? groupThousands)
  const out: Tick[] = []
  for (const t of makeTicks(real, 0.0, 1.0, count, format)) out.push({ value: t.value, pos: scaleLinear(view, r0, r1, viewForward('sqrt', t.value, 1.0)), label: t.label })

  return out
}
