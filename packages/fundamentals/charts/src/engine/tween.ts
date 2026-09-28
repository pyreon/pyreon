// Value tweens — the update-animation primitive: a pure frame between two
// value sets, so a host can animate a data change instead of snapping.

import type { Double } from './types'

/** Ease-out cubic: fast rise, gentle settle. */
export function easeOutCubic(t: Double): Double {
  const c = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
  return 1.0 - Math.pow(1.0 - c, 3.0)
}

/** True when every series has the same length in both sets. */
export function sameShape(a: Double[][], b: Double[][]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i]!.length !== b[i]!.length) return false
  return true
}

/** True when every value is identical (NaN equals NaN). */
export function sameValues(a: Double[][], b: Double[][]): boolean {
  if (!sameShape(a, b)) return false
  for (let i = 0; i < a.length; i++) {
    const ra = a[i]!
    const rb = b[i]!
    for (let j = 0; j < ra.length; j++) {
      const x = ra[j]!
      const y = rb[j]!
      if (x !== y && !(x !== x && y !== y)) return false
    }
  }
  return true
}

/**
 * The frame at `t` (0..1) between two value sets of the same shape. A gap
 * (NaN) on the TARGET side stays a gap; a value replacing a gap snaps in,
 * because there is nothing to tween from — neither ever passes through zero.
 */
export function tweenValues(from: Double[][], to: Double[][], t: Double): Double[][] {
  const e = easeOutCubic(t)
  return to.map((row, i) => {
    const prev = from[i]
    if (prev === undefined || prev.length !== row.length) return row.slice()
    return row.map((v, j) => {
      const f = prev[j]!
      if (v !== v || f !== f) return v
      return f + (v - f) * e
    })
  })
}

/** Series kinds whose datum has a length from a baseline, so an entering row can GROW from zero. */
function growsFromBaseline(kind: string): boolean {
  return kind === 'bars' || kind === 'stacked' || kind === 'grouped' || kind === 'area' || kind === 'stackedArea' || kind === 'waterfall'
}

/**
 * The previous frame's values realigned to the NEW rows by key, so a keyed
 * update tweens each row from ITS OWN old value — D3's data join.
 *
 * Matched by position instead, a sliding window (drop the oldest row, append
 * a new one) animates every bar toward its neighbour's value, and a row
 * inserted at the front shifts the whole chart through a wrong intermediate
 * state. A row with no old counterpart ENTERS: bars and areas grow from 0, a
 * line or point appears in place (a gap on the `from` side snaps in).
 */
export function alignByKey(from: Double[][], fromKeys: string[], toKeys: string[], kinds: string[]): Double[][] {
  const index = new Map<string, number>()
  for (let i = 0; i < fromKeys.length; i++) if (!index.has(fromKeys[i]!)) index.set(fromKeys[i]!, i)
  return kinds.map((kind, s) => {
    const prev = from[s] ?? []
    const enter = growsFromBaseline(kind) ? 0.0 : Number.NaN
    return toKeys.map((k) => {
      const j = index.get(k)
      return j === undefined || j >= prev.length ? enter : prev[j]!
    })
  })
}

/** True when two key lists are identical, in order. */
export function sameKeys(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
