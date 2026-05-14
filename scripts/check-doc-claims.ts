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
  console.error(`✗ Found ${result.findings.length} doc-claim drift(s):\n`)
  for (const f of result.findings) {
    console.error(`  [${f.code}] ${f.location?.relPath ?? '(no file)'}`)
    console.error(`    ${f.message}`)
    if (f.fix) console.error(`    fix: ${f.fix}`)
    console.error('')
  }
}

if (result.findings.some((f) => f.severity === 'error')) {
  process.exit(1)
}
