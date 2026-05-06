/**
 * Shared result-record schema for Pyreon architectural experiments.
 *
 * Every experiment writes one of these per measurement run to
 * `results/<sha>.json`. The shared `bun run perf:diff` tool (from
 * `@pyreon/perf-harness`) compares two such files and CI posts the delta.
 *
 * Tracking: `.claude/plans/open-work-2026-q3.md` (P3 section).
 */

/** A single wall-clock measurement series with median + p90 + sample count. */
export interface WallClockMeasurement {
  /** Median across `samples` runs, milliseconds. */
  median: number
  /** 90th percentile, milliseconds. Always report alongside median. */
  p90: number
  /** Number of timed runs (warmup runs excluded). */
  samples: number
  /** Optional: minimum observed (useful for variance analysis). */
  min?: number
  /** Optional: maximum observed. */
  max?: number
}

/** Optional subjective metric — must have ≥3 testers or a quantified proxy. */
export interface SubjectiveMetric {
  /** 1-5 score per tester. */
  scores: number[]
  /** Notes on methodology (number of testers, prompt, etc.). */
  notes?: string
}

export type ExperimentDecision = 'GRADUATE' | 'KILL' | 'DEFER'

export interface ExperimentResult {
  /** Experiment slug, e.g. "e1-speculative-mountfor". */
  experiment: string
  /** Commit SHA the experiment branch is at. */
  sha: string
  /** Commit SHA the baseline measurement was taken at. */
  baseline_sha: string
  /**
   * Wall-clock measurements keyed by journey/scenario name.
   * Examples: "create_1k", "chat_journey", "dashboard_journey".
   */
  wall_clock: Record<string, WallClockMeasurement>
  /**
   * `@pyreon/perf-harness` counter snapshot — instrumented call counts
   * per named counter (e.g. "runtime.mount", "mountFor.lisOps").
   */
  counters: Record<string, number>
  /** Heap measurements in MB. Optional but encouraged. */
  heap?: {
    after_test?: number
    peak?: number
  }
  /**
   * Subjective metrics keyed by metric name. Use sparingly —
   * always paired with a quantified proxy when possible.
   */
  subjective?: Record<string, SubjectiveMetric>
  /** Decision applied to this run; mirrors `RESULTS.md`. */
  decision: ExperimentDecision
  /** Free-form rationale for the decision. */
  decision_notes: string
  /** Optional: hardware/OS notes for reproducibility. */
  environment?: {
    os?: string
    cpu?: string
    node?: string
    bun?: string
  }
}

/**
 * Type guard for runtime validation when reading an arbitrary JSON file
 * (e.g. via `bun run perf:diff baseline.json experiment.json`).
 */
export function isExperimentResult(value: unknown): value is ExperimentResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.experiment === 'string' &&
    typeof v.sha === 'string' &&
    typeof v.baseline_sha === 'string' &&
    typeof v.wall_clock === 'object' &&
    v.wall_clock !== null &&
    typeof v.counters === 'object' &&
    v.counters !== null &&
    typeof v.decision === 'string' &&
    (v.decision === 'GRADUATE' || v.decision === 'KILL' || v.decision === 'DEFER') &&
    typeof v.decision_notes === 'string'
  )
}
