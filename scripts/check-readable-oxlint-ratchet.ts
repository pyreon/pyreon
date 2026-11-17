#!/usr/bin/env bun
/**
 * Readable oxlint ratchet — the oxlint half of the `readable` preset (function
 * length, complexity, nesting depth, parameters, file length, import
 * placement, braces) over this repository, frozen PER FILE: a file may not
 * gain a finding, and a file not in the baseline must have none.
 *
 * The rules come from `@pyreon/lint/oxlint/readable.json`, extended by
 * `scripts/oxlint-readable.jsonc`, which turns every other oxlint rule off (the
 * main `oxlint .` run owns those and stays at zero) and exempts the documented
 * hot paths from the size limits with a stated reason.
 *
 * Usage:
 *   bun run lint:readable                                  # show the findings
 *   bun scripts/check-readable-oxlint-ratchet.ts           # gate
 *   bun scripts/check-readable-oxlint-ratchet.ts --update  # rewrite (refuses to raise)
 *   bun scripts/check-readable-oxlint-ratchet.ts --update --allow-raise
 *        # only for renamed/moved files, or code that landed before the gate existed
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import {
  checkPerFile,
  type PerFileCounts,
  type PerFileRatchet,
  updatePerFile,
} from './check-readable-ratchet'

export const OXLINT_BASELINE_PATH = 'readable-oxlint-baseline.json'
export const OXLINT_READABLE_CONFIG = 'scripts/oxlint-readable.jsonc'

const RATCHET: PerFileRatchet = {
  label: 'Readable oxlint ratchet',
  description:
    'Readable oxlint ratchet — findings of `@pyreon/lint/oxlint/readable.json` (via scripts/oxlint-readable.jsonc) ' +
    'per (file, rule) may only DECREASE, and a file not listed here must have none. Checked by ' +
    '`bun scripts/check-readable-oxlint-ratchet.ts` (validate-fast + CI). Split the function, or fix with ' +
    '`bunx oxlint -c scripts/oxlint-readable.jsonc --fix <file>` for curly / newline-after-import / else-return; ' +
    'then tighten with `--update`. Never raise a count to absorb a finding.',
  updateCommand: 'bun scripts/check-readable-oxlint-ratchet.ts --update',
  fixHint: [
    'See them: `bun run lint:readable`. Braces, the blank line after imports and `else` after `return`',
    'fix with `bunx oxlint -c scripts/oxlint-readable.jsonc --fix <file>`; size, complexity and depth',
    'need the function split. A deliberate exception takes a reasoned disable at the top of the file:',
    '  /* oxlint-disable max-lines-per-function -- <why> */',
  ],
}

interface OxlintDiagnostic {
  code?: string
  filename?: string
}

/** Count oxlint `-f json` diagnostics per (file, rule). */
export function countOxlintFindings(parsed: unknown): PerFileCounts {
  const diags: OxlintDiagnostic[] = (parsed as { diagnostics?: OxlintDiagnostic[] } | null)?.diagnostics ?? []
  const out: PerFileCounts = {}
  for (const d of diags) {
    const file = d.filename ?? '(unknown)'
    const rule = d.code ?? 'unknown'
    const perFile = (out[file] ??= {})
    perFile[rule] = (perFile[rule] ?? 0) + 1
  }

  return out
}

export function runOxlintReadable(root = process.cwd()): unknown {
  const bin = join(root, 'node_modules', '.bin', 'oxlint')
  let out: string
  try {
    out = execFileSync(bin, ['-c', OXLINT_READABLE_CONFIG, '-f', 'json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (err) {
    // oxlint exits non-zero only on errors; readable rules are warnings, so a
    // non-zero exit means the run itself failed (bad config, crash).
    const e = err as { stdout?: string; stderr?: string }
    throw new Error(`[readable-oxlint-ratchet] oxlint failed: ${e.stderr ?? ''}${(e.stdout ?? '').slice(0, 500)}`)
  }

  return JSON.parse(out)
}

function main(): void {
  const args = process.argv.slice(2)
  const current = countOxlintFindings(runOxlintReadable())
  if (args.includes('--update')) {
    process.exit(updatePerFile(current, OXLINT_BASELINE_PATH, RATCHET, args.includes('--allow-raise')) ? 0 : 1)
  }
  process.exit(checkPerFile(current, OXLINT_BASELINE_PATH, RATCHET) ? 0 : 1)
}

if (import.meta.main) main()
