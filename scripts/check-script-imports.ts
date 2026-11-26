#!/usr/bin/env bun
/**
 * check-script-imports — every import in `scripts/` resolves, and every named
 * import exists.
 *
 * The repo's scripts (gates, benches, generators) are not a package, so
 * `bun run typecheck` (per package) never saw them. A script importing a
 * workspace export that was renamed or removed broke only when someone ran it:
 * `bench:loom` died on `detectPeerMismatch` after loom retired it, while every
 * gate stayed green (#4751 review).
 *
 * This typechecks `scripts/` (`scripts/tsconfig.json`) and fails on the
 * module-resolution / missing-export diagnostics, and on any diagnostic that
 * stops tsc from reporting them (syntax, config, a missing type library). The scripts carry other
 * type errors (bench code written against loosely typed competitor packages,
 * `exactOptionalPropertyTypes` drift); those are a separate clean-up and do
 * not decide whether a script can load.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** TS codes that mean "this import cannot load", not "this code is loosely typed". */
const IMPORT_CODES = new Set([
  2305, // Module has no exported member
  2307, // Cannot find module
  2614, // Module has no exported member (did you mean to use import x from)
  2724, // has no exported member named X. Did you mean Y?
  2459, // Module declares X locally, but it is not exported
  2460, // Module declares X locally, but it is exported as Y
  2613, // Module has no default export
])

/**
 * Diagnostics that make tsc stop reporting import errors at all: a syntax
 * error (TS1xxx) anywhere, a bad config or option (TS5xxx / TS6xxx), or a
 * missing type library (TS2688). With one of these, tsc prints only that and
 * the import check would pass on silence, so they block too.
 */
function blindsTheCheck(code: number): boolean {
  return (code >= 1000 && code < 2000) || (code >= 5000 && code < 7000) || code === 2688
}

/**
 * Parse `file(line,col): error TS1234: message` lines (and file-less
 * `error TS1234:` lines) into the ones that fail the gate: the import class,
 * plus anything that blinds the check.
 */
export function importDiagnostics(tscOutput: string): string[] {
  const out: string[] = []
  for (const line of tscOutput.split('\n')) {
    const m = /error TS(\d+):/.exec(line)
    if (!m) continue
    const code = Number(m[1])
    if (IMPORT_CODES.has(code) || blindsTheCheck(code)) out.push(line.trim())
  }

  return out
}

if (import.meta.main) {
  const project = fileURLToPath(new URL('./tsconfig.json', import.meta.url))
  const r = spawnSync('bunx', ['tsc', '-p', project], { encoding: 'utf8' })
  const broken = importDiagnostics(`${r.stdout}\n${r.stderr}`)
  if (broken.length > 0) {
    console.error(`✗ check-script-imports — ${broken.length} diagnostic(s) in scripts/ that break or blind the import check:`)
    for (const b of broken) console.error(`  ${b}`)
    console.error('Fix the import (the export was renamed or removed), the syntax error or the config/type-library error; or delete the script if it is dead.')
    process.exit(1)
  }
  if (r.status !== 0 && !/error TS\d+/.test(`${r.stdout}${r.stderr}`)) {
    console.error(`✗ check-script-imports — tsc did not run: ${r.stderr || r.stdout}`)
    process.exit(1)
  }
  console.log('✓ check-script-imports — every import in scripts/ resolves')
}
