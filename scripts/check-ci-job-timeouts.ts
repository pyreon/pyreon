// A CI job that restores the bootstrap cache must budget for restoring it.
//
// ## Why this gate exists
//
// `.github/actions/setup-pyreon` defaults `restore-bootstrap: 'true'`, and
// restoring the lib/ cache is SLOW — measured 5.9-6.0 min across twelve jobs
// of run 30840261671. Four REQUIRED jobs were budgeted at `timeout-minutes: 5`,
// so the entire budget was consumed inside setup and the check step never ran.
//
// The failure mode is the worst kind. A timed-out job reports `cancelled`, and
// `cancelled` never satisfies a required status check — but it is not a red X
// either. The pull request simply sits at BLOCKED with nothing failing, nothing
// pending, and no explanation. #2642 was permanently unmergeable this way, and
// it read as "CI is slow today" rather than as a broken gate.
//
// The distinction is real and worth keeping: lib-FREE jobs pass
// `restore-bootstrap: 'false'` and legitimately finish in ~0.3 min, so their
// 2-3 minute budgets are correct. This gate only asserts that a job which opted
// INTO the expensive restore has a budget that can survive it.
//
// Deliberately a static scan of the workflow, not a runtime check: the point is
// to fail in `validate-fast` in milliseconds, before a PR is opened and spends
// an hour discovering it cannot merge.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

/**
 * Measured floor for a bootstrap-restoring job. The restore alone is ~6 min, so
 * anything at or under this cannot reliably reach its own check step. Raise it
 * only with a fresh measurement, never to make a red gate green.
 */
export const MIN_BOOTSTRAP_TIMEOUT = 12

export interface JobTimeout {
  job: string
  /** Numeric budget; null when absent OR when declared as an expression (see `declared`). */
  timeout: number | null
  /** True when `timeout-minutes:` is present at all — a `${{ … }}` expression counts. */
  declared?: boolean
  usesSetup: boolean
  restoresBootstrap: boolean
}

/**
 * Parse job blocks out of a workflow file. Jobs are the 2-space-indented keys
 * under `jobs:`; everything until the next such key is that job's body.
 *
 * A regex rather than a YAML parse on purpose — this runs in `validate-fast`,
 * which has no YAML dependency, and the shape being matched (indent-2 key,
 * `timeout-minutes:`, `restore-bootstrap:`) is stable and unambiguous. Pure —
 * unit-tested.
 */
export function parseJobTimeouts(workflowText: string): JobTimeout[] {
  const out: JobTimeout[] = []
  const lines = workflowText.split('\n')
  let current: string | null = null
  let body: string[] = []

  const flush = (): void => {
    if (current === null) return
    const text = body.join('\n')
    // Strip full-line `#` comments before looking for the action. A prose
    // mention of `setup-pyreon` — e.g. a comment explaining what a cell's
    // fixed cost consists of — is not a USE of it, and matching one makes the
    // gate fail a job that never restores anything. Found exactly that way:
    // a comment added to the (setup-bun-only) `changes` job tripped this.
    const code = body.filter((l) => !/^\s*#/.test(l)).join('\n')
    const usesSetup = code.includes('setup-pyreon')
    // An explicit 'false' opts OUT of the expensive restore; the action's
    // default is 'true', so absence means it DOES restore.
    const restoresBootstrap = usesSetup && !/restore-bootstrap:\s*'false'/.test(code)
    const m = /^\s{4}timeout-minutes:\s*(\d+)\s*$/m.exec(text)
    const declared = m !== null || /^\s{4}timeout-minutes:\s*\S/m.test(code)
    out.push({
      job: current,
      timeout: m ? Number(m[1]) : null,
      declared,
      usesSetup,
      restoresBootstrap,
    })
    body = []
  }

  // Only the `jobs:` block: `on:` also nests 2-space keys (`push:`,
  // `schedule:`), which are not jobs.
  let inJobs = false
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true
      continue
    }
    if (/^[a-z]/.test(line)) inJobs = false
    if (!inJobs) continue
    const m = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)
    if (m) {
      flush()
      current = m[1]!
      continue
    }
    if (current !== null) body.push(line)
  }
  flush()
  return out
}

export interface Violation {
  job: string
  timeout: number
}

/**
 * A job with NO `timeout-minutes` runs on GitHub's 6-hour default. On a
 * 20-slot org-wide pool a hung job then holds a slot for six hours; the four
 * such jobs found 2026-09-08 (codeql, dependency-audit, scorecard, the nightly
 * notifier) were all in workflows this gate never scanned.
 */
export function findMissingTimeouts(jobs: JobTimeout[]): string[] {
  return jobs
    .filter((j) => j.timeout === null && !(j.declared ?? false))
    .map((j) => j.job)
    .sort()
}

/**
 * A job is a violation when it restores the bootstrap cache but budgets at or
 * under the measured floor. A job with NO `timeout-minutes` is not flagged —
 * GitHub's 360-minute default is generous, wasteful on a hang, but never the
 * silent-unmergeable failure this gate exists to prevent. Pure — unit-tested.
 */
export function findTimeoutViolations(jobs: JobTimeout[], floor: number): Violation[] {
  return jobs
    .filter((j) => j.restoresBootstrap && j.timeout !== null && j.timeout < floor)
    .map((j) => ({ job: j.job, timeout: j.timeout as number }))
    .sort((a, b) => a.job.localeCompare(b.job))
}

// ─── main ─────────────────────────────────────────────────────────────────

// EVERY workflow: the bootstrap-budget rule only bites ci.yml (the only user
// of setup-pyreon), but the every-job-has-a-timeout rule is repo-wide.
const WORKFLOWS = readdirSync(join(REPO, '.github/workflows'))
  .filter((f) => f.endsWith('.yml'))
  .sort()
  .map((f) => `.github/workflows/${f}`)
const allMissing: Array<{ file: string; job: string }> = []
const allViolations: Array<Violation & { file: string }> = []
let scanned = 0

for (const rel of WORKFLOWS) {
  const text = readFileSync(join(REPO, rel), 'utf8')
  const jobs = parseJobTimeouts(text)
  if (jobs.length === 0) {
    console.error(`[check-ci-job-timeouts] FAILED — parsed ZERO jobs from ${rel}`)
    process.exit(1)
  }
  scanned += jobs.length
  for (const v of findTimeoutViolations(jobs, MIN_BOOTSTRAP_TIMEOUT)) {
    allViolations.push({ ...v, file: rel })
  }
  for (const job of findMissingTimeouts(jobs)) allMissing.push({ file: rel, job })
}

if (allMissing.length > 0) {
  console.error(
    `[check-ci-job-timeouts] FAILED — ${allMissing.length} job(s) declare no timeout-minutes (GitHub's default is 6 HOURS; a hung job holds one of the org's 20 slots for all of it):`,
  )
  for (const m of allMissing) console.error(`  ${m.file}  ${m.job}`)
  process.exit(1)
}

if (allViolations.length > 0) {
  console.error(
    `[check-ci-job-timeouts] FAILED — ${allViolations.length} job(s) restore the bootstrap cache (~6 min) but budget under ${MIN_BOOTSTRAP_TIMEOUT} min:`,
  )
  for (const v of allViolations)
    console.error(`  ${v.file}  ${v.job}  timeout-minutes: ${v.timeout}`)
  console.error(
    `\nSuch a job spends its whole budget inside setup-pyreon and is cancelled before its
check runs. A cancelled job never satisfies a required status check and shows no
red X, so the pull request sits at BLOCKED with nothing to fix.

Either raise the budget past ${MIN_BOOTSTRAP_TIMEOUT}, or — if the job does not need lib/ —
pass \`restore-bootstrap: 'false'\` to setup-pyreon, which is what the fast
lib-free gates do.`,
  )
  process.exit(1)
}

console.log(
  `[check-ci-job-timeouts] ✓ ${scanned} job(s) scanned, every job declares a timeout, no under-budgeted bootstrap jobs`,
)
