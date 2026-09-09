/**
 * Leak-class ratchet — the committed-baseline gate for `audit-leak-classes`.
 *
 * ## Why this replaced a bare ceiling
 *
 * `audit-leak-classes.yml` used to compare the TOTAL finding count against a
 * hardcoded `-gt 40` in the workflow YAML. Three things were wrong with it:
 *
 *  1. **No headroom.** The repo sat at exactly 40, so the next module-level
 *     cache anyone added reddened an otherwise-advisory nightly — while the
 *     comment beside the number still claimed "current baseline (~19) + 2x
 *     headroom". A ceiling whose own comment is 21 findings stale is not a
 *     tuned threshold, it is a tripwire nobody re-read.
 *  2. **A total says only that SOME number moved.** It cannot name the new
 *     finding, so the reader has to re-derive the diff by hand — and by the
 *     time a nightly goes red the offending merge is already several deep.
 *  3. **A total nets out.** Fixing one unbounded cache while adding one
 *     listener leak reads as "no change". `promise-race-no-clear` sits at 0
 *     today; a first Class-I instance would have been invisible until the
 *     total happened to cross 40.
 *
 * A baseline keyed per `detector::file` fixes all three: it can only shrink,
 * it names WHICH file gained WHICH leak class, and a swap is a regression
 * rather than a wash. Same discipline as `lint-baseline.json` /
 * `pyreon-lint-baseline.json`, and it reuses their `compareToBaseline`.
 *
 * The audit stays PERMISSIVE (false positives expected — it is a heuristic
 * scan, see `.claude/rules/anti-patterns.md` "Memory Leak Classes"), so a new
 * entry is a prompt to triage, not proof of a leak. Triaging it to "not a
 * leak" is a legitimate outcome — record it by running `--update` once the
 * finding is understood, exactly as the lint ratchets do.
 *
 * Usage:
 *   bun scripts/check-leak-ratchet.ts            # gate
 *   bun scripts/check-leak-ratchet.ts --update   # tighten after fixing
 *   bun scripts/check-leak-ratchet.ts --json     # machine surface
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { type LintBaseline, compareToBaseline } from './check-lint-ratchet'

export const BASELINE_PATH = 'leak-baseline.json'

const DESCRIPTION =
  'audit-leak-classes ratchet — per `detector::file` counts may only DECREASE. ' +
  'A change pushing any key above its baseline fails `bun scripts/check-leak-ratchet.ts`. ' +
  'The audit is PERMISSIVE (heuristic, false positives expected): a new entry is a prompt ' +
  'to TRIAGE, not proof of a leak — if it is genuinely not one, tighten with `--update` ' +
  'once you have read it. Never raise a count to absorb an untriaged finding. ' +
  'See .claude/rules/anti-patterns.md "Memory Leak Classes".'

interface RawFinding {
  detector?: string
  file?: string
}

/**
 * Pure: fold the audit's `--json` findings into per-`detector::file` counts.
 *
 * Keyed by detector AND file, not by detector alone: the point of a ratchet
 * over a total is that it names the new finding, and "some detector went up"
 * does not. The LINE is deliberately excluded — it churns on every edit above
 * it, which would turn an unrelated refactor into a red gate.
 *
 * `repoRoot` relativises the paths, because the audit emits ABSOLUTE ones and
 * a committed baseline full of `/private/tmp/wt-…` would match on exactly one
 * machine.
 */
export function countLeakFindings(parsed: unknown, repoRoot: string): Record<string, number> {
  const findings: RawFinding[] = (parsed as { findings?: RawFinding[] } | null)?.findings ?? []
  const counts: Record<string, number> = {}
  for (const f of findings) {
    const detector = String(f.detector ?? 'unknown')
    const file = f.file === undefined ? 'unknown' : relative(repoRoot, f.file)
    const key = `${detector}::${file}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** Build the baseline object (DOWN-only ratchet) from current counts. */
export function buildBaseline(current: Record<string, number>): LintBaseline {
  const total = Object.values(current).reduce((a, b) => a + b, 0)
  // Sorted by key, not by count: a per-file baseline is read as a diff far more
  // often than as a leaderboard, and a stable order keeps `--update` from
  // producing noisy reorderings when two keys share a count.
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { description: DESCRIPTION, total, rules: sorted }
}

/**
 * Run the audit and parse its JSON.
 *
 * Redirected to a FILE rather than captured from stdout: `audit-leak-classes`
 * ends in `process.exit(0)`, and a Bun child that exits can truncate a piped
 * stdout under CI load — the same lesson `check-pyreon-lint-ratchet` records.
 */
function runAuditJson(repoRoot: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'leak-ratchet-'))
  const outFile = join(dir, 'findings.json')
  try {
    try {
      execSync(`bun scripts/audit-leak-classes.ts --json > ${JSON.stringify(outFile)}`, {
        cwd: repoRoot,
        stdio: ['ignore', 'ignore', 'inherit'],
        maxBuffer: 256 * 1024 * 1024,
      })
    } catch {
      /* a non-zero exit still leaves the file — parse what is there */
    }
    const out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
    if (!out.trim()) throw new Error('[leak-ratchet] audit-leak-classes produced no JSON output')
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const updateMode = args.includes('--update')
  const repoRoot = process.cwd()

  const current = countLeakFindings(runAuditJson(repoRoot), repoRoot)
  const total = Object.values(current).reduce((a, b) => a + b, 0)

  if (updateMode) {
    const baseline = buildBaseline(current)
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(
      `[leak-ratchet] baseline updated: ${total} finding(s) across ${Object.keys(current).length} detector/file key(s)`,
    )
    return
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ ${BASELINE_PATH} not found. Seed it with \`bun scripts/check-leak-ratchet.ts --update\`.`,
    )
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as LintBaseline
  const { regressions, improvements } = compareToBaseline(current, baseline.rules)

  if (jsonMode) {
    console.log(
      JSON.stringify({ total, baselineTotal: baseline.total, regressions, improvements }, null, 2),
    )
    process.exit(regressions.length > 0 ? 1 : 0)
  }

  if (regressions.length > 0) {
    console.error('✗ Leak ratchet — these leak-class findings grew above their baseline:')
    for (const r of regressions) {
      const [detector, file] = r.rule.split('::')
      console.error(`    ${file}  [${detector}]  ${r.baseline} → ${r.current}`)
    }
    console.error('\nRead each one (`bun scripts/audit-leak-classes.ts` prints the line + context).')
    console.error('The audit is permissive, so a finding may be a false positive — but it must be')
    console.error('READ before it is absorbed. Fix the leak, or `--update` once you have triaged it.')
    console.error('See .claude/rules/anti-patterns.md "Memory Leak Classes" for the fix shapes.')
    process.exit(1)
  }

  if (improvements.length > 0) {
    const dropped = improvements.reduce((a, r) => a + (r.baseline - r.current), 0)
    console.log(
      `✓ Leak ratchet — ${total} finding(s) (baseline ${baseline.total}); ${dropped} fewer across ${improvements.length} key(s).`,
    )
    console.log('  Tighten the baseline: `bun scripts/check-leak-ratchet.ts --update`')
  } else {
    console.log(`✓ Leak ratchet — ${total} finding(s), nothing above baseline.`)
  }
}

if (import.meta.main) main()
