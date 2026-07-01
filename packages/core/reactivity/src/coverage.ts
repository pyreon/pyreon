/**
 * Reactive Coverage — "which reactive edges never fired?"
 *
 * Code coverage tells you a *line* executed. Reactive Coverage tells you a
 * *reactive update fired*: run your tests, then see every signal / computed /
 * effect whose reactive behaviour was NEVER exercised. A node that never fires
 * is either dead reactivity (a signal nobody ever changes, an effect that only
 * runs at mount) or an untested reactive path. No other framework has a name
 * for this — Pyreon can measure it because the runtime holds a precise model
 * of the reactive graph (via the always-on dev registry that also powers LPIH).
 *
 * ── What "covered" means (kind-aware) ────────────────────────────────────────
 * `_rdRecordFire` counts a "fire" as: a value-changing signal write, a computed
 * recompute, or an effect run — and the INITIAL run of an effect / first
 * computation of a derived DOES count. So:
 *
 *   - **signal**  — covered iff it changed ≥ 1× (`fires ≥ 1`). `fires === 0`
 *     means the value never changed during the run → `never-changed`.
 *   - **effect**  — covered iff it RE-ran (`fires ≥ 2`) beyond its mount run.
 *     `fires === 1` → `ran-once` (mounted but its reactive re-run was never
 *     triggered — the interesting "untested reactive path" bucket).
 *     `fires === 0` → `never-ran` (created then disposed / never executed).
 *   - **derived** — same thresholds as effect: `≥ 2` recomputed (covered),
 *     `=== 1` computed once but never recomputed (`ran-once`), `=== 0` never
 *     read (`never-ran`).
 *
 * ── Requires dev/test mode ───────────────────────────────────────────────────
 * The reactive registry is always-on in `__DEV__` and tree-shaken in
 * production, so coverage only measures when `NODE_ENV !== 'production'`. In a
 * production build `getReactiveGraph()` is empty → the report is vacuously 100%.
 */

import {
  _setCoverageRetention,
  __resetReactiveDevtoolsForTesting,
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  getReactiveGraph,
  type ReactiveNode,
  type ReactiveNodeKind,
  type SourceLocation,
} from './reactive-devtools'

/** Why a node is (un)covered. */
export type ReactiveCoverageReason =
  | 'covered'
  | 'never-changed' // signal that never wrote a new value
  | 'ran-once' // effect/derived that ran once (mount / first read) but never re-ran
  | 'never-ran' // effect/derived created but never executed

/** One reactive node's coverage verdict. */
export interface ReactiveCoverageEntry {
  id: number
  kind: ReactiveNodeKind
  name: string
  fires: number
  subscribers: number
  covered: boolean
  reason: ReactiveCoverageReason
  loc?: SourceLocation
}

/** Per-kind totals. */
export interface ReactiveKindStat {
  total: number
  covered: number
}

/** The full coverage report for a set of reactive nodes. */
export interface ReactiveCoverageReport {
  total: number
  covered: number
  uncovered: number
  /** `covered / total × 100`, rounded to 1 decimal. `100` when `total === 0`. */
  percent: number
  byKind: Record<ReactiveNodeKind, ReactiveKindStat>
  /** Every node, in registration order. */
  entries: ReactiveCoverageEntry[]
  /** Convenience view — the subset with `covered === false`. */
  uncoveredEntries: ReactiveCoverageEntry[]
}

/**
 * Classify a single node. Pure — exported for direct testing + reuse.
 * See the module header for the kind-aware `covered` rule.
 */
export function classifyReactiveNode(node: Pick<ReactiveNode, 'kind' | 'fires'>): {
  covered: boolean
  reason: ReactiveCoverageReason
} {
  if (node.kind === 'signal') {
    return node.fires >= 1
      ? { covered: true, reason: 'covered' }
      : { covered: false, reason: 'never-changed' }
  }
  // effect | derived — a covered reactive node RE-fires past its initial run.
  if (node.fires >= 2) return { covered: true, reason: 'covered' }
  if (node.fires === 1) return { covered: false, reason: 'ran-once' }
  return { covered: false, reason: 'never-ran' }
}

const EMPTY_KIND_STATS = (): Record<ReactiveNodeKind, ReactiveKindStat> => ({
  signal: { total: 0, covered: 0 },
  derived: { total: 0, covered: 0 },
  effect: { total: 0, covered: 0 },
})

/**
 * Compute a coverage report from a list of reactive nodes (typically
 * `getReactiveGraph().nodes`). Pure + deterministic — the unit of record.
 */
export function computeReactiveCoverage(nodes: readonly ReactiveNode[]): ReactiveCoverageReport {
  const entries: ReactiveCoverageEntry[] = []
  const uncoveredEntries: ReactiveCoverageEntry[] = []
  const byKind = EMPTY_KIND_STATS()
  let covered = 0

  for (const node of nodes) {
    const verdict = classifyReactiveNode(node)
    const entry: ReactiveCoverageEntry = {
      id: node.id,
      kind: node.kind,
      name: node.name,
      fires: node.fires,
      subscribers: node.subscribers,
      covered: verdict.covered,
      reason: verdict.reason,
      ...(node.loc ? { loc: node.loc } : {}),
    }
    entries.push(entry)
    byKind[node.kind].total++
    if (verdict.covered) {
      byKind[node.kind].covered++
      covered++
    } else {
      uncoveredEntries.push(entry)
    }
  }

  const total = entries.length
  const percent = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10
  return {
    total,
    covered,
    uncovered: total - covered,
    percent,
    byKind,
    entries,
    uncoveredEntries,
  }
}

const REASON_LABEL: Record<ReactiveCoverageReason, string> = {
  covered: 'covered',
  'never-changed': 'never changed',
  'ran-once': 'ran once, never re-ran',
  'never-ran': 'never ran',
}

function fmtLoc(loc: SourceLocation | undefined): string {
  return loc ? `${loc.file}:${loc.line}:${loc.col}` : '<no source location>'
}

/** Options for {@link formatReactiveCoverage}. */
export interface FormatReactiveCoverageOptions {
  /** Also list covered nodes (default: only uncovered). */
  showCovered?: boolean
  /** Max uncovered entries to list (default: 50; 0 = unlimited). */
  limit?: number
}

/**
 * Render a coverage report as a human-readable, dependency-free text block.
 * The machine-readable form is the {@link ReactiveCoverageReport} itself.
 */
export function formatReactiveCoverage(
  report: ReactiveCoverageReport,
  opts: FormatReactiveCoverageOptions = {},
): string {
  const { byKind } = report
  const lines: string[] = []
  lines.push(
    `Reactive Coverage — ${report.percent}% (${report.covered} of ${report.total} reactive node${
      report.total === 1 ? '' : 's'
    } exercised)`,
  )
  lines.push(
    `  signals ${byKind.signal.covered}/${byKind.signal.total}` +
      `   derived ${byKind.derived.covered}/${byKind.derived.total}` +
      `   effects ${byKind.effect.covered}/${byKind.effect.total}`,
  )

  const limit = opts.limit ?? 50
  const uncovered = report.uncoveredEntries
  if (uncovered.length > 0) {
    lines.push('')
    lines.push(`Uncovered (${uncovered.length}):`)
    const shown = limit > 0 ? uncovered.slice(0, limit) : uncovered
    for (const e of shown) {
      lines.push(`  ✗ ${REASON_LABEL[e.reason].padEnd(22)} ${e.name} [${e.kind}]  ${fmtLoc(e.loc)}`)
    }
    if (shown.length < uncovered.length) {
      lines.push(`  … and ${uncovered.length - shown.length} more`)
    }
  }

  if (opts.showCovered) {
    const covered = report.entries.filter((e) => e.covered)
    if (covered.length > 0) {
      lines.push('')
      lines.push(`Covered (${covered.length}):`)
      for (const e of covered) {
        lines.push(`  ✓ ${e.name} [${e.kind}] ×${e.fires}  ${fmtLoc(e.loc)}`)
      }
    }
  }

  return lines.join('\n')
}

// ── Session API ──────────────────────────────────────────────────────────────

/**
 * Begin a reactive-coverage session. Resets the registry to a clean baseline,
 * pins every node created from here on (so unmounting a component doesn't
 * GC-prune it out of the denominator), and enables graph reads.
 *
 * Create + exercise the reactive nodes you want to measure AFTER calling this
 * — pre-existing nodes are wiped by the baseline reset.
 */
export function startReactiveCoverage(): void {
  __resetReactiveDevtoolsForTesting()
  _setCoverageRetention(true)
  activateReactiveDevtools()
}

/**
 * Snapshot the current session into a {@link ReactiveCoverageReport}. Call any
 * number of times while the session is active (e.g. once per test, or once at
 * the end). Returns a vacuous 100% report in production (empty registry).
 */
export function takeReactiveCoverage(): ReactiveCoverageReport {
  return computeReactiveCoverage(getReactiveGraph().nodes)
}

/**
 * End the session: release the retained-node pins (so GC can reclaim them) and
 * disable graph reads. Does not clear counts — take a final snapshot first.
 */
export function stopReactiveCoverage(): void {
  _setCoverageRetention(false)
  deactivateReactiveDevtools()
}
