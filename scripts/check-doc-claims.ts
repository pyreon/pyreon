#!/usr/bin/env bun
/**
 * check-doc-claims — assert numeric claims in human-written docs
 * stay in sync with the underlying code.
 *
 * Catches the recurring drift mode where a count is hand-quoted in 3-5
 * places ("34 signal-based hooks…") and only one gets bumped when the
 * code changes. Audit caught the hooks README claiming 16 vs actual 34
 * — drift that lasted long enough to ship to users.
 *
 * **This script is a thin CLI wrapper.** The pure gate logic lives in
 * `@pyreon/cli` at `packages/tools/cli/src/doctor/gates/doc-claims.ts`
 * so `pyreon doctor` can call it too. Don't add claim entries here —
 * add them to the gate's `checks[]` array.
 *
 * Run:
 *   bun run check-doc-claims          # exit non-zero if drift
 *   bun run check-doc-claims --json   # machine-readable
 */

import { resolve } from 'node:path'
import { runDocClaimsGate } from '../packages/tools/cli/src/doctor/gates/doc-claims'

const REPO_ROOT = resolve(import.meta.dir, '..')
const json = process.argv.includes('--json')

const result = await runDocClaimsGate({ cwd: REPO_ROOT })

if (json) {
  // Preserve the historical JSON shape ({ drifts: [...] }) for CI consumers.
  const drifts = result.findings.map((f) => ({
    check: f.code.replace(/^doc-claims\//, '').replace(/-(drift|hedged|pattern-miss|file-missing)$/, ''),
    file: f.location?.relPath ?? '',
    code: f.code,
    severity: f.severity,
    message: f.message,
  }))
  console.log(JSON.stringify({ drifts }, null, 2))
} else if (result.findings.length === 0) {
  console.log(`✓ All doc-claim numbers match the underlying source of truth.`)
  console.log(`  ${result.meta.scanned} claim site(s) checked.`)
} else {
  // Errors and warnings are reported SEPARATELY, because only errors fail the
  // gate (see the exit below).
  //
  // Everything used to print under one `✗ Found N doc-claim drift(s)` banner
  // regardless of severity. A warning-only run therefore looked exactly like a
  // failing one while exiting 0 — and the warnings that trigger it most often
  // are `pattern-miss`, raised when a claim's text was deliberately deleted or
  // rephrased, which nobody can "fix". A gate that prints ✗ forever for
  // something not actionable teaches people to skim past its output, and that
  // is precisely when it stops catching the drift it exists for.
  const errors = result.findings.filter((f) => f.severity === 'error')
  const warnings = result.findings.filter((f) => f.severity !== 'error')

  const render = (f: (typeof result.findings)[number], log: (s: string) => void) => {
    log(`  [${f.code}] ${f.location?.relPath ?? '(no file)'}`)
    log(`    ${f.message}`)
    if (f.fix) log(`    fix: ${f.fix}`)
    log('')
  }

  if (errors.length > 0) {
    console.error(`✗ Found ${errors.length} doc-claim drift(s):\n`)
    for (const f of errors) render(f, (s) => console.error(s))
  }

  if (warnings.length > 0) {
    // stdout, not stderr: this does not fail the run.
    console.log(
      `${errors.length > 0 ? '' : '✓ No doc-claim drift.\n'}` +
        `! ${warnings.length} advisory finding(s) — these do NOT fail the gate:\n`,
    )
    for (const f of warnings) render(f, (s) => console.log(s))
    console.log(
      `  A \`pattern-miss\` means a claim site no longer contains the text this\n` +
        `  gate looks for — usually because it was deleted or rephrased on purpose.\n` +
        `  Either restore the claim, or drop that entry from the gate's \`checks[]\`.\n`,
    )
  }

  if (errors.length === 0) {
    console.log(`  ${result.meta.scanned} claim site(s) checked, all matching.`)
  }
}

if (result.findings.some((f) => f.severity === 'error')) {
  process.exit(1)
}
