#!/usr/bin/env bun
/**
 * Readable ratchet — the `readable` style findings, counted PER FILE, may only
 * go down.
 *
 * The repo turns on `@pyreon/lint`'s `readable` preset layer
 * (`.pyreonlintrc.json` → `"preset": ["strict", "readable"]`) without
 * reformatting existing source: about ten large PRs are open at any time, and
 * inserting thousands of blank lines would conflict with every one of them.
 * Instead the findings that exist today are frozen here, per (file, rule):
 *
 *   - a file may never gain a finding it does not already have;
 *   - a file that is not in the baseline (every NEW file) must be clean;
 *   - fixing findings always passes — tighten with `--update` afterwards.
 *
 * Why per FILE and not per rule like `pyreon-lint-baseline.json`: with
 * thousands of findings, a per-rule total lets a PR add a violation in one file
 * while an unrelated cleanup removes one elsewhere, and the total never moves.
 * The spacing findings are all autofixable, so a new one costs one
 * `pyreon-lint --fix <file>` (or fix-on-save) to clear.
 *
 * Input is the same `pyreon doctor --only lint --json` report the Pyreon Lint
 * Gate produces, so the readable rules ride the gate's single lint run (and its
 * AST cache) instead of a second pass. `check-pyreon-lint-ratchet.ts` runs this
 * check on the report it already has; run this file directly to `--update`.
 *
 * Usage:
 *   bun scripts/check-readable-ratchet.ts            # gate
 *   bun scripts/check-readable-ratchet.ts --update   # rewrite the baseline (refuses to raise it)
 *   bun scripts/check-readable-ratchet.ts --update --accept-moves
 *                                                    # after renaming/moving files only
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const READABLE_BASELINE_PATH = 'readable-baseline.json'

const STYLE_RULES_DIR = join(import.meta.dirname, '..', 'packages', 'tools', 'lint', 'src', 'rules', 'style')

/**
 * The doctor codes of every `style` rule, read from the rule DIRECTORY rather
 * than typed here: a list that has to track a registry by hand is how a new
 * rule silently escapes the ratchet.
 */
export function readableCodes(dir: string = STYLE_RULES_DIR): Set<string> {
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => `lint/pyreon/${f.slice(0, -3)}`),
  )
}

/** file → rule → count */
export type PerFileCounts = Record<string, Record<string, number>>

interface DoctorFinding {
  code?: string
  location?: { relPath?: string }
}

/** Count readable findings per (file, rule) from a `doctor --only lint --json` report. */
export function countReadableFindings(parsed: unknown, codes: Set<string> = readableCodes()): PerFileCounts {
  const findings: DoctorFinding[] = (parsed as { findings?: DoctorFinding[] } | null)?.findings ?? []
  const out: PerFileCounts = {}
  for (const f of findings) {
    const code = String(f.code ?? '')
    if (!codes.has(code)) continue
    const file = f.location?.relPath ?? '(unknown)'
    const rule = code.slice('lint/'.length)
    const perFile = (out[file] ??= {})
    perFile[rule] = (perFile[rule] ?? 0) + 1
  }
  return out
}

export interface FileRuleDelta {
  file: string
  rule: string
  baseline: number
  current: number
}

/** Every (file, rule) above its baseline is a regression; below it, an improvement. */
export function compareReadable(
  current: PerFileCounts,
  baseline: PerFileCounts,
): { regressions: FileRuleDelta[]; improvements: FileRuleDelta[] } {
  const regressions: FileRuleDelta[] = []
  const improvements: FileRuleDelta[] = []
  const files = new Set([...Object.keys(current), ...Object.keys(baseline)])
  for (const file of [...files].sort()) {
    const now = current[file] ?? {}
    const base = baseline[file] ?? {}
    for (const rule of [...new Set([...Object.keys(now), ...Object.keys(base)])].sort()) {
      const c = now[rule] ?? 0
      const b = base[rule] ?? 0
      if (c > b) regressions.push({ file, rule, baseline: b, current: c })
      else if (c < b) improvements.push({ file, rule, baseline: b, current: c })
    }
  }
  return { regressions, improvements }
}

export interface ReadableBaseline {
  description: string
  total: number
  files: PerFileCounts
}

const DESCRIPTION =
  'Readable ratchet — `readable` style findings per (file, rule) may only DECREASE, and a file not listed ' +
  'here must have none. Checked by `bun scripts/check-pyreon-lint-ratchet.ts` (validate-fast + CI). ' +
  'Fix new findings with `bunx pyreon-lint --fix <file>` (the spacing rules are autofixable), then ' +
  'tighten with `bun scripts/check-readable-ratchet.ts --update`. Never raise a count to absorb a finding.'

export function buildReadableBaseline(current: PerFileCounts): ReadableBaseline {
  const files: PerFileCounts = {}
  let total = 0
  for (const file of Object.keys(current).sort()) {
    const rules = current[file] ?? {}
    const sorted: Record<string, number> = {}
    for (const rule of Object.keys(rules).sort()) {
      const n = rules[rule] ?? 0
      if (n <= 0) continue
      sorted[rule] = n
      total += n
    }
    if (Object.keys(sorted).length > 0) files[file] = sorted
  }
  return { description: DESCRIPTION, total, files }
}

/**
 * Serialise with ONE LINE PER FILE. A pretty-printed nested object puts every
 * rule on its own line, and two PRs that touch neighbouring files would then
 * conflict on shared closing braces; one line per file keeps their edits apart.
 */
export function serializeReadableBaseline(b: ReadableBaseline): string {
  const lines = Object.entries(b.files).map(
    ([file, rules]) => `    ${JSON.stringify(file)}: ${JSON.stringify(rules)}`,
  )
  return (
    `{\n  "description": ${JSON.stringify(b.description)},\n  "total": ${b.total},\n  "files": {\n` +
    `${lines.join(',\n')}\n  }\n}\n`
  )
}

export function readReadableBaseline(path: string = READABLE_BASELINE_PATH): ReadableBaseline | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as ReadableBaseline
}

/**
 * Gate the report against the committed baseline. Prints the result and
 * returns `true` when nothing regressed.
 */
export function checkReadable(parsed: unknown, path: string = READABLE_BASELINE_PATH): boolean {
  const baseline = readReadableBaseline(path)
  if (!baseline) {
    console.error(`✗ ${path} not found. Seed it with \`bun scripts/check-readable-ratchet.ts --update\`.`)
    return false
  }
  const current = countReadableFindings(parsed)
  const { regressions, improvements } = compareReadable(current, baseline.files)
  const total = Object.values(current).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
    0,
  )

  if (regressions.length > 0) {
    console.error('✗ Readable ratchet — these files gained readable findings:')
    for (const r of regressions.slice(0, 50)) {
      console.error(`    ${r.file}  ${r.rule}: ${r.baseline} → ${r.current}`)
    }
    if (regressions.length > 50) console.error(`    …and ${regressions.length - 50} more`)
    console.error(
      '\nFix them: `bunx pyreon-lint --fix <file>` clears the spacing findings; JSX depth and ternary',
    )
    console.error(
      'findings need a small refactor. A deliberate exception takes a reasoned opt-out:',
    )
    console.error('  // pyreon-lint-disable-next-line <rule> -- <why>')
    console.error('The baseline only moves DOWN; do not raise it to absorb new findings.')
    return false
  }
  if (improvements.length > 0) {
    const dropped = improvements.reduce((a, r) => a + (r.baseline - r.current), 0)
    console.log(
      `✓ Readable ratchet — ${total} finding(s) (baseline ${baseline.total}); ${dropped} fewer in ${improvements.length} (file, rule) pair(s).`,
    )
    console.log('  Tighten the baseline: `bun scripts/check-readable-ratchet.ts --update`')
  } else {
    console.log(`✓ Readable ratchet — ${total} finding(s), no file above its baseline.`)
  }
  return true
}

/**
 * `--update`: rewrite the baseline from the current report. Refuses to RAISE
 * any count unless `acceptMoves` is set (for renamed or moved files, whose
 * findings reappear under a new path). Returns `true` when it wrote the file.
 */
export function updateReadable(
  parsed: unknown,
  opts: { acceptMoves?: boolean; path?: string } = {},
): boolean {
  const path = opts.path ?? READABLE_BASELINE_PATH
  const current = countReadableFindings(parsed)
  const existing = readReadableBaseline(path)
  if (existing && !opts.acceptMoves) {
    const { regressions } = compareReadable(current, existing.files)
    if (regressions.length > 0) {
      console.error(
        `✗ Refusing to raise ${regressions.length} baseline count(s) — fix those findings first.`,
      )
      for (const r of regressions.slice(0, 20)) {
        console.error(`    ${r.file}  ${r.rule}: ${r.baseline} → ${r.current}`)
      }
      console.error('Only after renaming or moving files: re-run with --accept-moves.')
      return false
    }
  }
  const baseline = buildReadableBaseline(current)
  writeFileSync(path, serializeReadableBaseline(baseline))
  console.log(
    `[readable-ratchet] baseline written: ${baseline.total} finding(s) in ${Object.keys(baseline.files).length} file(s)`,
  )
  return true
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { runPyreonLintJson } = await import('./check-pyreon-lint-ratchet')
  const parsed = runPyreonLintJson()
  if (args.includes('--update')) {
    process.exit(updateReadable(parsed, { acceptMoves: args.includes('--accept-moves') }) ? 0 : 1)
  }
  process.exit(checkReadable(parsed) ? 0 : 1)
}

if (import.meta.main) await main()
