/**
 * Statistics for the process-isolated micro-benchmarks (`reactivity.ts`).
 *
 * Every cell is measured in several separate processes, each producing a few
 * timing windows. Windows from one process share its JIT tiering, heap layout
 * and code placement, so they are not independent draws: the process-to-process
 * spread is a real part of the run-to-run uncertainty. The harness used to pool
 * all windows and bootstrap them as independent samples, which resampled only
 * the within-process spread and produced intervals too narrow to separate the
 * 1–3% differences it was then asked to call.
 *
 * This module computes the CI with the same two-stage cluster bootstrap the
 * Chromium suites use (`examples/benchmark/cluster-bootstrap.ts` — imported,
 * not copied): resample processes with replacement, then windows within each
 * drawn process. It also reports the process-level dispersion so a reader (or
 * `scripts/bench/ab/analyze.ts`) can see how much of the spread is between
 * processes.
 *
 * Tested from `packages/internals/test-utils/src/tests/bench-micro-stats.test.ts`.
 */
import { clusterBootstrapCI95, medianOf } from '../../../examples/benchmark/cluster-bootstrap.ts'

/** Coefficient of variation (sample stddev / mean) as a fraction; 0 for < 2 values. */
export function cvOf(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  if (mean === 0) return 0
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance) / mean
}

export interface MicroCellStats {
  /** Median ns/op over every window of every process. */
  med: number
  /** Cluster-bootstrap CI95 bounds on the median (processes, then windows). */
  lo: number
  hi: number
  /** Total windows. */
  n: number
  /** Number of processes (clusters). */
  processCount: number
  /** CV of all windows pooled, as a fraction. */
  cv: number
  /** CV of the per-process medians, as a fraction (between-process spread). */
  betweenProcessCv: number
  /** Mean of the per-process CVs, as a fraction (within-process spread). */
  withinProcessCv: number
  /** Raw windows, one array per process — kept so analysis can recompute anything. */
  processes: number[][]
}

/** Bootstrap resamples for the micro harness (its historical value). */
export const MICRO_RESAMPLES = 2000

export function summarizeMicroCell(
  processes: readonly (readonly number[])[],
  seed = 0x5eed,
): MicroCellStats {
  const clusters = processes.filter((p) => p.length > 0).map((p) => [...p])
  const pooled = clusters.flat()
  const [lo, hi] = clusterBootstrapCI95(clusters, { resamples: MICRO_RESAMPLES, seed })
  const perProcessMedians = clusters.map((c) => medianOf(c))
  const within = clusters.map((c) => cvOf(c))
  return {
    med: medianOf(pooled),
    lo,
    hi,
    n: pooled.length,
    processCount: clusters.length,
    cv: cvOf(pooled),
    betweenProcessCv: cvOf(perProcessMedians),
    withinProcessCv: within.length === 0 ? 0 : within.reduce((a, b) => a + b, 0) / within.length,
    processes: clusters,
  }
}

/**
 * Default process count per cell, from the between-process spread measured on
 * 2026-11-25 (see `.agents/guides/benchmarks/references/core-micro-benchmarks.md`,
 * "Process count and CI"): 6 processes kept the A/A false-verdict rate under 1%,
 * against 23–26% for the old pooled 3-process CI. Fewer than 5 clusters leaves the percentile bootstrap with
 * too few distinct process draws to place its 2.5th / 97.5th percentiles.
 */
export const DEFAULT_PROCESSES = 6
export const MIN_MEANINGFUL_PROCESSES = 5
