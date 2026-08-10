/**
 * Shape verify verdicts into a report — WHICH check failed, not how many.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The scan summary said `41 verified, 2 failing, 0 unverified`. That names a
 * quantity and withholds the finding: six checks run per scenario, and the one
 * that failed is the entire content of the message. Answering "which check?"
 * meant opening `atlas-catalog.json` and walking it by hand — measured on this
 * repo's own workshop, three separate times in one session, each time with a
 * throwaway script that did what this module does.
 *
 * A number you have to leave the tool to interpret is not a report.
 *
 * Kept PURE — no DOM, no fs, no mounting — so every shaping rule below is
 * testable against a literal verdict rather than against a scan.
 */
import { CHECK_KEYS, type CheckKey } from '../plugins/registry'
import type { Scenario, VerifyCheck, VerifyVerdict } from '../core/types'

/** How one check fared across the scenarios examined. */
export interface CheckTally {
  key: CheckKey
  pass: number
  fail: number
  /** Did not run. Not a pass — see `VerifyVerdict.checked`. */
  skip: number
  /** Why it did not run, when every skip agreed on a reason. */
  skipReason?: string
}

/** One scenario that failed, and the checks that failed it. */
export interface FailingScenario {
  id: string
  component: string
  /** Only the checks with `status: 'fail'`, in display order. */
  checks: readonly { key: CheckKey; findings: readonly string[] }[]
}

/** The whole picture, ready to print or serialise. */
export interface VerifyReport {
  scenarios: number
  /** `checked > 0` and nothing failed. */
  verified: number
  /** At least one check failed. */
  failed: number
  /** Nothing examined it. Neither a pass nor a failure. */
  unverified: number
  /** Every check, including ones that never ran. */
  tallies: readonly CheckTally[]
  failures: readonly FailingScenario[]
}

/**
 * Display order, most-likely-to-be-a-real-bug first.
 *
 * `interaction` leads because it subsumes mounting: a scenario that throws on
 * mount fails here, and nothing downstream means anything until it passes.
 * `ssrParity` next — a hydration mismatch is a shipped bug on every SSR page.
 * `a11y` and `leak` are real findings on a working component. The two
 * browser-measured checks sort last because in a Node scan they are
 * structurally absent rather than informative.
 *
 * A key MISSING from this map still sorts (at `99`) and still prints. That is
 * deliberate: a seventh check must never be silently dropped from the report
 * just because nobody updated a weight table — the failure mode would be a
 * check that fails invisibly, which is worse than one displayed out of order.
 */
const ORDER: Partial<Record<CheckKey, number>> = {
  interaction: 0,
  ssrParity: 1,
  a11y: 2,
  leak: 3,
  reactivityCoverage: 4,
  snapshot: 5,
}

function weight(key: CheckKey): number {
  return ORDER[key] ?? 99
}

/** Checks in display order. */
function orderedKeys(): CheckKey[] {
  return [...CHECK_KEYS].sort((a, b) => weight(a) - weight(b) || a.localeCompare(b))
}

/**
 * Findings for a check, never an empty array masquerading as a reason.
 *
 * A failing check with no findings is possible (a plugin that fails without
 * explaining), and printing an empty bullet reads as a rendering bug rather
 * than as a plugin that said nothing. Say so instead.
 */
function findingsOf(check: VerifyCheck): readonly string[] {
  const found = check.findings ?? []
  return found.length > 0 ? found : ['failed without reporting a reason']
}

/** Build the report from scenarios carrying verdicts. */
export function buildVerifyReport(scenarios: readonly Scenario[]): VerifyReport {
  const keys = orderedKeys()
  const tallies = new Map<CheckKey, CheckTally>(
    keys.map((key) => [key, { key, pass: 0, fail: 0, skip: 0 }]),
  )
  // Collected per check so a reason is reported only when EVERY skip agreed on
  // it. Two different reasons summarised as one would be a claim about scenarios
  // that never made it.
  const reasons = new Map<CheckKey, Set<string>>(keys.map((key) => [key, new Set()]))
  const failures: FailingScenario[] = []
  let verified = 0
  let failed = 0
  let unverified = 0

  for (const scenario of scenarios) {
    const verdict: VerifyVerdict | undefined = scenario.verify
    if (!verdict) {
      // No verdict at all is the same state as a verdict where nothing ran, and
      // reporting them differently would split one honest number in two.
      unverified += 1
      for (const key of keys) tallies.get(key)!.skip += 1
      continue
    }
    const failedChecks: { key: CheckKey; findings: readonly string[] }[] = []
    for (const key of keys) {
      const check = verdict[key]
      const tally = tallies.get(key)!
      if (check.status === 'pass') tally.pass += 1
      else if (check.status === 'fail') {
        tally.fail += 1
        failedChecks.push({ key, findings: findingsOf(check) })
      } else {
        tally.skip += 1
        const reason = check.findings?.[0]
        if (reason) reasons.get(key)!.add(reason)
      }
    }
    if (failedChecks.length > 0) {
      failed += 1
      failures.push({ id: scenario.id, component: scenario.component, checks: failedChecks })
    } else if (verdict.checked > 0) verified += 1
    else unverified += 1
  }

  return {
    scenarios: scenarios.length,
    verified,
    failed,
    unverified,
    tallies: keys.map((key) => {
      const tally = tallies.get(key)!
      const only = reasons.get(key)!
      return only.size === 1 ? { ...tally, skipReason: [...only][0]! } : tally
    }),
    failures,
  }
}

/**
 * The one line that answers "which check is failing?".
 *
 * Ordered by failure count first, so the problem leads, then by the display
 * order above so the line is stable between runs on a healthy catalog — an
 * unstable summary cannot be diffed, and diffing it is how a reader sees that
 * their change helped.
 *
 * Checks that never ran are excluded here and reported by `formatNotRun`:
 * folding `0/8` into the same line reads as a failing check, and a check that
 * is structurally unavailable in this mode is a different statement from one
 * that ran and did not pass.
 */
export function formatCheckTally(tallies: readonly CheckTally[]): string {
  const ran = tallies.filter((t) => t.pass + t.fail > 0)
  if (ran.length === 0) return 'no checks ran'
  return ran
    .slice()
    .sort((a, b) => b.fail - a.fail || weight(a.key) - weight(b.key))
    .map((t) => {
      const total = t.pass + t.fail
      return `${t.key} ${t.pass}/${total}${t.fail > 0 ? ' ✗' : ''}`
    })
    .join(' · ')
}

/**
 * The checks that did not run, with their reason.
 *
 * Reported rather than omitted: a reader comparing two catalogs needs to know a
 * check was unavailable, not infer it from an absence. Grouped by reason,
 * because the two browser-measured checks always share one and two identical
 * lines is noise where one naming both is a finding.
 */
export function formatNotRun(tallies: readonly CheckTally[]): string[] {
  const notRun = tallies.filter((t) => t.pass + t.fail === 0 && t.skip > 0)
  if (notRun.length === 0) return []
  const byReason = new Map<string, CheckKey[]>()
  for (const t of notRun) {
    const reason = t.skipReason ?? 'not run — no plugin claimed this check'
    byReason.set(reason, [...(byReason.get(reason) ?? []), t.key])
  }
  return [...byReason.entries()].map(
    ([reason, keys]) => `not run: ${keys.join(', ')} — ${reason}`,
  )
}

/**
 * Failing scenarios as printable lines.
 *
 * Every failing check is named with its findings. `limit` caps the output for a
 * whole-catalog scan, where a systemic failure produces hundreds of identical
 * rows; the cap is REPORTED when it bites, because a silently truncated list
 * reads as a complete one — the same silent-truncation class the repo's gates
 * are written against.
 */
export function formatFailures(
  failures: readonly FailingScenario[],
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const lines: string[] = []
  for (const failure of failures.slice(0, limit)) {
    lines.push(`✗ ${failure.id}`)
    for (const check of failure.checks) {
      for (const finding of check.findings) lines.push(`    ${check.key}: ${finding}`)
    }
  }
  if (failures.length > limit) {
    lines.push(`… and ${failures.length - limit} more failing scenario(s) — see the catalog JSON`)
  }
  return lines
}
