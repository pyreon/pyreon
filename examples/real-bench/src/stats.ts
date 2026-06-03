/**
 * Statistics, lifted from `examples/benchmark`'s methodology: median + p90 +
 * 95% non-parametric bootstrap CI on the median + coefficient of variation.
 * Bootstrap (1000 resamples) doesn't assume a normal distribution — timing
 * data is right-skewed by GC outliers.
 */
export interface Stats {
  median: number
  p90: number
  ci95: [number, number]
  cv: number
  n: number
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.floor((sorted.length - 1) * q)] ?? 0
}

// Deterministic PRNG (mulberry32) so the bootstrap is reproducible run-to-run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function computeStats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b)
  const n = sorted.length
  const median = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)

  const mean = sorted.reduce((s, x) => s + x, 0) / n
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  const cv = mean === 0 ? 0 : Math.sqrt(variance) / mean

  const rand = mulberry32(0x9e3779b9)
  const medians: number[] = []
  for (let b = 0; b < 1000; b++) {
    const resample: number[] = []
    for (let i = 0; i < n; i++) resample.push(sorted[Math.floor(rand() * n)] ?? 0)
    resample.sort((a, b2) => a - b2)
    medians.push(quantile(resample, 0.5))
  }
  medians.sort((a, b) => a - b)
  const ci95: [number, number] = [quantile(medians, 0.025), quantile(medians, 0.975)]

  return { median, p90, ci95, cv, n }
}

/** Two stats overlap within noise when their CI95 intervals intersect. */
export function ci95Overlaps(a: Stats, b: Stats): boolean {
  return a.ci95[0] <= b.ci95[1] && b.ci95[0] <= a.ci95[1]
}

export function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  return `${ms.toFixed(2)}ms`
}
