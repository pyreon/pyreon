import { describe, expect, it } from 'vitest'
import {
  clusterBootstrapCI95,
  medianOf,
  mulberry32,
} from '../../../../../examples/benchmark/cluster-bootstrap'

/**
 * The row board pooled 5 page-loads × 20 samples and bootstrapped the 100
 * samples as if independent. Per-page medians on `swap rows` ranged 620–860µs
 * for every arm (Vanilla included), so that interval ignored the dominant
 * source of variance and read as far too narrow. The cluster bootstrap must
 * carry the page-to-page spread into the CI.
 */

/** `n` samples evenly spread over [centre − half, centre + half] (ms). */
function page(centre: number, half: number, n = 20): number[] {
  const step = (2 * half) / (n - 1)
  return Array.from({ length: n }, (_, i) => centre - half + i * step)
}

/** The measured shape: five page-loads, tight within, 620–860µs between. */
const SWAP_PAGES = [0.62, 0.68, 0.74, 0.8, 0.86].map((c) => page(c, 0.01))

const width = ([lo, hi]: [number, number]) => hi - lo

describe('clusterBootstrapCI95', () => {
  it('is deterministic for a fixed seed', () => {
    const a = clusterBootstrapCI95(SWAP_PAGES, { seed: 7 })
    const b = clusterBootstrapCI95(SWAP_PAGES, { seed: 7 })
    expect(a).toEqual(b)
  })

  it('pins the exact interval for the default seed', () => {
    // A change to the resampling scheme or the PRNG moves this; that is the point.
    // (The pooled bootstrap of the same 100 samples gives [0.73, 0.75].)
    const ci = clusterBootstrapCI95(SWAP_PAGES)
    expect(ci[0]).toBeCloseTo(0.62684, 4)
    expect(ci[1]).toBeCloseTo(0.85368, 4)
  })

  it('widens to the page-to-page spread that a pooled bootstrap hides', () => {
    const cluster = clusterBootstrapCI95(SWAP_PAGES)
    // The old method: all 100 samples as ONE pool of independent draws.
    const pooled = clusterBootstrapCI95([SWAP_PAGES.flat()])
    expect(width(cluster)).toBeGreaterThan(3 * width(pooled))
    // The interval must reach into the outer page-loads, not hug the pool median.
    expect(cluster[0]).toBeLessThan(0.7)
    expect(cluster[1]).toBeGreaterThan(0.78)
  })

  it('does not call two arms CI-disjoint when they differ only by which page-loads they drew', () => {
    // Same per-page distribution, different draw of page-loads.
    const armA = [0.62, 0.68, 0.74, 0.8, 0.8].map((c) => page(c, 0.01))
    const armB = [0.68, 0.74, 0.8, 0.86, 0.86].map((c) => page(c, 0.01))
    const a = clusterBootstrapCI95(armA, { seed: 1 })
    const b = clusterBootstrapCI95(armB, { seed: 2 })
    expect(a[0] <= b[1] && b[0] <= a[1]).toBe(true)
    // ...while the pooled bootstrap would have declared a winner.
    const pa = clusterBootstrapCI95([armA.flat()], { seed: 1 })
    const pb = clusterBootstrapCI95([armB.flat()], { seed: 2 })
    expect(pa[1] < pb[0]).toBe(true)
  })

  it('stays narrow when page-loads agree', () => {
    const steady = Array.from({ length: 5 }, () => page(0.74, 0.01))
    const cluster = clusterBootstrapCI95(steady)
    const pooled = clusterBootstrapCI95([steady.flat()])
    expect(width(cluster)).toBeLessThanOrEqual(2 * width(pooled) + 1e-9)
    expect(cluster[0]).toBeLessThanOrEqual(0.74)
    expect(cluster[1]).toBeGreaterThanOrEqual(0.74)
  })

  it('reduces to the ordinary bootstrap with one cluster, and ignores empty clusters', () => {
    const one = page(0.74, 0.05)
    expect(clusterBootstrapCI95([one], { seed: 3 })).toEqual(
      clusterBootstrapCI95([[], one, []], { seed: 3 }),
    )
  })

  it('returns [0, 0] when there are no samples', () => {
    expect(clusterBootstrapCI95([])).toEqual([0, 0])
    expect(clusterBootstrapCI95([[], []])).toEqual([0, 0])
  })
})

describe('helpers', () => {
  it('medianOf averages the middle pair and handles empty input', () => {
    expect(medianOf([3, 1, 2])).toBe(2)
    expect(medianOf([4, 1, 3, 2])).toBe(2.5)
    expect(medianOf([])).toBe(0)
  })

  it('mulberry32 is seeded and in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})
