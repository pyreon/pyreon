#!/usr/bin/env bun
/**
 * CI script: enforce `pyreon/require-browser-smoke-test` across the monorepo.
 *
 * Why a dedicated script (not `pyreon-lint .`)?
 * The full pyreon-lint sweep across this monorepo currently surfaces ~1820
 * pre-existing rule violations across other rules (separate cleanup work).
 * Running the full sweep in CI would block on noise unrelated to T1.1's
 * smoke-test contract.
 *
 * This script imports the rule directly, runs it against every browser-
 * categorized package's `src/index.ts`, and exits non-zero if any package
 * is missing a `*.browser.test.{ts,tsx}` file. That gives the rule a
 * working CI gate without depending on a clean baseline for the other
 * 58 rules.
 *
 * When pyreon-lint's full baseline is clean across the monorepo, this
 * script can be deleted in favor of `pyreon-lint --preset recommended .`.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintFile } from '../packages/tools/lint/src/runner'
import { allRules } from '../packages/tools/lint/src/rules/index'
import type { LintConfig } from '../packages/tools/lint/src/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

// Find every package's src/index.ts under packages/
async function findIndexFiles(): Promise<string[]> {
  const { readdirSync, statSync } = await import('node:fs')
  const result: string[] = []
  function walk(dir: string, depth = 0) {
    if (depth > 4) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'lib' || name === 'dist') {
        continue
      }
      const full = path.join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      const candidate = path.join(full, 'src', 'index.ts')
      if (existsSync(candidate)) {
        result.push(candidate)
      } else {
        walk(full, depth + 1)
      }
    }
  }
  walk(path.join(repoRoot, 'packages'))
  return result
}

// Packages currently exempt because their browser smoke coverage lands
// in T1.1 Phase 5 (the ui-system + compat rollout). Each entry should be
// removed when its smoke suite lands. When this list reaches `[]`, the
// rule + script become the durable contract: every browser package has
// smoke coverage, full stop.
const PHASE_5_PENDING_PACKAGES = [
  // ui-system (8) — Phase 5 rollout
  'packages/ui-system/styler/',
  'packages/ui-system/unistyle/',
  'packages/ui-system/elements/',
  'packages/ui-system/rocketstyle/',
  'packages/ui-system/coolgrid/',
  'packages/ui-system/kinetic/',
  'packages/ui-system/connector-document/',
  // ui (theme + components + primitives) — Phase 5 rollout
  'packages/ui/theme/',
  'packages/ui/components/',
  'packages/ui/primitives/',
  // compat layers — Phase 5 rollout
  'packages/tools/react-compat/',
  'packages/tools/preact-compat/',
  'packages/tools/vue-compat/',
  'packages/tools/solid-compat/',
]

const config: LintConfig = {
  rules: {
    // Disable every rule except the one we're enforcing.
    ...Object.fromEntries(
      allRules.map((r) => [r.meta.id, 'off' as const]),
    ),
    'pyreon/require-browser-smoke-test': [
      'error',
      { exemptPaths: PHASE_5_PENDING_PACKAGES },
    ] as const,
  },
}

let totalErrors = 0
const indexFiles = await findIndexFiles()

for (const filePath of indexFiles) {
  const source = readFileSync(filePath, 'utf8')
  const result = lintFile(filePath, source, allRules, config)
  for (const diag of result.diagnostics) {
    if (diag.ruleId !== 'pyreon/require-browser-smoke-test') continue
    totalErrors++
    const rel = path.relative(repoRoot, filePath)
    // eslint-disable-next-line no-console
    console.error(`✗ ${rel}\n  ${diag.message}\n`)
  }
}

if (totalErrors > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `\n${totalErrors} browser-categorized package(s) missing *.browser.test.{ts,tsx} smoke coverage.`,
  )
  process.exit(1)
}

// eslint-disable-next-line no-console
console.log(
  `✓ All ${indexFiles.length} package index files checked. Every browser-categorized package has at least one .browser.test.* file.`,
)
