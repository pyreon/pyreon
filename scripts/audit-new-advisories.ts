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
// Usage: bun scripts/audit-new-advisories.ts [--base <git-ref>] [--level high]

import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
}

/** Flatten `bun audit --json` output (`{ [pkg]: Advisory[] }`) to a list. */
export function parseAudit(json: string): Advisory[] {
  const trimmed = json.trim()
  if (trimmed === '') return []
  const data = JSON.parse(trimmed) as Record<
    string,
    Array<{ id: number; severity: string; title?: string; url?: string }>
  >
  const out: Advisory[] = []
  for (const [pkg, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue
    for (const a of list) {
      out.push({ pkg, id: a.id, severity: a.severity, title: a.title ?? '', url: a.url ?? '' })
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

  const head = atLeast(runAudit(process.cwd()), level)

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
    parts.push(
      `### Already on the base — not blocking this PR\n\n${preexisting
        .map((a) => `- ${line(a)}`)
        .join('\n')}\n\nThese are tracked by \`dependency-audit.yml\` and enforced on pushes to main.`,
    )
  summary(parts.join('\n\n'))

  if (introduced.length) return 1
  console.log(
    `No ${level}+ advisories introduced (${preexisting.length} pre-existing on ${base}, reported above).`,
  )
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
