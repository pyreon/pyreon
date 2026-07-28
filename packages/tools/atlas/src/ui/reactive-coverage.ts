/**
 * Reactive coverage — the capability no other workbench can have.
 *
 * Line coverage says a LINE ran. This says an UPDATE FIRED. The distinction is
 * the whole point: a mounted effect that never re-ran is reported as 100%
 * covered by every line-coverage tool in existence, and it is exactly the
 * "the UI doesn't update" bug — the single most common class in a fine-grained
 * reactive framework. Storybook cannot do this because React has no reactive
 * graph to read; Pyreon publishes one (`@pyreon/reactivity/coverage`).
 *
 * This module is the PURE half — session control plus presentation shaping —
 * so the verdicts are unit-testable with no DOM and no workbench. The panel in
 * `views/reactive-coverage-panel.tsx` only renders what it returns.
 *
 * ── On availability, and why it is not a boolean ──────────────────────────
 *
 * The reactive registry that backs coverage is `__DEV__`-only: it tree-shakes
 * out of a production build. A production workbench therefore sees an EMPTY
 * graph — and an empty graph computes as `100%` covered, because
 * `computeReactiveCoverage` defines `percent` as 100 when `total === 0`.
 *
 * Reporting that as a clean pass is the same false-green Atlas' verify verdict
 * was just fixed for: "nothing was measured" must never render as "everything
 * is fine". So availability is an explicit state the panel renders differently,
 * not a number the user has to interpret.
 */
import {
  computeReactiveCoverage,
  type ReactiveCoverageEntry,
  type ReactiveCoverageReport,
  startReactiveCoverage,
  stopReactiveCoverage,
  takeReactiveCoverage,
} from '@pyreon/reactivity/coverage'
import { getReactiveGraph } from '@pyreon/reactivity'

/**
 * Whether a reactive registry exists to measure at all.
 *
 * A production build tree-shakes it, so coverage is structurally impossible
 * there — and an absent registry computes as `percent: 100`, so failing to
 * distinguish the two would fabricate a perfect score. This is the same
 * false-green shape as a verdict that reads `ok` because nothing ran.
 *
 * The predicate is the dev gate itself, NOT "does the graph have nodes". Nodes
 * are registered only once tracking has been activated (measured:
 * `getReactiveGraph()` reports 0 nodes for a signal created and written before
 * the first session), so a node count is 0 in a perfectly healthy dev build and
 * would report "unavailable" to every user who has not pressed Record yet.
 *
 * Written inline rather than via a local `__DEV__` const: bundlers fold the
 * literal expression, but not always through an alias — see anti-patterns
 * "Local `__DEV__` const alias prevents bundler tree-shake".
 */
export function isCoverageAvailable(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** A row as the panel renders it — one uncovered reactive node. */
export interface CoverageRow {
  id: number
  kind: ReactiveCoverageEntry['kind']
  name: string
  /** the short reason token, e.g. `ran-once` */
  reason: ReactiveCoverageEntry['reason']
  /** what it means, in the words a reader needs */
  explain: string
  /** `file:line` when the node's creation site is known */
  where: string
}

/**
 * Plain-language reasons. The token alone (`ran-once`) does not tell a reader
 * why they should care, and this panel is as much a teaching surface for
 * fine-grained reactivity as a testing one.
 */
const EXPLAIN: Record<ReactiveCoverageEntry['reason'], string> = {
  covered: 'updated at least once',
  'never-changed': 'never written — no scenario changed this signal',
  'ran-once': 'mounted but never re-ran — its reactive path is untested',
  'never-ran': 'created but never executed',
}

function where(entry: ReactiveCoverageEntry): string {
  const loc = entry.loc
  if (!loc?.file) return ''
  const file = loc.file.split('/').slice(-2).join('/')
  return loc.line ? `${file}:${loc.line}` : file
}

/** Shape a report's uncovered nodes into display rows. */
export function coverageRows(report: ReactiveCoverageReport): CoverageRow[] {
  return report.uncoveredEntries.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: e.name || `#${e.id}`,
    reason: e.reason,
    explain: EXPLAIN[e.reason],
    where: where(e),
  }))
}

/**
 * The headline. `ran-once` is called out separately because it is the finding
 * with teeth — a signal that was never written is often just a prop this
 * scenario does not exercise, but an effect that mounted and never re-ran is a
 * reactive edge nothing has ever proven works.
 */
export interface CoverageSummary {
  percent: number
  covered: number
  total: number
  /** effects/derived that mounted but never re-ran */
  ranOnce: number
  /** signals never written */
  neverChanged: number
}

export function coverageSummary(report: ReactiveCoverageReport): CoverageSummary {
  let ranOnce = 0
  let neverChanged = 0
  for (const e of report.uncoveredEntries) {
    if (e.reason === 'ran-once') ranOnce += 1
    else if (e.reason === 'never-changed') neverChanged += 1
  }
  return {
    percent: report.percent,
    covered: report.covered,
    total: report.total,
    ranOnce,
    neverChanged,
  }
}

/**
 * A recording session.
 *
 * `start` resets the baseline and pins the session's nodes so unmounting a
 * component mid-session cannot GC-prune the denominator — otherwise the
 * percentage would climb simply because the evidence disappeared.
 */
export interface CoverageSession {
  start(): void
  /** Read the current report WITHOUT ending the session. */
  sample(): ReactiveCoverageReport
  stop(): void
}

export function createCoverageSession(): CoverageSession {
  let active = false
  return {
    start() {
      if (active) return // idempotent — a second Record click must not reset the baseline
      startReactiveCoverage()
      active = true
    },
    sample() {
      // `takeReactiveCoverage` is session-scoped; outside a session fall back to
      // the whole graph so the panel can still show a static picture.
      return active ? takeReactiveCoverage() : computeReactiveCoverage(getReactiveGraph().nodes)
    },
    stop() {
      if (!active) return
      stopReactiveCoverage()
      active = false
    },
  }
}
