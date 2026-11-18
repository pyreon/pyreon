// Fail a PR on high-severity dependency advisories THE PR INTRODUCES — not on
// advisories that already exist on its base.
//
// ## Why this gate exists
//
// `Release Build` ran a bare `bun audit --audit-level=high` on every PR. The
// advisory database changes on its own schedule, independently of any PR, so
// the morning two advisories were published against transitive dependencies
// already in main's lockfile (`follow-redirects` via axios, `joi`), EVERY open
// PR turned red at once — PRs touching nothing but docs included. `Release
// Build` is required, so nothing could merge until someone landed a lockfile
// bump: main went four days without a single merge (2026-10-29 → 11-02), and
// the native compile-verdict cache, which only main can publish, went stale
// with it, making every native PR's validation lane several times slower.
//
// A PR cannot be held responsible for the state of the world. What it IS
// responsible for is not making the lockfile worse. So on a pull request:
//
//   - an advisory present in the PR's lockfile and ABSENT from the base's
//     lockfile is the PR's doing → fail;
//   - an advisory present in both is pre-existing → `::warning::` + summary,
//     never a red check. `dependency-audit.yml` (main push + weekly) and the
//     non-PR runs of this script own it.
//
// Off a pull request (push to main, release), there is no base to compare
// against and the full set is enforced: main must not ship a known high.
//
// `bun audit` reads only `bun.lock` (verified: a lockfile beside a stub
// `package.json` yields the byte-identical advisory set to a full checkout), so
// the base is audited from `git show <base>:bun.lock` in a scratch directory —
// no second checkout, no install.
//
// ## Advisories with no fixed release
//
// Strict mode has one failure it cannot be allowed to have: an advisory whose
// vulnerable range covers EVERY published version. No lockfile bump clears it,
// so main and the release workflow stay red until upstream ships, and a gate
// that is red for a reason nobody can act on hides the next real failure
// (GHSA-fc5q-39xc-vjpf, picomatch `<=4.0.7` with 4.0.7 the newest release,
// kept `Release Build` and the release PR red on main).
//
// `scripts/advisory-acceptances.json` records such an advisory, and an entry
// holds only while BOTH are true:
//
//   - the advisory's vulnerable range is still the one that was reviewed. A
//     fixed release changes the range (`<=4.0.7` becomes `<4.0.8`), the entry
//     stops matching, and the gate fails again until the lockfile is bumped;
//   - it has not passed `expires`, at most 30 days after `accepted`, so nothing
//     is waved through indefinitely.
//
// An accepted advisory is still printed as a `::warning::` on every run.
//
// Usage: bun scripts/audit-new-advisories.ts [--base <git-ref>] [--level high]

import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type Severity = 'low' | 'moderate' | 'high' | 'critical'

const RANK: Record<string, number> = { low: 0, moderate: 1, high: 2, critical: 3 }

export interface Advisory {
  pkg: string
  id: number
  severity: string
  title: string
  url: string
  /** The advisory's vulnerable range, as `bun audit` reports it. */
  vulnerableVersions: string
}

/** One reviewed advisory that has no fixed release yet. */
export interface Acceptance {
  /** Package name as `bun audit` keys it. */
  pkg: string
  /** GHSA id, the last segment of the advisory URL. */
  ghsa: string
  /** The vulnerable range that was reviewed; the entry lapses when it changes. */
  vulnerableVersions: string
  /** ISO date the entry was reviewed. */
  accepted: string
  /** ISO date after which the entry no longer holds. */
  expires: string
  /** Why the exposure is tolerable until a fix ships. */
  reason: string
}

export const ACCEPTANCES_FILE = join(import.meta.dirname, 'advisory-acceptances.json')

/** Longest an entry may stand before someone has to look again. */
export const MAX_ACCEPTANCE_DAYS = 30

const DAY_MS = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Problems with the acceptance list itself; empty when it is well-formed. */
export function acceptanceProblems(list: Acceptance[]): string[] {
  const problems: string[] = []
  for (const a of list) {
    const where = `${a.pkg} ${a.ghsa}`
    for (const field of ['pkg', 'ghsa', 'vulnerableVersions', 'reason'] as const) {
      if (typeof a[field] !== 'string' || a[field].trim() === '') problems.push(`${where}: ${field} is empty`)
    }
    if (!ISO_DATE.test(a.accepted) || !ISO_DATE.test(a.expires)) {
      problems.push(`${where}: accepted and expires must be YYYY-MM-DD`)
      continue
    }
    const days = (Date.parse(a.expires) - Date.parse(a.accepted)) / DAY_MS
    if (!(days > 0 && days <= MAX_ACCEPTANCE_DAYS)) {
      problems.push(`${where}: expires must be 1-${MAX_ACCEPTANCE_DAYS} days after accepted (is ${days})`)
    }
  }
  return problems
}

const ghsaOf = (a: Advisory): string => a.url.slice(a.url.lastIndexOf('/') + 1)

/**
 * Split advisories into the ones that block and the ones a live acceptance
 * covers. `lapsed` lists entries that name a reported advisory but no longer
 * hold, with the reason, so the failure says what to do.
 */
export function applyAcceptances(
  list: Advisory[],
  acceptances: Acceptance[],
  today: string,
): { blocking: Advisory[]; accepted: Advisory[]; lapsed: string[] } {
  const blocking: Advisory[] = []
  const accepted: Advisory[] = []
  const lapsed: string[] = []
  for (const a of list) {
    const entry = acceptances.find((e) => e.pkg === a.pkg && e.ghsa === ghsaOf(a))
    if (!entry) {
      blocking.push(a)
    } else if (entry.vulnerableVersions !== a.vulnerableVersions) {
      blocking.push(a)
      lapsed.push(
        `${a.pkg} ${entry.ghsa}: the vulnerable range changed from "${entry.vulnerableVersions}" to ` +
          `"${a.vulnerableVersions}", so a fixed release probably exists. Bump the lockfile and delete the entry.`,
      )
    } else if (today > entry.expires) {
      blocking.push(a)
      lapsed.push(
        `${a.pkg} ${entry.ghsa}: the acceptance expired on ${entry.expires}. Review the advisory again ` +
          `and renew the entry, or remove the dependency.`,
      )
    } else {
      accepted.push(a)
    }
  }
  return { blocking, accepted, lapsed }
}

function loadAcceptances(): Acceptance[] {
  const list = JSON.parse(readFileSync(ACCEPTANCES_FILE, 'utf8')) as Acceptance[]
  const problems = acceptanceProblems(list)
  if (problems.length) {
    throw new Error(`[audit-new-advisories] ${ACCEPTANCES_FILE} is malformed:\n  ${problems.join('\n  ')}`)
  }
  return list
}

/** Flatten `bun audit --json` output (`{ [pkg]: Advisory[] }`) to a list. */
export function parseAudit(json: string): Advisory[] {
  const trimmed = json.trim()
  if (trimmed === '') return []
  const data = JSON.parse(trimmed) as Record<
    string,
    Array<{ id: number; severity: string; title?: string; url?: string; vulnerable_versions?: string }>
  >
  const out: Advisory[] = []
  for (const [pkg, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue
    for (const a of list) {
      out.push({
        pkg,
        id: a.id,
        severity: a.severity,
        title: a.title ?? '',
        url: a.url ?? '',
        vulnerableVersions: a.vulnerable_versions ?? '',
      })
    }
  }
  return out
}

/** Advisories at or above `level`. An unknown severity is kept (fail closed). */
export function atLeast(list: Advisory[], level: Severity): Advisory[] {
  const min = RANK[level]!
  return list.filter((a) => (RANK[a.severity] ?? Number.POSITIVE_INFINITY) >= min)
}

const keyOf = (a: Advisory): string => `${a.pkg}#${a.id}`

/**
 * Split head's advisories into the ones the change INTRODUCED and the ones
 * already present on the base. Identity is package + advisory id, so a PR that
 * moves a vulnerable package to another still-vulnerable version is not "new",
 * while a PR that pulls a vulnerable package in for the first time is.
 */
export function diffAdvisories(
  head: Advisory[],
  base: Advisory[],
): { introduced: Advisory[]; preexisting: Advisory[] } {
  const baseKeys = new Set(base.map(keyOf))
  const introduced: Advisory[] = []
  const preexisting: Advisory[] = []
  for (const a of head) (baseKeys.has(keyOf(a)) ? preexisting : introduced).push(a)
  return { introduced, preexisting }
}

/**
 * Run `bun audit --json` in `cwd`. `bun audit` exits non-zero whenever ANY
 * advisory exists, so the exit code is not the verdict — the JSON is. Output
 * that is not JSON means the audit itself failed (registry unreachable,
 * malformed lockfile): that throws, so the gate fails closed rather than
 * reading "could not check" as "clean".
 */
function runAudit(cwd: string): Advisory[] {
  const r = spawnSync('bun', ['audit', '--json'], { cwd, encoding: 'utf8' })
  try {
    return parseAudit(r.stdout ?? '')
  } catch {
    throw new Error(
      `[audit-new-advisories] \`bun audit\` produced no JSON in ${cwd} (exit ${r.status}).\n` +
        `stderr:\n${(r.stderr ?? '').slice(0, 2000)}`,
    )
  }
}

function auditLockAt(ref: string): Advisory[] {
  const lock = execFileSync('git', ['show', `${ref}:bun.lock`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-audit-base-'))
  try {
    writeFileSync(join(dir, 'bun.lock'), lock)
    writeFileSync(join(dir, 'package.json'), '{"name":"audit-base","private":true}\n')
    return runAudit(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const line = (a: Advisory): string => `${a.severity} ${a.pkg}: ${a.title} ${a.url}`.trim()

function summary(md: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, `${md}\n`)
}

function main(argv: string[]): number {
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const level = (arg('--level') ?? 'high') as Severity
  if (!(level in RANK)) {
    console.error(`[audit-new-advisories] unknown --level ${level}`)
    return 2
  }
  const base = arg('--base')

  const today = new Date().toISOString().slice(0, 10)
  const { blocking: head, accepted, lapsed } = applyAcceptances(
    atLeast(runAudit(process.cwd()), level),
    loadAcceptances(),
    today,
  )
  for (const a of accepted) console.log(`::warning::accepted, no fixed release yet: ${line(a)}`)
  for (const l of lapsed) console.log(`::error::acceptance no longer holds: ${l}`)
  if (accepted.length)
    {summary(
      `## Accepted advisories with no fixed release\n\n${accepted.map((a) => `- ${line(a)}`).join('\n')}\n\n` +
        'Recorded in `scripts/advisory-acceptances.json`; each entry lapses when a fix ships or on its expiry date.',
    )}

  if (!base) {
    if (head.length === 0) {
      console.log(`No ${level}+ advisories.`)
      return 0
    }
    for (const a of head) console.log(`::error::${line(a)}`)
    summary(`## Dependency advisories (${level}+)\n\n${head.map((a) => `- ${line(a)}`).join('\n')}`)
    return 1
  }

  const { introduced, preexisting } = diffAdvisories(head, atLeast(auditLockAt(base), level))

  for (const a of preexisting) console.log(`::warning::pre-existing on ${base}: ${line(a)}`)
  for (const a of introduced) console.log(`::error::introduced by this change: ${line(a)}`)

  const parts = [`## Dependency advisories (${level}+) vs \`${base}\``]
  parts.push(
    introduced.length
      ? `### Introduced by this change — blocking\n\n${introduced.map((a) => `- ${line(a)}`).join('\n')}`
      : '### Introduced by this change\n\nNone.',
  )
  if (preexisting.length)
    {parts.push(
      `### Already on the base — not blocking this PR\n\n${preexisting
        .map((a) => `- ${line(a)}`)
        .join('\n')}\n\nThese are tracked by \`dependency-audit.yml\` and enforced on pushes to main.`,
    )}
  summary(parts.join('\n\n'))

  if (introduced.length) return 1
  console.log(
    `No ${level}+ advisories introduced (${preexisting.length} pre-existing on ${base}, reported above).`,
  )
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
