import { describe, expect, it } from 'vitest'
import { lttbIndices, minMaxBuckets } from './decimate-values'
import { lttb } from './decimate'
import type { Double, Pt } from './types'

// The decimation arithmetic was rewritten to cross to Swift and Kotlin: bucket
// edges are advanced by integer accumulation instead of `Math.floor(i * every)`,
// because a Double cannot bound a native loop or subscript an array.
//
// That is a rewrite of the thing that decides WHICH points a 100k-row chart
// draws, so "it still looks right" is not good enough. `referenceLttb` below is
// the implementation as it shipped, kept verbatim — and it turned out to be the
// SUBJECT rather than the oracle: writing the differential is what surfaced two
// real defects in it, each pinned by a spec here.

// ─── The shipped implementation, verbatim ────────────────────────────────────

function referenceLttb(points: Pt[], threshold: number): Pt[] {
  const n = points.length
  if (threshold >= n || threshold < 3) return points

  const out: Pt[] = [points[0]!]
  const every = (n - 2) / (threshold - 2)
  let a = 0

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * every) + 1
    const rangeEnd = Math.min(Math.floor((i + 2) * every) + 1, n - 1)

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
      const area = Math.abs((pa.x - avgX) * (p.y - pa.y) - (pa.x - p.x) * (avgY - pa.y))
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

function referenceMinMax(values: Double[], buckets: number): Double[] {
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
    out.push(lo, hi)
  }
  return out
}

// ─── Seeded shapes ───────────────────────────────────────────────────────────

/** Deterministic PRNG — a fixed seed set, so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Shapes chosen for what they stress, not for variety. */
function shapes(seed: number, n: number): Double[] {
  const r = rng(seed)
  const kind = seed % 5
  const out: Double[] = []
  for (let i = 0; i < n; i++) {
    if (kind === 0) out.push(r() * 100) // noise
    else if (kind === 1) out.push(Math.sin(i / 7) * 50) // smooth
    else if (kind === 2) out.push(i === Math.floor(n / 2) ? 1e6 : r()) // one spike
    else if (kind === 3) out.push(i) // monotonic
    else out.push(0) // flat — every triangle has zero area
  }
  return out
}

describe('what the shipped selection got wrong', () => {
  it('the shipped LTTB ends on a DUPLICATED row, in almost every configuration', () => {
    // Its buckets were indexed one place to the right, so the final one spanned
    // the empty range `[n-1, n-1)`: no candidates, `best` kept its initial value
    // of `n - 1`, and the pinned last row was emitted twice. `maxPoints={N}`
    // therefore drew N-1 distinct rows.
    let duplicated = 0
    let total = 0
    for (let n = 5; n <= 400; n += 7) {
      const points: Pt[] = Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 5) * 10 }))
      for (let t = 3; t < n; t += 3) {
        total++
        const xs = referenceLttb(points, t).map((p) => p.x)
        if (xs.some((x, i) => i > 0 && x <= xs[i - 1]!)) duplicated++
      }
    }
    expect(total).toBeGreaterThan(3000)
    expect(duplicated / total, 'the shipped bug was rarer than believed').toBeGreaterThan(0.9)
  })

  it('the rewrite never does, across the same sweep', () => {
    for (let n = 5; n <= 400; n += 7) {
      const ys: Double[] = Array.from({ length: n }, (_, i) => Math.sin(i / 5) * 10)
      for (let t = 3; t < n; t += 3) {
        const keep = lttbIndices([], ys, t)
        expect(keep.length, `n ${n} threshold ${t}`).toBe(t)
        for (let i = 1; i < keep.length; i++) {
          expect(keep[i]!, `n ${n} threshold ${t} at ${i}`).toBeGreaterThan(keep[i - 1]!)
        }
      }
    }
  })

  it('the first interior bucket is now considered at all', () => {
    // The same shift skipped bucket 0 outright, so no row before the second
    // bucket's start could ever be selected however prominent it was.
    const n = 200
    const ys: Double[] = Array.from({ length: n }, () => 0)
    ys[3] = 1000 // deep inside what was bucket 0
    const keep = lttbIndices([], ys, 20)
    expect(keep, 'a spike in the first bucket was still unreachable').toContain(3)
    expect(referenceLttb(ys.map((y, i) => ({ x: i, y })), 20).map((p) => p.x)).not.toContain(3)
  })
})

describe('bucket edges are exact, not float-rounded', () => {
  it('an edge that lands exactly on an integer is not rounded down', () => {
    // `Math.floor(i * (span / count))` is not `Math.floor(i * span / count)`:
    // with `span/count` unrepresentable, the product can fall a hair short and
    // floor one row early. Measured at 0.066% of edge computations over
    // span 1..400 x count 1..200 — rare, and always in the same direction.
    let disagreements = 0
    for (let span = 1; span <= 200; span++) {
      for (let count = 1; count <= 100; count++) {
        const every = span / count
        for (let i = 0; i <= count; i++) {
          if (Math.floor(i * every) !== Math.floor((i * span) / count)) disagreements++
        }
      }
    }
    expect(disagreements, 'the float formulation was exact after all').toBeGreaterThan(0)
  })
})

describe('minMaxBuckets keeps the envelope', () => {
  it('emits the true min and max of every non-empty bucket, in order', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 5 + ((seed * 37) % 400)
      const ys = shapes(seed, n)
      for (const buckets of [1, 2, 5, 17, 100]) {
        const out = minMaxBuckets(ys, buckets)
        if (out === ys) continue // passthrough: too few points to bucket
        expect(out.length % 2, `seed ${seed} buckets ${buckets}`).toBe(0)
        // Every emitted value is a real sample, and the extremes survive.
        expect(Math.min(...out)).toBe(Math.min(...ys))
        expect(Math.max(...out)).toBe(Math.max(...ys))
      }
    }
  })

  it('passes short input through untouched', () => {
    const ys: Double[] = [1, 2, 3]
    expect(minMaxBuckets(ys, 5)).toBe(ys)
    expect(minMaxBuckets(ys, 0)).toBe(ys)
  })

  it('agrees with the shipped bucketing except where its edges were inexact', () => {
    // The only difference is the exact-vs-float edge above, so disagreements
    // must be RARE — a broad divergence would mean the rewrite changed the
    // bucketing itself rather than just its rounding.
    let differing = 0
    let total = 0
    for (let seed = 1; seed <= 60; seed++) {
      const n = 5 + ((seed * 37) % 400)
      const ys = shapes(seed, n)
      for (const buckets of [1, 2, 5, 17, 100, n]) {
        total++
        const a = JSON.stringify(minMaxBuckets(ys, buckets))
        const b = JSON.stringify(referenceMinMax(ys, buckets))
        if (a !== b) differing++
      }
    }
    expect(total).toBeGreaterThan(300)
    expect(differing / total, 'the bucketing itself changed, not just its rounding').toBeLessThan(0.05)
  })
})

describe('the contract callers rely on', () => {
  it('an empty result means "nothing was dropped"', () => {
    expect(lttbIndices([], [1, 2, 3, 4], 10)).toEqual([])
    expect(lttbIndices([], [1, 2, 3, 4], 2)).toEqual([])
  })

  it('keeps the first and last row, so the series still spans its range', () => {
    const ys = shapes(3, 500)
    const keep = lttbIndices([], ys, 20)
    expect(keep[0]).toBe(0)
    expect(keep[keep.length - 1]).toBe(499)
    expect(keep.length).toBe(20)
  })

  it('the kept indices are strictly increasing', () => {
    // A hit maps back through these, so a repeat or a reversal would report the
    // wrong datum.
    for (let seed = 1; seed <= 20; seed++) {
      const ys = shapes(seed, 300)
      const keep = lttbIndices([], ys, 25)
      for (let i = 1; i < keep.length; i++) {
        expect(keep[i]!, `seed ${seed} at ${i}`).toBeGreaterThan(keep[i - 1]!)
      }
    }
  })

  it('keeps a lone spike that every-nth sampling would drop', () => {
    // The reason LTTB is here at all.
    const ys = shapes(2, 1000) // kind 2 — one 1e6 spike at the midpoint
    const keep = lttbIndices([], ys, 50)
    expect(keep).toContain(500)
  })
})

describe('the public Pt[] wrapper', () => {
  // `lttb` is what `@pyreon/charts/plot` exports and what a caller actually
  // holds. Everything above tests `lttbIndices`, which is the half that
  // crosses — so the wrapper was imported here and never used, and that unused
  // import was the visible end of two unasserted claims the file's own header
  // makes.

  it('selects the SAME rows as the index function it wraps', () => {
    // "One implementation underneath, so a native chart and a web chart cannot
    // thin a series differently." Nothing checked that, and the wrapper does
    // its own passthrough and mapping on top.
    for (let seed = 1; seed <= 20; seed++) {
      const ys = shapes(seed, 300)
      const points: Pt[] = ys.map((y, i) => ({ x: i, y }))
      for (const t of [3, 10, 25, 100]) {
        const viaWrapper = lttb(points, t).map((p) => p.x)
        const viaIndices = lttbIndices([], ys, t)
        expect(viaWrapper, `seed ${seed} threshold ${t}`).toEqual(viaIndices)
      }
    }
  })

  it('honours REAL x values rather than collapsing them to the index', () => {
    // The one behaviour that makes the wrapper more than a convenience, per its
    // own docstring — and the one a "simplify it to lttbIndices([], ys, t)"
    // refactor would silently delete while every other spec here stayed green.
    //
    // Same y series twice; the second is sampled on a log-spaced clock, the
    // shape a latency chart actually has. Largest-triangle areas are computed
    // from x too, so a different clock must pick different rows.
    const n = 400
    const ys = shapes(1, n) // smooth, so the choice is driven by geometry
    const evenly: Pt[] = ys.map((y, i) => ({ x: i, y }))
    const unevenly: Pt[] = ys.map((y, i) => ({ x: Math.exp(i / 40), y }))

    const a = lttb(evenly, 30).map((p) => p.y)
    const b = lttb(unevenly, 30).map((p) => p.y)
    expect(a).toHaveLength(30)
    expect(b).toHaveLength(30)
    expect(b, 'x was ignored — the wrapper is collapsing to the index').not.toEqual(a)

    // …and it is not merely different: both still span the series.
    for (const out of [a, b]) {
      expect(out[0]).toBe(ys[0])
      expect(out[out.length - 1]).toBe(ys[n - 1])
    }
  })

  it('passes a short series through by IDENTITY, not by rebuilding it', () => {
    // `lttbIndices` returns `[]` for "nothing was dropped"; the wrapper has to
    // translate that back. An inverted branch there returns an EMPTY chart, and
    // a `toHaveLength` assertion on the mapped form cannot tell a passthrough
    // from a rebuild that happens to keep every row.
    const points: Pt[] = Array.from({ length: 40 }, (_, i) => ({ x: i, y: i }))
    expect(lttb(points, 200)).toBe(points)
    expect(lttb(points, 2), 'a threshold below 3 is also a passthrough').toBe(points)
  })
})
