#!/usr/bin/env bun
/**
 * CI gate: enforce `pyreon/require-browser-smoke-test` across the monorepo.
 *
 * Why a dedicated script (not `pyreon-lint .`)?
 * The full pyreon-lint sweep currently surfaces ~1820 pre-existing rule
 * violations across other rules (separate cleanup work). Running the full
 * sweep in CI would block on noise unrelated to T1.1's smoke-test contract.
 *
 * This script imports the rule directly, runs it against every browser-
 * categorized package's `src/index.ts`, and exits non-zero if any package
 * is missing a `*.browser.test.{ts,tsx}` file.
 *
 * Self-expiring exemptions:
 *   If a package listed in PHASE_5_PENDING_PACKAGES has now acquired
 *   a `*.browser.test.*` file, the script ERRORS and tells you to
 *   remove the exemption. Prevents the exemption list from silently
 *   accepting coverage that should be required going forward.
 *
 * When PHASE_5_PENDING_PACKAGES reaches `[]`, delete this script in favor
 * of `pyreon-lint --preset recommended .` (blocked today only by the
 * broader rule-baseline cleanup).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintFile } from '../packages/tools/lint/src/runner'
import { allRules } from '../packages/tools/lint/src/rules/index'
import type { LintConfig } from '../packages/tools/lint/src/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

// Packages temporarily exempt because their browser smoke coverage lands
// in T1.1 Phase 5 (ui-system + compat rollout). Each entry MUST be
// removed when its smoke suite lands — the self-expiring check below
// errors if a listed package now has a *.browser.test.* file so the
// removal can't be forgotten.
const PHASE_5_PENDING_PACKAGES = [
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

// Walk packages/ to find every per-package src/index.ts. Bounded depth
// so deeply-nested test fixtures or similar don't balloon the search.
function findIndexFiles(): string[] {
  const result: string[] = []
  function walk(dir: string, depth = 0): void {
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

// Check: does an exempt package now have a *.browser.test.* file? If
// yes, the exemption is stale — flag so the developer removes it.
function findStaleExemptions(): string[] {
  const stale: string[] = []
  function hasBrowserTest(dir: string): boolean {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false
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
      if (isDir) {
        if (hasBrowserTest(full)) return true
        continue
      }
      if (/\.browser\.test\.(?:ts|tsx)$/.test(name)) return true
    }
    return false
  }
  for (const exempt of PHASE_5_PENDING_PACKAGES) {
    const pkgDir = path.join(repoRoot, exempt)
    if (!existsSync(pkgDir)) continue
    if (hasBrowserTest(pkgDir)) stale.push(exempt)
  }
  return stale
}

const config: LintConfig = {
  rules: {
    // Disable every rule except the one we're enforcing.
    ...Object.fromEntries(allRules.map((r) => [r.meta.id, 'off' as const])),
    'pyreon/require-browser-smoke-test': [
      'error',
      { exemptPaths: PHASE_5_PENDING_PACKAGES },
    ] as const,
  },
}

// ── Step 1: missing-coverage errors ──────────────────────────────────────
let missingCount = 0
const indexFiles = findIndexFiles()

for (const filePath of indexFiles) {
  const source = readFileSync(filePath, 'utf8')
  const result = lintFile(filePath, source, allRules, config)
  for (const diag of result.diagnostics) {
    if (diag.ruleId !== 'pyreon/require-browser-smoke-test') continue
    missingCount++
    const rel = path.relative(repoRoot, filePath)
    // eslint-disable-next-line no-console
    console.error(`✗ ${rel}\n  ${diag.message}\n`)
  }
}

// ── Step 2: self-expiring-exemption errors ──────────────────────────────
const stale = findStaleExemptions()
if (stale.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `\n✗ Stale exemption(s) in PHASE_5_PENDING_PACKAGES (scripts/check-browser-smoke.ts):\n`,
  )
  for (const p of stale) {
    // eslint-disable-next-line no-console
    console.error(`  - ${p} now has a *.browser.test.* file — remove from PHASE_5_PENDING_PACKAGES`)
  }
}

// ── Exit ────────────────────────────────────────────────────────────────
if (missingCount > 0 || stale.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `\n${missingCount} missing-coverage error(s), ${stale.length} stale-exemption error(s).`,
  )
  process.exit(1)
}

// eslint-disable-next-line no-console
console.log(
  `✓ All ${indexFiles.length} package index files checked. Every browser-categorized package has at least one .browser.test.* file. ${PHASE_5_PENDING_PACKAGES.length} package(s) currently exempt (Phase 5 pending).`,
)
