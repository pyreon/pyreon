#!/usr/bin/env bun
/**
 * Lint ratchet — oxlint WARN-severity findings may only go DOWN.
 *
 * `error`-severity rules are already gated at 0 by oxlint itself (the `Lint`
 * CI job exits non-zero on any error). This gate covers the OTHER half: the
 * `warn` backlog. Each tracked rule carries a baseline count; a change that
 * pushes any rule ABOVE its baseline fails. Decreases pass — you then tighten
 * the baseline via `--update`. Together with the error tier, the config can
 * only improve: new code can't refill the backlog while it's burned down.
 *
 * This is the keystone that turns the lint config from a one-time snapshot
 * into a self-sustaining quality system. See `.claude/rules/code-style.md`
 * "three-state model" for the philosophy.
 *
 * Usage:
 *   bun scripts/check-lint-ratchet.ts            # gate: fail if any rule regressed
 *   bun scripts/check-lint-ratchet.ts --json     # machine-readable
 *   bun scripts/check-lint-ratchet.ts --update   # regenerate the baseline (only DOWN)
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const BASELINE_PATH = 'lint-baseline.json'

export interface LintBaseline {
  description: string
  total: number
  rules: Record<string, number>
}

interface OxlintDiag {
  code?: string
  severity?: string
}

/** Pure: count WARN-severity findings per rule from oxlint's JSON output. */
export function countWarnFindings(parsed: unknown): Record<string, number> {
  const diags: OxlintDiag[] = Array.isArray(parsed)
    ? (parsed as OxlintDiag[])
    : ((parsed as { diagnostics?: OxlintDiag[] } | null)?.diagnostics ?? [])
  const counts: Record<string, number> = {}
  for (const d of diags) {
    // error-severity findings are gated at 0 by oxlint itself — only ratchet warns.
    if (String(d.severity ?? '').toLowerCase() !== 'warning') continue
    const code = String(d.code ?? 'unknown')
    counts[code] = (counts[code] ?? 0) + 1
  }
  return counts
}

export interface RuleDelta {
  rule: string
  baseline: number
  current: number
}

/** Pure: compare current per-rule counts against the baseline. */
export function compareToBaseline(
  current: Record<string, number>,
  baseline: Record<string, number>,
): { regressions: RuleDelta[]; improvements: RuleDelta[]; newRules: RuleDelta[] } {
  const regressions: RuleDelta[] = []
  const improvements: RuleDelta[] = []
  const newRules: RuleDelta[] = []
  const rules = new Set([...Object.keys(current), ...Object.keys(baseline)])
  for (const rule of rules) {
    const now = current[rule] ?? 0
    const base = baseline[rule] ?? 0
    if (!(rule in baseline) && now > 0) newRules.push({ rule, baseline: 0, current: now })
    if (now > base) regressions.push({ rule, baseline: base, current: now })
    else if (now < base) improvements.push({ rule, baseline: base, current: now })
  }
  regressions.sort((a, b) => b.current - b.baseline - (a.current - a.baseline))
  improvements.sort((a, b) => b.baseline - b.current - (a.baseline - a.current))
  return { regressions, improvements, newRules }
}

/** Build the baseline object (DOWN-only ratchet) from current counts. */
export function buildBaseline(current: Record<string, number>): LintBaseline {
  const total = Object.values(current).reduce((a, b) => a + b, 0)
  const sorted = Object.fromEntries(Object.entries(current).sort(([, a], [, b]) => b - a))
  return {
    description:
      'oxlint WARN-finding ratchet — per-rule counts may only DECREASE. ' +
      'A change pushing any rule above its baseline fails `bun scripts/check-lint-ratchet.ts`. ' +
      'After fixing findings, tighten with `--update`. Never raise the baseline to absorb new findings. ' +
      'See .claude/rules/code-style.md (three-state model).',
    total,
    rules: sorted,
  }
}

function runOxlintJson(): unknown {
  let out = ''
  try {
    out = execSync('bunx oxlint . --format=json', {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (e) {
    // oxlint exits non-zero when there are ERROR findings — stdout still holds the JSON.
    out = String((e as { stdout?: string }).stdout ?? '')
  }
  if (!out.trim()) throw new Error('[lint-ratchet] oxlint produced no JSON output')
  return JSON.parse(out)
}

function main(): void {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const updateMode = args.includes('--update')

  const current = countWarnFindings(runOxlintJson())
  const total = Object.values(current).reduce((a, b) => a + b, 0)

  if (updateMode) {
    const baseline = buildBaseline(current)
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(
      `[lint-ratchet] baseline updated: ${total} warn finding(s) across ${Object.keys(current).length} rule(s)`,
    )
    return
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ ${BASELINE_PATH} not found. Seed it with \`bun scripts/check-lint-ratchet.ts --update\`.`,
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
    console.error('✗ Lint ratchet — these rules grew above their baseline:')
    for (const r of regressions) {
      console.error(`    ${r.rule}: ${r.baseline} → ${r.current} (+${r.current - r.baseline})`)
    }
    console.error('\nFix the new findings (`bunx oxlint .` to see them), or — if genuinely')
    console.error('intentional — scope/suppress with a rationale. The baseline only moves DOWN;')
    console.error('do NOT raise it to absorb new findings.')
    process.exit(1)
  }

  if (improvements.length > 0) {
    const dropped = improvements.reduce((a, r) => a + (r.baseline - r.current), 0)
    console.log(
      `✓ Lint ratchet — ${total} warn finding(s) (baseline ${baseline.total}); ${dropped} fewer across ${improvements.length} rule(s).`,
    )
    console.log('  Tighten the baseline: `bun scripts/check-lint-ratchet.ts --update`')
  } else {
    console.log(`✓ Lint ratchet — ${total} warn finding(s), no rule above baseline.`)
  }
}

if (import.meta.main) main()
