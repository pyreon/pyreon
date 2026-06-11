#!/usr/bin/env bun
/**
 * Pyreon-lint ratchet — `@pyreon/lint`'s OWN rules over the framework's own
 * package `src` (`packages/<cat>/<pkg>/src`) may only go DOWN.
 *
 * The `Pyreon Lint Gate` (`pyreon doctor --only lint --ci`) fails only on
 * ERROR-severity findings — so the advisory `warning` + `info` findings the
 * framework's own dogfooding produces are free to drift UP forever. This gate
 * is the missing keystone: it locks that advisory backlog as a non-growing
 * floor. A change that pushes any rule above its baseline fails. Decreases pass
 * — you then tighten the baseline via `--update`. Together with the error tier
 * (gated by the Pyreon Lint Gate) this gives the framework's self-lint the SAME
 * three-state + ratchet discipline that `check-lint-ratchet.ts` already gives
 * oxlint: error = protected at 0, warn/info = a burn-down lane that can only
 * shrink, off = deliberately N/A (a rule scoped-off for a package via
 * `.pyreonlintrc.json` / `exemptPaths` simply stops producing findings).
 *
 * See `.claude/rules/code-style.md` "three-state model" for the philosophy and
 * `scripts/check-lint-ratchet.ts` for the oxlint sibling this mirrors.
 *
 * Runs from the repo root (resolves `@pyreon/lint` + the CLI via the `bun`
 * workspace condition → src; no `lib/` build needed). ~1s.
 *
 * Usage:
 *   bun scripts/check-pyreon-lint-ratchet.ts            # gate: fail if any rule regressed
 *   bun scripts/check-pyreon-lint-ratchet.ts --json     # machine-readable
 *   bun scripts/check-pyreon-lint-ratchet.ts --update   # regenerate the baseline (only DOWN)
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type LintBaseline, compareToBaseline } from './check-lint-ratchet'

export const BASELINE_PATH = 'pyreon-lint-baseline.json'

interface DoctorFinding {
  code?: string
  severity?: string
}

/**
 * Pure: count NON-error `@pyreon/lint` findings per rule from the
 * `doctor --only lint --json` report. Error-severity findings are gated at 0
 * by the Pyreon Lint Gate itself (`--ci`), so the ratchet covers only the
 * advisory (`warning` + `info`) backlog — the half nothing else locks.
 */
export function countPyreonFindings(parsed: unknown): Record<string, number> {
  const findings: DoctorFinding[] =
    (parsed as { findings?: DoctorFinding[] } | null)?.findings ?? []
  const counts: Record<string, number> = {}
  for (const f of findings) {
    if (String(f.severity ?? '').toLowerCase() === 'error') continue
    const code = String(f.code ?? 'unknown')
    counts[code] = (counts[code] ?? 0) + 1
  }
  return counts
}

const DESCRIPTION =
  'Pyreon-lint ratchet — @pyreon/lint advisory (warning + info) findings over framework `packages/*/src` ' +
  'may only DECREASE. A change pushing any rule above its baseline fails `bun scripts/check-pyreon-lint-ratchet.ts`. ' +
  'After fixing findings (or scoping a rule off for a package with rationale), tighten with `--update`. ' +
  'Never raise the baseline to absorb new findings. See .claude/rules/code-style.md (three-state model).'

/** Build the baseline object (DOWN-only ratchet) from current counts. */
export function buildBaseline(current: Record<string, number>): LintBaseline {
  const total = Object.values(current).reduce((a, b) => a + b, 0)
  const sorted = Object.fromEntries(Object.entries(current).sort(([, a], [, b]) => b - a))
  return { description: DESCRIPTION, total, rules: sorted }
}

function runPyreonLintJson(): unknown {
  // Redirect the doctor's (~400KB) JSON to a temp FILE rather than capturing
  // its stdout pipe. The doctor is a Bun process that prints the report and
  // `process.exit`s — under a captured pipe in CI, Bun can exit before the
  // stdout buffer fully flushes, truncating the capture ("Unterminated string"
  // at JSON.parse). A shell `>` file redirect is OS-buffered and flushes
  // reliably (it's the same method that produces clean output interactively).
  // The oxlint ratchet doesn't hit this because oxlint is a Rust binary that
  // flushes stdout deterministically on exit.
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-ratchet-'))
  const outFile = join(dir, 'doctor.json')
  try {
    try {
      execSync(`bun packages/tools/cli/src/index.ts doctor --only lint --json > ${JSON.stringify(outFile)}`, {
        stdio: ['ignore', 'ignore', 'inherit'],
        maxBuffer: 256 * 1024 * 1024,
      })
    } catch {
      // The CLI exits non-zero only when an ERROR-severity finding exists — the
      // file still holds the full JSON report, so the ratchet reads it anyway.
    }
    const out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
    if (!out.trim()) throw new Error('[pyreon-lint-ratchet] doctor produced no JSON output')
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const updateMode = args.includes('--update')

  const current = countPyreonFindings(runPyreonLintJson())
  const total = Object.values(current).reduce((a, b) => a + b, 0)

  if (updateMode) {
    const baseline = buildBaseline(current)
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(
      `[pyreon-lint-ratchet] baseline updated: ${total} advisory finding(s) across ${Object.keys(current).length} rule(s)`,
    )
    return
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ ${BASELINE_PATH} not found. Seed it with \`bun scripts/check-pyreon-lint-ratchet.ts --update\`.`,
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
    console.error('✗ Pyreon-lint ratchet — these rules grew above their baseline:')
    for (const r of regressions) {
      console.error(`    ${r.rule}: ${r.baseline} → ${r.current} (+${r.current - r.baseline})`)
    }
    console.error(
      '\nFix the new findings (`bun run lint:pyreon` to see them), or — if the rule genuinely',
    )
    console.error(
      'does not apply to this framework package — scope it off in .pyreonlintrc.json with a',
    )
    console.error('rationale. The baseline only moves DOWN; do NOT raise it to absorb new findings.')
    process.exit(1)
  }

  if (improvements.length > 0) {
    const dropped = improvements.reduce((a, r) => a + (r.baseline - r.current), 0)
    console.log(
      `✓ Pyreon-lint ratchet — ${total} advisory finding(s) (baseline ${baseline.total}); ${dropped} fewer across ${improvements.length} rule(s).`,
    )
    console.log('  Tighten the baseline: `bun scripts/check-pyreon-lint-ratchet.ts --update`')
  } else {
    console.log(`✓ Pyreon-lint ratchet — ${total} advisory finding(s), no rule above baseline.`)
  }
}

if (import.meta.main) main()
