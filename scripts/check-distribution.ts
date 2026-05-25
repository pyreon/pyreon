#!/usr/bin/env bun
/**
 * check-distribution — bundle/distribution hygiene gate.
 *
 * Two static invariants every published @pyreon/* package must hold:
 *
 *  1. **`sideEffects` field is set.** Required for bundlers (Vite,
 *     Webpack, Rollup, esbuild) to tree-shake unused exports out of
 *     the consumer's bundle. A missing `sideEffects` field forces the
 *     bundler to assume every imported module has side effects, which
 *     defeats tree-shaking even for pure library code.
 *
 *  2. **Source maps shipped (NOT excluded from `files`).** Maps make
 *     framework stack traces readable for users — every major JS
 *     library (React, Vue, Solid, Preact, Svelte, TanStack) ships
 *     them. Bundlers strip maps from production builds automatically;
 *     they never reach end users. Excluding them ships minified
 *     framework code with no way to debug.
 *
 * Both invariants are enforced via the package's `files` field. The
 * gate ALSO simulates `npm pack --dry-run` for one representative
 * package to prove maps actually land in the tarball at publish time,
 * not just on paper.
 *
 * **This script is a thin CLI wrapper.** The pure gate logic lives in
 * `@pyreon/cli` at `packages/tools/cli/src/doctor/gates/distribution.ts`
 * so `pyreon doctor` can call it too. Don't add logic here — add it
 * to the gate.
 *
 * Run:
 *   bun run check-distribution         # report violations, exit non-zero
 *   bun run check-distribution --json  # machine-readable output
 */

import { resolve } from 'node:path'
import { runDistributionGate } from '../packages/tools/cli/src/doctor/gates/distribution'

const REPO_ROOT = resolve(import.meta.dir, '..')
const json = process.argv.includes('--json')

const result = await runDistributionGate({ cwd: REPO_ROOT })
const errorCount = result.findings.filter((f) => f.severity === 'error').length

if (json) {
  // Preserve the historical JSON shape for backward compat with any
  // CI consumers parsing the output.
  const violations = result.findings.map((f) => ({
    package: f.message.split(' ')[0] ?? '',
    rule: f.code.replace(/^distribution\//, ''),
    detail: f.message,
  }))
  console.log(
    JSON.stringify({ violations, totalPackages: result.meta.scanned ?? 0 }, null, 2),
  )
} else if (result.findings.length === 0) {
  console.log(
    `✓ Distribution gate clean. ${result.meta.scanned} published package(s) checked.`,
  )
  console.log(`  • All have \`sideEffects\` declared`)
  console.log(`  • None exclude \`lib/**/*.map\` from the published tarball`)
  console.log(`  • npm pack --dry-run probe: .map files present in tarball`)
} else {
  console.error(`✗ Distribution gate found ${result.findings.length} violation(s):\n`)
  for (const f of result.findings) {
    console.error(`  [${f.code.replace(/^distribution\//, '')}] ${f.message.split(' ')[0]}`)
    console.error(`    ${f.message}\n`)
  }
}

if (errorCount > 0) {
  process.exit(1)
}
