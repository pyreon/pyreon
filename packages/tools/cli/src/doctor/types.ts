/**
 * Unified `Finding` + `GateResult` types shared by every doctor gate.
 *
 * Each programmatic gate (`runDistributionGate`, `runDocClaimsGate`, ...)
 * returns `GateResult`. The aggregator in `pyreon doctor` merges every
 * gate's findings into a `DoctorReport` with per-category subscores + an
 * overall 0-100 health score — that aggregation layer lands in the
 * follow-up PR (this PR is foundation-only).
 *
 * Why a unified shape now (PR 1) instead of together with the aggregator
 * (PR 2): the gates are independently usable today via standalone scripts
 * (`bun run check-distribution`, etc.). Locking the shape early means the
 * scripts and the future aggregator consume the same `Finding[]` — no
 * shim layer.
 *
 * Mirrors the existing per-detector shapes (`IslandFinding`, `SsgFinding`,
 * `TestAuditEntry`) but elevated to a cross-gate vocabulary. Categories
 * map onto the five react.doctor-style buckets so the score formula has
 * a clear assignment per gate without case-by-case classification.
 */

export type FindingCategory =
  | 'correctness'
  | 'performance'
  | 'architecture'
  | 'testing'
  | 'documentation'
  // Advisory: opt-in best-practice findings (the @pyreon/lint `meta.optIn`
  // rules). Scored + displayed for visibility, but EXCLUDED from the
  // overall grade and from `--ci` failure — enabling opinionated
  // best-practice rules must never tank the objective health grade or
  // break CI (resolves the objectivity tension from the doctor-objective
  // work: opinionated ≠ broken).
  | 'best-practices'

export type Severity = 'error' | 'warning' | 'info'

/**
 * A single actionable diagnostic. Every doctor gate emits Findings in
 * this shape. Aggregation by category + severity drives the health score.
 */
export interface Finding {
  /**
   * Bucket the finding lands in for score aggregation. Each gate picks
   * a default category for its emitted findings; an individual finding
   * may override (e.g. a perf-flavored lint rule would still emit
   * `category: 'performance'` even though the gate is `'lint'`).
   */
  category: FindingCategory

  /** Severity drives per-finding weight in the score formula. */
  severity: Severity

  /**
   * Stable code identifying the specific check. Format: `<gate>/<rule>`
   * — e.g. `'audit-types/typed-but-unimplemented'`,
   * `'distribution/missing-sideEffects'`, `'pyreon/for-missing-by'`.
   * Used for filtering + cross-referencing in JSON output.
   */
  code: string

  /**
   * Identifier of the gate that produced this finding. Useful for
   * grouping in human output and `--skip <gate>` filtering. Examples:
   * `'lint'`, `'audit-types'`, `'check-distribution'`, `'islands-audit'`.
   */
  gate: string

  /** One-paragraph human-readable explanation, including the fix path. */
  message: string

  /** Where the finding surfaces. Optional for project-wide findings. */
  location?:
    | {
        /** Absolute path */
        path: string
        /** Path relative to the repo root for readable reporting */
        relPath: string
        /** 1-based line number */
        line?: number | undefined
        /** 1-based column number */
        column?: number | undefined
      }
    | undefined

  /**
   * Companion locations for cross-file findings (e.g. duplicate-island-
   * name lists the second occurrence). Surfaces in human output below
   * the primary location with an `↳` marker.
   */
  relatedLocations?:
    | Array<{
        path: string
        relPath: string
        line?: number | undefined
        column?: number | undefined
        label?: string | undefined
      }>
    | undefined

  /** Optional short fix hint shown under the message in human output. */
  fix?: string | undefined

  /**
   * `true` if `pyreon doctor --fix` can auto-resolve this. Currently
   * limited to lint findings whose rule has an auto-fixer.
   */
  fixable?: boolean | undefined
}

/**
 * Result of running a single doctor gate. The aggregator collects N
 * GateResults and computes the report.
 */
export interface GateResult {
  /** Gate identifier (matches Finding.gate) */
  gate: string

  /**
   * Default category for findings this gate produces. The aggregator
   * uses this as the fallback when a Finding doesn't override
   * `category` itself — but Finding.category is the source of truth
   * for score attribution.
   */
  category: FindingCategory

  /** All findings produced by this gate. May be empty. */
  findings: Finding[]

  /** Per-gate metadata for the human + JSON reports. */
  meta: {
    /** Number of files / packages / records the gate scanned. */
    scanned?: number | undefined
    /** Wall-clock duration in milliseconds. */
    elapsedMs: number
    /**
     * `true` if the gate was skipped (e.g. `--skip <gate>`, missing
     * prerequisite tool, mode-incompatible). The aggregator excludes
     * skipped gates from the score and surfaces them in a "skipped"
     * footer.
     */
    skipped?: boolean | undefined
    /**
     * Why the gate was skipped (only meaningful when `skipped: true`).
     */
    skipReason?: string | undefined
  }
}

/** Convenience constructor for in-source readability. */
export const finding = (f: Finding): Finding => f

// ─── DoctorReport (PR 2 — aggregation + score) ──────────────────────────

/**
 * Per-category subscore + raw counts. The aggregator builds one
 * `CategoryScore` per `FindingCategory`, then averages them into the
 * overall score. Categories with no findings AND no contributing gates
 * (skipped or filtered out) get `included: false` and are excluded
 * from the mean — keeping a perfect 100 for an unmeasured category
 * would be misleading.
 */
export interface CategoryScore {
  category: FindingCategory
  /** 0-100 subscore for this bucket */
  score: number
  errors: number
  warnings: number
  infos: number
  /** Letter grade derived from `score` (A/B/C/D/F) */
  grade: Grade
  /** False if no gate covered this category — drop from mean */
  included: boolean
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/**
 * Final aggregated report `pyreon doctor` produces. The renderer
 * (text / json / gha) consumes this; gate orchestration is upstream.
 */
export interface DoctorReport {
  /** 0-100 weighted mean of included `categories[].score` */
  score: number
  /** Letter grade for `score` */
  grade: Grade
  /** Per-category breakdown (always 5 entries — `included` flags coverage) */
  categories: CategoryScore[]
  /** Every gate that ran (or was skipped, with `meta.skipped: true`) */
  gates: GateResult[]
  /** Flat list of all findings across gates, ordered by severity then category */
  findings: Finding[]
  /** Aggregate counts across all findings */
  totals: {
    errors: number
    warnings: number
    infos: number
  }
  /** Top-level wall-clock — sum of gates' elapsedMs (parallel sum, not max) */
  elapsedMs: number
  /** ISO timestamp of when the report was produced (for diffing across runs) */
  timestamp: string
}
