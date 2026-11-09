// `m4CategoryPoints` skips computing a value's y unless the value passes the
// column's current min or max VALUE. That is exact only because y is monotone
// in the value and the y comparison still decides. This fuzz pins it: the
// shipped loop must return, coordinate for coordinate (`Object.is`, so -0 and
// NaN count), what the loop that computed every y returned. The reference
// below is that previous loop, frozen; it is not shared with the engine.
//
// The cases aim at the places a filter could diverge: values one ulp apart
// (distinct values that round to one y), integer plateaus (ties), a falling
// domain (min > max), `inverse`, a zero-height plot (every y equal), a flat
// domain, domains far narrower or wider than the data, and a gap (declined).
import { describe, expect, it } from 'vitest'
import { m4CategoryPoints, m4Pixels } from './decimate-values'
import { isFiniteChartNumber } from './format'
import { layoutSeriesPoints } from './layout'
import { scaleLinear } from './scale'
import type { Domain, Pt, Rect } from './types'

function bandCenter(x: number, band: number, k: number): number {
  return x + band * k + band / 2.0
}

/** The M4 value loop as it was before the filter: y computed for every value. */
function m4Reference(values: number[], plot: Rect, dom: Domain, perPx = 2.0): Pt[] {
  const out: Pt[] = []
  const n = values.length
  if (n < 8) return out
  const band = plot.w / n
  const span = bandCenter(plot.x, band, n - 1) - (plot.x + band / 2.0)
  if (!(n > span * perPx * 4.0 + 8.0)) return out
  const top = plot.y + plot.h
  const dmin = dom.min
  const dspan = dom.max - dom.min
  const flat = dspan === 0.0
  const inv = dom.inverse === true
  const r0 = inv ? plot.y : top
  const diff = inv ? top - plot.y : plot.y - top
  const flatY = (top + plot.y) / 2.0
  let i = 0
  while (i < n) {
    const col = Math.floor(bandCenter(plot.x, band, i) * perPx)
    let end = i + 1
    while (end < n && Math.floor(bandCenter(plot.x, band, end) * perPx) === col) end++
    const first = i
    if (!isFiniteChartNumber(values[i]!)) return []
    let lo = i
    let hi = i
    let loY = scaleLinear(dom, top, plot.y, values[i]!)
    let hiY = loY
    let j = i + 1
    while (j < end) {
      const v = values[j]!
      if (!isFiniteChartNumber(v)) return []
      const y = flat ? flatY : r0 + ((v - dmin) / dspan) * diff
      if (y < loY) {
        lo = j
        loY = y
      }
      if (y > hiY) {
        hi = j
        hiY = y
      }
      j++
    }
    const last = j - 1
    const a = lo < hi ? lo : hi
    const b = lo < hi ? hi : lo
    const at = (k: number): Pt => ({ x: bandCenter(plot.x, band, k), y: scaleLinear(dom, top, plot.y, values[k]!) })
    out.push(at(first))
    if (a !== first) out.push(at(a))
    if (b !== a && b !== last) out.push(at(b))
    if (last !== first && last !== a) out.push(at(last))
    i = j
  }
  return out
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sameBits(a: Pt[], b: Pt[]): string | null {
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`
  for (let k = 0; k < a.length; k++) {
    if (!Object.is(a[k]!.x, b[k]!.x) || !Object.is(a[k]!.y, b[k]!.y)) {
      return `point ${k}: (${a[k]!.x}, ${a[k]!.y}) vs (${b[k]!.x}, ${b[k]!.y})`
    }
  }
  return null
}

const CASES = 3000

// Backstop, derived rather than guessed: this is deterministic CPU work (3000
// series averaging ~10k values, generated AND re-reduced by the reference), 6.4s
// on a quiet machine under v8 coverage. `Coverage (Full)` runs four packages in
// parallel on a shared runner, where the same work took more than the 20s default
// (≥3.1x slower) and failed the lane on every main push. 60s is ~9x the measured
// local figure; the fuzz keeps all CASES, since fewer would quietly weaken it.
const FUZZ_TIMEOUT_MS = 60_000

describe('m4CategoryPoints value filter', () => {
  it(`returns exactly the every-y loop's points across ${CASES} fuzzed series`, { timeout: FUZZ_TIMEOUT_MS }, () => {
    const r = rng(0x5eed)
    let reduced = 0
    for (let t = 0; t < CASES; t++) {
      const n = 8 + Math.floor(r() * 20_000)
      const kind = t % 6
      let walk = 0
      const vals = Array.from({ length: n }, (_, i) => {
        switch (kind) {
          case 0:
            return r()
          case 1:
            return Math.round(r() * 5)
          case 2:
            return 1 + 1e-12 * r()
          case 3:
            return Math.sin(i) * 1e6
          case 4:
            // Neighbouring doubles: distinct values that share one y.
            return 1 + Math.floor(r() * 4) * Number.EPSILON
          default:
            walk += r() - 0.5
            return walk
        }
      })
      if (t % 97 === 0) vals[Math.floor(r() * n)] = Number.NaN
      let lo = Infinity
      let hi = -Infinity
      for (const v of vals) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      const pad = (t % 5) * 0.1
      const dom: Domain =
        t % 13 === 0
          ? { min: lo, max: lo } // flat
          : t % 7 === 0
            ? { min: hi, max: lo, inverse: t % 2 === 0 } // falling
            : t % 11 === 1
              ? { min: lo + (hi - lo) / 3, max: hi - (hi - lo) / 3, inverse: t % 2 === 0 } // narrower than the data
              : { min: lo - (t % 3), max: hi + pad, inverse: t % 2 === 0 }
      const plot: Rect = { x: 13.3 * (t % 3), y: 7, w: 100 + (t % 9) * 37, h: t % 11 === 0 ? 0 : 300 }
      const got = m4CategoryPoints(vals, plot, dom)
      if (got.length > 0) reduced++
      const diff = sameBits(got, m4Reference(vals, plot, dom))
      expect(diff, `case ${t} (kind ${kind}, n ${n})`).toBeNull()
    }
    // The fuzz must exercise the reducing path, not only the declines.
    expect(reduced).toBeGreaterThan(CASES * 0.8)
  })

  it('the frozen reference agrees with reducing the placed points', () => {
    const r = rng(7)
    for (let t = 0; t < 40; t++) {
      const n = 12_000 + Math.floor(r() * 30_000)
      const vals = Array.from({ length: n }, () => Math.round(r() * 40) / 8)
      const plot: Rect = { x: 21.5, y: 9, w: 300 + t * 11, h: 250 }
      const dom: Domain = { min: t % 3 === 0 ? 5 : 0, max: t % 3 === 0 ? 0 : 5, inverse: t % 2 === 0 }
      const ref = m4Reference(vals, plot, dom)
      expect(ref.length).toBeGreaterThan(0)
      expect(ref).toEqual(m4Pixels(layoutSeriesPoints(vals, plot, dom)))
    }
  })
})
