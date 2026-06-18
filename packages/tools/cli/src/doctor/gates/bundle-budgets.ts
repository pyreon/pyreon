/**
 * bundle-budgets gate — programmatic API.
 *
 * Locks the gzipped main-entry size of every published `@pyreon/*`
 * package against `scripts/bundle-budgets.json` (current + 25% headroom).
 * Three classes of finding land here:
 *
 *   1. **violations** — package bundles past its budget (real regression).
 *      Severity: `error`. Code: `bundle-budgets/over-budget`.
 *   2. **missing** — package has no entry in `bundle-budgets.json` yet
 *      (new published package — author needs to commit a budget).
 *      Severity: `warning`. Code: `bundle-budgets/missing-budget`.
 *   3. **failures** — the bundler couldn't measure a package (unresolved
 *      transitive dep, build artifact issue). Severity: `error`. Code:
 *      `bundle-budgets/bundle-failed`. Surfaced as a finding rather than
 *      silently dropped — same lesson as PR #434.
 *
 * **Implementation note (subprocess adapter).** This gate invokes the
 * standalone `scripts/check-bundle-budgets.ts` script via `--json` and
 * parses the output. The script is 466 lines of bundler orchestration
 * + AST-walking dep collection logic; extracting it surgically into a
 * pure function carries too much risk for PR 1. The adapter shape lets
 * the doctor aggregator consume the same `Finding[]` shape as the other
 * gates; full extraction is a deferred follow-up (`pyreon doctor`
 * doesn't care HOW the gate runs — only that it returns `GateResult`).
 *
 * The full-bundle measurement is the slowest gate (~15-30s against
 * 50+ published packages). Doctor's default fast mode opts this gate
 * OUT; `--full` enables it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding, GateResult } from '../types'

interface ScriptViolation {
  name: string
  current: number
  budget: number
  overBy: number
  overByPct: number
}

interface ScriptMissing {
  name: string
  current: number
}

interface ScriptFailure {
  name: string
  error: string
}

interface ScriptMeasured {
  name: string
  raw: number
  gzip: number
}

interface ScriptOutput {
  violations: ScriptViolation[]
  missing: ScriptMissing[]
  failures: ScriptFailure[]
  measured: ScriptMeasured[]
}

const formatKB = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KB`

/**
 * Pure parse-and-map function — public so tests can exercise the JSON
 * → `Finding[]` translation without spawning a subprocess. Returns the
 * findings plus the count of packages scanned (measured + failures).
 * Exported as `_internal` (unstable API surface — may move when PR 2
 * lands the aggregator).
 */
export const _parseBundleBudgetsOutput = (
  raw: string,
  cwd: string,
): { findings: Finding[]; scanned: number } => {
  const result = JSON.parse(raw) as ScriptOutput
  const findings: Finding[] = []
  const budgetsRelPath = 'scripts/bundle-budgets.json'
  const budgetsPath = join(cwd, budgetsRelPath)

  for (const v of result.violations) {
    findings.push({
      category: 'performance',
      severity: 'error',
      code: 'bundle-budgets/over-budget',
      gate: 'bundle-budgets',
      message: `${v.name}: ${formatKB(v.current)} > budget ${formatKB(v.budget)} (over by ${formatKB(v.overBy)}, +${v.overByPct.toFixed(1)}%). If growth is intentional, bump the value in scripts/bundle-budgets.json — the bump itself is the PR signal.`,
      location: { path: budgetsPath, relPath: budgetsRelPath },
      fix: `Run \`bun run check-bundle-budgets --update\` to regenerate budgets after intentional growth.`,
    })
  }

  for (const m of result.missing) {
    findings.push({
      category: 'performance',
      severity: 'warning',
      code: 'bundle-budgets/missing-budget',
      gate: 'bundle-budgets',
      message: `${m.name}: ${formatKB(m.current)} (no budget entry). New published package?`,
      location: { path: budgetsPath, relPath: budgetsRelPath },
      fix: `Run \`bun run check-bundle-budgets --update\` and review the diff.`,
    })
  }

  for (const f of result.failures) {
    findings.push({
      category: 'performance',
      severity: 'error',
      code: 'bundle-budgets/bundle-failed',
      gate: 'bundle-budgets',
      message: `${f.name}: bundle failed — ${f.error.split('\n')[0]}. Likely an unresolved third-party dep that the auto-external scan missed.`,
    })
  }

  return {
    findings,
    scanned: result.measured.length + result.failures.length,
  }
}

export interface BundleBudgetsGateOptions {
  /** Repository root directory */
  cwd: string
  /** Path to bun executable. Defaults to `'bun'`. */
  bun?: string
}

export const runBundleBudgetsGate = async (
  opts: BundleBudgetsGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const scriptPath = join(opts.cwd, 'scripts/check-bundle-budgets.ts')

  // Monorepo-internal budget script — skip gracefully outside the Pyreon
  // repo (`pyreon doctor --full` on a user app must not error on a script
  // that's intentionally absent there).
  if (!existsSync(scriptPath)) {
    return {
      gate: 'bundle-budgets',
      category: 'performance',
      findings: [],
      meta: {
        elapsedMs: Date.now() - start,
        skipped: true,
        skipReason:
          'bundle-budget audit targets the Pyreon monorepo (scripts/check-bundle-budgets.ts not present here)',
      },
    }
  }

  let scannedPackages = 0
  try {
    // The script always exits 1 when there are violations/missing/failures
    // — but writes valid JSON to stdout regardless. Use a try/catch to
    // capture stdout from the non-zero exit. `execFileSync` throws on
    // non-zero, attaching `.stdout` to the error object.
    let out: string
    try {
      out = execFileSync(opts.bun ?? 'bun', ['run', scriptPath, '--json'], {
        cwd: opts.cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
      })
    } catch (err) {
      const e = err as { stdout?: string | Buffer; message?: string }
      if (e.stdout) {
        out = typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8')
      } else {
        throw err
      }
    }

    const parsed = _parseBundleBudgetsOutput(out, opts.cwd)
    findings.push(...parsed.findings)
    scannedPackages = parsed.scanned
  } catch (err) {
    // Script failure — surface as a single ERROR finding so the
    // gate doesn't silently skip. Captures parse errors, script-not-
    // found, missing bundle-budgets.json, etc.
    findings.push({
      category: 'performance',
      severity: 'error',
      code: 'bundle-budgets/gate-failed',
      gate: 'bundle-budgets',
      message: `bundle-budgets gate failed to run: ${(err as Error).message}`,
    })
  }

  return {
    gate: 'bundle-budgets',
    category: 'performance',
    findings,
    meta: {
      scanned: scannedPackages,
      elapsedMs: Date.now() - start,
    },
  }
}
