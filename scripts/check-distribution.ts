#!/usr/bin/env bun
/**
 * check-distribution — bundle/distribution hygiene gate.
 *
 * Static invariants every published @pyreon/* package must hold:
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
 *  3. **No build report shipped.** `vl_rolldown_build` writes a bundle-
 *     analysis HTML treemap into `lib/analysis/`; a package publishing
 *     `lib` must exclude it (`"!lib/analysis"`), or every install
 *     downloads a report that is not package content (258 KB for charts).
 *
 * All three are enforced via the package's `files` field. The
 * gate ALSO simulates `npm pack --dry-run` for one representative
 * package to prove maps actually land in the tarball at publish time,
 * not just on paper.
 *
 * **This script is a thin CLI wrapper.** The pure gate logic lives in
 * `@pyreon/cli` at `packages/tools/cli/src/doctor/gates/distribution.ts`
 * so `pyreon doctor` can call it too. Don't add logic here — add it
 * to the gate.
 *
 * ONE exception, checked here and not in the gate: the PUBLISH-STRIP
 * invariant (`orphanedByPublishStrip`). `scripts/publish.ts` rewrites
 * each manifest before `npm publish` — stripping the `bun` export
 * condition and, for a `lib/`-building package, `src` from `files` — so
 * a workspace `files` array can be correct while the published tarball
 * is missing something the package needs. Gating that requires the
 * repo's own publish transform, which a consumer's `pyreon doctor` has
 * no equivalent of (there is no publish.ts in their repo), so it lives
 * in this repo-scoped wrapper and imports the SAME functions publish.ts
 * uses — the gate and the publisher cannot drift.
 *
 * Run:
 *   bun run check-distribution         # report violations, exit non-zero
 *   bun run check-distribution --json  # machine-readable output
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { runDistributionGate } from '../packages/tools/cli/src/doctor/gates/distribution'
import { orphanedByPublishStrip } from './strip-bun-condition'

const REPO_ROOT = resolve(import.meta.dir, '..')
const json = process.argv.includes('--json')

const result = await runDistributionGate({ cwd: REPO_ROOT })

// Publish-strip invariant — see the docblock. Walks the same
// `packages/<category>/<pkg>` layout the gate does.
const packagesRoot = join(REPO_ROOT, 'packages')
for (const cat of readdirSync(packagesRoot)) {
  let pkgs: string[]
  try {
    pkgs = readdirSync(join(packagesRoot, cat))
  } catch {
    continue
  }
  for (const pkg of pkgs) {
    const pjPath = join(packagesRoot, cat, pkg, 'package.json')
    let pj: Record<string, unknown>
    try {
      pj = JSON.parse(readFileSync(pjPath, 'utf8'))
    } catch {
      continue
    }
    if (pj.private || typeof pj.name !== 'string') continue
    for (const orphan of orphanedByPublishStrip(pj)) {
      result.findings.push({
        category: 'architecture',
        severity: 'error',
        code: 'distribution/orphaned-by-publish-strip',
        gate: 'distribution',
        message:
          `${pj.name} needs \`${orphan}\` in its tarball, but scripts/publish.ts ` +
          `strips that directory from \`files\` at publish time — the published ` +
          `package would not contain it. Either stop stripping it (see ` +
          `\`packageBuildsToLib\` in scripts/strip-bun-condition.ts) or stop ` +
          `depending on it post-publish.`,
        location: { path: pjPath, relPath: relative(REPO_ROOT, pjPath) },
        fix: `Make scripts/publish.ts preserve \`${orphan}\` for ${pj.name}`,
      })
    }
  }
}

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
  console.log(`  • All \`repository.url\` fields are in npm's canonical \`git+…\` form`)
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
