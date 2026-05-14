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
  location?: {
    /** Absolute path */
    path: string
    /** Path relative to the repo root for readable reporting */
    relPath: string
    /** 1-based line number */
    line?: number
    /** 1-based column number */
    column?: number
  }

  /**
   * Companion locations for cross-file findings (e.g. duplicate-island-
   * name lists the second occurrence). Surfaces in human output below
   * the primary location with an `↳` marker.
   */
  relatedLocations?: Array<{
    path: string
    relPath: string
    line?: number
    column?: number
    label?: string
  }>

  /** Optional short fix hint shown under the message in human output. */
  fix?: string

  /**
   * `true` if `pyreon doctor --fix` can auto-resolve this. Currently
   * limited to lint findings whose rule has an auto-fixer.
   */
  fixable?: boolean
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
    scanned?: number
    /** Wall-clock duration in milliseconds. */
    elapsedMs: number
    /**
     * `true` if the gate was skipped (e.g. `--skip <gate>`, missing
     * prerequisite tool, mode-incompatible). The aggregator excludes
     * skipped gates from the score and surfaces them in a "skipped"
     * footer.
     */
    skipped?: boolean
    /**
     * Why the gate was skipped (only meaningful when `skipped: true`).
     */
    skipReason?: string
  }
}

/** Convenience constructor for in-source readability. */
export const finding = (f: Finding): Finding => f
