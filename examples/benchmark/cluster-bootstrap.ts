/**
 * Cluster (two-stage) bootstrap CI95 on the median.
 *
 * ## The defect this exists to fix
 *
 * Every harness here takes its samples in CLUSTERS: `bench-fair` measures 20
 * samples per page-load and `--repeat N` adds N page-loads; `bench-scenarios`
 * does the same per pass; the fundamentals wall-clock benches run several
 * isolated processes. Samples inside one cluster share that page's (or
 * process's) JIT tiering, heap layout and thermal state, so they are NOT
 * independent draws. The page-load effect is large: on `swap rows`, per-page
 * medians ranged 620–860µs for EVERY arm, Vanilla included.
 *
 * The harnesses pooled all 20×N samples and bootstrapped them as if they were
 * independent. That resamples only the within-page spread and treats the
 * page-to-page spread as if it had been averaged away, so the CI95 came out far
 * too narrow and two arms could read "CI-disjoint" purely because they drew
 * different page-loads.
 *
 * ## The method
 *
 * Resample the clusters with replacement (stage 1), then resample samples with
 * replacement within each drawn cluster (stage 2), and take the median of the
 * concatenation. Repeat; the 2.5th / 97.5th percentiles of those medians are
 * the interval. Stage 1 carries the page-load variance into the CI.
 *
 * With ONE cluster, stage 1 always draws that cluster and the method reduces
 * to the ordinary bootstrap. That interval still contains no page-load
 * variance, which is why a single-pass run must not be read as a verdict.
 *
 * Pure and dependency-free; tested from
 * `packages/internals/test-utils/src/tests/cluster-bootstrap.test.ts`.
 */

export type Rng = () => number

/** Seeded PRNG (mulberry32), uniform in [0, 1). Deterministic per seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Median (mean of the two middle values for an even count); 0 when empty. */
export function medianOf(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

export interface ClusterBootstrapOptions {
  /** Bootstrap resamples. Default 1000. */
  resamples?: number
  /** Seed for the default PRNG. Default 42. Ignored when `rng` is given. */
  seed?: number
  /** Injected PRNG, for callers that share one stream. */
  rng?: Rng
}

/**
 * 95% two-stage cluster bootstrap CI on the median.
 *
 * `clusters` holds one array of samples per page-load (or process). Empty
 * clusters are dropped; with no samples at all the result is `[0, 0]`.
 */
export function clusterBootstrapCI95(
  clusters: readonly (readonly number[])[],
  options: ClusterBootstrapOptions = {},
): [number, number] {
  const nonEmpty = clusters.filter((c) => c.length > 0)
  if (nonEmpty.length === 0) return [0, 0]
  const resamples = options.resamples ?? 1000
  const rng = options.rng ?? mulberry32(options.seed ?? 42)
  const k = nonEmpty.length
  const medians: number[] = new Array(resamples)
  const draw: number[] = []
  for (let b = 0; b < resamples; b++) {
    draw.length = 0
    for (let i = 0; i < k; i++) {
      const cluster = nonEmpty[Math.floor(rng() * k)] as readonly number[]
      const n = cluster.length
      for (let j = 0; j < n; j++) draw.push(cluster[Math.floor(rng() * n)] as number)
    }
    medians[b] = medianOf(draw)
  }
  medians.sort((a, b) => a - b)
  return [
    medians[Math.floor((resamples - 1) * 0.025)] as number,
    medians[Math.floor((resamples - 1) * 0.975)] as number,
  ]
}
