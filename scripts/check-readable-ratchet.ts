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
 *   - fixing findings always passes; an ordinary PR does not touch the baseline,
 *     and a baseline looser than the tree is harmless. `--update` only tightens
 *     (whoever removes findings may run it in the same PR: one line per file,
 *     no shared total line, so it conflicts with nothing unrelated).
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
 *   bun scripts/check-readable-ratchet.ts --update --allow-raise
 *        # only for (a) renamed or moved files, whose findings reappear under
 *        # a new path, and (b) after merging main into the PR that FIRST adds
 *        # this gate, to absorb code that landed before the gate existed
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

/**
 * The committed file. No recorded `total`, no file count, no timestamp: any
 * line that every change rewrites is a line every open pull request conflicts
 * on. The only lines are the static description and one line per file.
 */
export interface ReadableBaseline {
  description: string
  files: PerFileCounts
}

/** The sum of every count, derived when printing instead of recorded. */
export const baselineTotal = (files: PerFileCounts): number =>
  Object.values(files).reduce((sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0), 0)

const DESCRIPTION =
  'Readable ratchet — `readable` style findings per (file, rule) may only DECREASE, and a file not listed ' +
  'here must have none. Checked by `bun scripts/check-pyreon-lint-ratchet.ts` (validate-fast + CI). ' +
  'Fix new findings with `bunx pyreon-lint --fix <file>` (the spacing rules are autofixable). An ordinary PR ' +
  'does not edit this file; `bun scripts/check-readable-ratchet.ts --update` only tightens. Raising needs ' +
  '`--allow-raise` and is for a file that predates the ratchet. The file is generated: never edit or merge it by hand.'

export function buildReadableBaseline(
  current: PerFileCounts,
  description: string = DESCRIPTION,
): ReadableBaseline {
  const files: PerFileCounts = {}
  for (const file of Object.keys(current).sort()) {
    const rules = current[file] ?? {}
    const sorted: Record<string, number> = {}
    for (const rule of Object.keys(rules).sort()) {
      const n = rules[rule] ?? 0
      if (n <= 0) continue
      sorted[rule] = n
    }
    if (Object.keys(sorted).length > 0) files[file] = sorted
  }

  return { description, files }
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
    `{\n  "description": ${JSON.stringify(b.description)},\n  "files": {\n` +
    `${lines.join(',\n')}\n  }\n}\n`
  )
}

export function readReadableBaseline(path: string = READABLE_BASELINE_PATH): ReadableBaseline | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as ReadableBaseline
}

/**
 * Why a per-file baseline's text is not what `--update` writes. Empty when it is.
 *
 * The text must be byte-identical to the generator's serialisation of its own
 * parsed content: `generator(parse(file)) === file`. That one rule catches
 * everything `JSON.parse` hides: a file listed twice after a merge (the later
 * line wins silently), entries out of order, a hand edit or reformat, and a
 * reintroduced `total` (or any other key) that the generator does not write.
 * Counts must be positive integers. `description`, when given, is the static
 * text the ratchet owns.
 */
export function perFileBaselineProblems(text: string, description?: string): string[] {
  let parsed: ReadableBaseline
  try {
    parsed = JSON.parse(text) as ReadableBaseline
  } catch (error) {
    return [`it is not valid JSON (${(error as Error).message})`]
  }
  const files = parsed?.files
  if (files === null || typeof files !== 'object' || Array.isArray(files)) return ['it has no `files` object']
  const problems: string[] = []
  for (const [file, rules] of Object.entries(files)) {
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) {
      problems.push(`entry ${JSON.stringify(file)} is not an object of counts`)
      continue
    }
    for (const [rule, n] of Object.entries(rules)) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
        problems.push(`entry ${JSON.stringify(`${file} ${rule}`)} is ${JSON.stringify(n)}, not a positive count`)
      }
    }
  }
  if (problems.length > 0) return problems
  const canonical = serializeReadableBaseline(buildReadableBaseline(files, description ?? parsed.description))
  if (canonical !== text) {
    problems.push(
      'its text is not what the generator writes for these entries (a duplicated file line, entries out of order, a recorded `total`, an edited description, or a hand edit)',
    )
  }

  return problems
}

/** How a per-file ratchet names itself in its messages. */
export interface PerFileRatchet {
  /** `Readable ratchet` / `Readable oxlint ratchet`. */
  label: string
  /** Baseline description written by `--update`. */
  description: string
  /** The command that rewrites this baseline. */
  updateCommand: string
  /** Lines telling the author how to clear a new finding. */
  fixHint: string[]
}

const PYREON_RATCHET: PerFileRatchet = {
  label: 'Readable ratchet',
  description: DESCRIPTION,
  updateCommand: 'bun scripts/check-readable-ratchet.ts --update',
  fixHint: [
    'Fix them: `bunx pyreon-lint --fix <file>` clears the spacing findings; JSX depth and ternary',
    'findings need a small refactor. A deliberate exception takes a reasoned opt-out:',
    '  // pyreon-lint-disable-next-line <rule> -- <why>',
  ],
}

/** Gate per-file counts against a committed baseline. Prints the result; `true` when nothing regressed. */
export function checkPerFile(current: PerFileCounts, path: string, r: PerFileRatchet): boolean {
  if (!existsSync(path)) {
    console.error(`✗ ${path} not found. Seed it with \`${r.updateCommand}\`.`)

    return false
  }
  const problems = perFileBaselineProblems(readFileSync(path, 'utf8'), r.description)
  if (problems.length > 0) {
    console.error(`✗ ${path} is not a file its generator wrote:`)
    for (const problem of problems.slice(0, 10)) console.error(`    ${problem}`)
    if (problems.length > 10) console.error(`    …and ${problems.length - 10} more`)
    console.error(
      `It is generated. Never merge or edit it by hand: after merging the default branch, regenerate it with \`${r.updateCommand}\`.`,
    )

    return false
  }
  const baseline = readReadableBaseline(path) as ReadableBaseline
  const { regressions, improvements } = compareReadable(current, baseline.files)
  const total = baselineTotal(current)

  if (regressions.length > 0) {
    console.error(`✗ ${r.label} — these files gained findings:`)
    for (const x of regressions.slice(0, 50)) {
      console.error(`    ${x.file}  ${x.rule}: ${x.baseline} → ${x.current}`)
    }
    if (regressions.length > 50) console.error(`    …and ${regressions.length - 50} more`)
    console.error('')
    for (const line of r.fixHint) console.error(line)
    console.error('The baseline only moves DOWN; do not raise it to absorb new findings.')
    console.error('An ordinary PR does not edit the baseline file; fix the findings in your code instead.')

    return false
  }
  if (improvements.length > 0) {
    const dropped = improvements.reduce((a, x) => a + (x.baseline - x.current), 0)
    console.log(
      `✓ ${r.label} — ${total} finding(s) (baseline ${baselineTotal(baseline.files)}); ${dropped} fewer in ${improvements.length} (file, rule) pair(s).`,
    )
    console.log(`  Optional: tighten the baseline with \`${r.updateCommand}\` (a PR need not; a looser baseline is harmless).`)
  } else {
    console.log(`✓ ${r.label} — ${total} finding(s), no file above its baseline.`)
  }

  return true
}

/**
 * `--update`: rewrite a baseline from current counts. Refuses to RAISE any
 * count unless `allowRaise` is set — for renamed or moved files, whose
 * findings reappear under a new path, and for absorbing code that landed on
 * main before the gate existed. Returns `true` when it wrote the file.
 */
export function updatePerFile(
  current: PerFileCounts,
  path: string,
  r: PerFileRatchet,
  allowRaise = false,
): boolean {
  const existing = readReadableBaseline(path)
  if (existing && !allowRaise) {
    const { regressions } = compareReadable(current, existing.files)
    if (regressions.length > 0) {
      console.error(
        `✗ Refusing to raise ${regressions.length} baseline count(s) — fix those findings first.`,
      )
      for (const x of regressions.slice(0, 20)) {
        console.error(`    ${x.file}  ${x.rule}: ${x.baseline} → ${x.current}`)
      }
      console.error('Only after renaming or moving files: re-run with --allow-raise. Never to absorb a new finding.')

      return false
    }
  }
  const baseline = buildReadableBaseline(current, r.description)
  writeFileSync(path, serializeReadableBaseline(baseline))
  console.log(
    `[${r.label}] baseline written: ${baselineTotal(baseline.files)} finding(s) in ${Object.keys(baseline.files).length} file(s)`,
  )

  return true
}

/** Gate a `doctor --only lint --json` report against `readable-baseline.json`. */
export function checkReadable(parsed: unknown, path: string = READABLE_BASELINE_PATH): boolean {
  return checkPerFile(countReadableFindings(parsed), path, PYREON_RATCHET)
}

/** `--update` for `readable-baseline.json`. */
export function updateReadable(
  parsed: unknown,
  opts: { allowRaise?: boolean; path?: string } = {},
): boolean {
  return updatePerFile(
    countReadableFindings(parsed),
    opts.path ?? READABLE_BASELINE_PATH,
    PYREON_RATCHET,
    opts.allowRaise ?? false,
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { runPyreonLintJson } = await import('./check-pyreon-lint-ratchet')
  const parsed = runPyreonLintJson()
  if (args.includes('--update')) {
    process.exit(updateReadable(parsed, { allowRaise: args.includes('--allow-raise') }) ? 0 : 1)
  }
  process.exit(checkReadable(parsed) ? 0 : 1)
}

if (import.meta.main) await main()
