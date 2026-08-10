/**
 * Compare two runs — did this change make the catalog better or worse?
 *
 * ── Why a ratchet, and not just a report ──────────────────────────────────
 *
 * `atlas verify` reports ABSOLUTE state: 14 verified, 1 failing. That answers
 * "how is it now" and cannot answer "did I help", which is the question anyone
 * iterating actually has — and the only signal an agent can use to decide
 * whether to keep a change or back it out. A single number is not a reward
 * signal; a delta is.
 *
 * ── The failure this exists to catch ──────────────────────────────────────
 *
 * A check that STOPS RUNNING is indistinguishable from one that never ran, and
 * neither reds a build. Delete a wrapper from `atlas.config.ts` and every
 * mount-dependent check silently drops to `skip`: failures disappear, the
 * counts improve, and the catalog looks better than it did. `checksLost` is
 * the term that makes that a regression rather than a win — losing coverage is
 * the one way to "fix" a red catalog that must never read as green.
 *
 * Pure — no fs, no scanning — so every rule here is testable against literals.
 * The caller supplies both sides.
 */
import { CHECK_KEYS, type CheckKey, type Scenario, type VerifyVerdict } from '../core/types'

/** One scenario whose outcome moved. */
export interface ScenarioDelta {
  id: string
  component: string
  /** Checks that went from pass/skip to `fail`. */
  nowFailing: readonly CheckKey[]
  /** Checks that went from `fail` to `pass`. */
  nowPassing: readonly CheckKey[]
  /** Checks that RAN before and do not now. Coverage lost, not a fix. */
  checksLost: readonly CheckKey[]
  /** Checks that did not run before and do now. */
  checksGained: readonly CheckKey[]
}

export interface VerifyDiff {
  /** Scenarios present in the new run but not the baseline. */
  added: readonly string[]
  /** Scenarios in the baseline that the new run does not have. */
  removed: readonly string[]
  /** Every scenario whose verdict moved, in id order. */
  changed: readonly ScenarioDelta[]
  /**
   * Is this a REGRESSION?
   *
   * True when a check started failing, or when a check that used to run no
   * longer does. Deliberately NOT true for a removed scenario: deleting a
   * component is a legitimate edit, and treating it as a regression would make
   * the ratchet fire on ordinary refactors until people stopped believing it.
   */
  regressed: boolean
  /** Did anything get better? */
  improved: boolean
}

/** The scenarios of a catalog, keyed by id. */
export function scenarioMap(scenarios: readonly Scenario[]): Map<string, Scenario> {
  return new Map(scenarios.map((s) => [s.id, s]))
}

/**
 * Read a written catalog's scenarios back, for use as a baseline.
 *
 * Tolerant by design: the baseline is a file on disk that may predate this
 * version, be half-written, or not exist at all, and none of those is a
 * REGRESSION. A caller distinguishes "no baseline" (nothing to compare, which
 * is not a failure) from "regressed" — conflating them would make the very
 * first run of `--check` red for everybody.
 */
export function readBaselineScenarios(raw: unknown): readonly Scenario[] | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const components = (raw as { components?: unknown }).components
  if (!Array.isArray(components)) return undefined
  const out: Scenario[] = []
  for (const component of components) {
    const scenarios = (component as { scenarios?: unknown })?.scenarios
    if (!Array.isArray(scenarios)) continue
    for (const s of scenarios) {
      if (typeof (s as { id?: unknown })?.id === 'string') out.push(s as Scenario)
    }
  }
  return out
}

function statusOf(verdict: VerifyVerdict | undefined, key: CheckKey): 'pass' | 'fail' | 'skip' {
  return verdict?.[key]?.status ?? 'skip'
}

/**
 * Diff two sets of scenarios.
 *
 * Compared per CHECK rather than per scenario, because "still failing" and
 * "failing for a different reason" are different events and a scenario-level
 * pass/fail flag cannot tell them apart. Iterates `CHECK_KEYS` so a seventh
 * check is included the day it lands.
 */
export function diffVerdicts(
  baseline: readonly Scenario[],
  current: readonly Scenario[],
): VerifyDiff {
  const before = scenarioMap(baseline)
  const after = scenarioMap(current)

  const added = [...after.keys()].filter((id) => !before.has(id)).sort()
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort()

  const changed: ScenarioDelta[] = []
  for (const id of [...after.keys()].sort()) {
    const now = after.get(id)!
    const then = before.get(id)
    // A NEW scenario has no baseline to move away from. Reporting its failures
    // as regressions would flag every added component as a step backwards.
    if (!then) continue

    const nowFailing: CheckKey[] = []
    const nowPassing: CheckKey[] = []
    const checksLost: CheckKey[] = []
    const checksGained: CheckKey[] = []
    for (const key of CHECK_KEYS) {
      const was = statusOf(then.verify, key)
      const is = statusOf(now.verify, key)
      if (was === is) continue
      if (is === 'fail') nowFailing.push(key)
      else if (was === 'fail' && is === 'pass') nowPassing.push(key)
      if (was !== 'skip' && is === 'skip') checksLost.push(key)
      if (was === 'skip' && is !== 'skip') checksGained.push(key)
    }
    if (
      nowFailing.length + nowPassing.length + checksLost.length + checksGained.length >
      0
    ) {
      changed.push({
        id,
        component: now.component,
        nowFailing,
        nowPassing,
        checksLost,
        checksGained,
      })
    }
  }

  return {
    added,
    removed,
    changed,
    regressed: changed.some((d) => d.nowFailing.length > 0 || d.checksLost.length > 0),
    improved: changed.some((d) => d.nowPassing.length > 0 || d.checksGained.length > 0),
  }
}

/**
 * The diff as printable lines, worst news first.
 *
 * A regression leads, because the reader's decision depends on it and burying
 * it under a list of improvements is how a ratchet stops being read.
 */
export function formatDiff(diff: VerifyDiff): string[] {
  const lines: string[] = []
  for (const d of diff.changed) {
    if (d.nowFailing.length > 0) lines.push(`✗ ${d.id} — now failing: ${d.nowFailing.join(', ')}`)
    if (d.checksLost.length > 0) {
      // Worded as coverage lost rather than "skipped", because the counts
      // IMPROVE when this happens and the word has to carry the bad news.
      lines.push(
        `✗ ${d.id} — no longer checked: ${d.checksLost.join(', ')} ` +
          '(coverage lost — the failure did not go away, the check did)',
      )
    }
  }
  for (const d of diff.changed) {
    if (d.nowPassing.length > 0) lines.push(`✓ ${d.id} — now passing: ${d.nowPassing.join(', ')}`)
    if (d.checksGained.length > 0) {
      lines.push(`✓ ${d.id} — newly checked: ${d.checksGained.join(', ')}`)
    }
  }
  if (diff.added.length > 0) lines.push(`+ ${diff.added.length} new scenario(s)`)
  if (diff.removed.length > 0) lines.push(`− ${diff.removed.length} scenario(s) no longer present`)
  return lines
}

/** A one-line verdict for the summary. */
export function summarizeDiff(diff: VerifyDiff): string {
  if (diff.regressed) {
    const failing = diff.changed.reduce((n, d) => n + d.nowFailing.length, 0)
    const lost = diff.changed.reduce((n, d) => n + d.checksLost.length, 0)
    const parts = [
      failing > 0 ? `${failing} check(s) started failing` : '',
      lost > 0 ? `${lost} check(s) stopped running` : '',
    ].filter(Boolean)
    return `REGRESSED — ${parts.join(', ')}`
  }
  if (diff.improved) {
    const fixed = diff.changed.reduce((n, d) => n + d.nowPassing.length, 0)
    const gained = diff.changed.reduce((n, d) => n + d.checksGained.length, 0)
    const parts = [
      fixed > 0 ? `${fixed} check(s) now pass` : '',
      gained > 0 ? `${gained} check(s) newly run` : '',
    ].filter(Boolean)
    return `IMPROVED — ${parts.join(', ')}`
  }
  return 'no change in any check'
}
