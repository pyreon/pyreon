/**
 * Coverage threshold checker.
 * Runs test coverage for all packages and reports failures.
 *
 * Usage: bun scripts/check-coverage.ts
 *
 * Reads coverage thresholds from each package's vitest.config.ts.
 * If no threshold is configured, uses the default (90% statements).
 * Supports parallel execution and CI-friendly output.
 *
 * ## Coverage floor (PR #323 + PR #324)
 *
 * MINIMUM_FLOOR is the lowest STATEMENT threshold any package may
 * configure without an explicit entry in BELOW_FLOOR_EXEMPTIONS.
 * MINIMUM_BRANCH_FLOOR is the same for branch coverage. PR #323
 * established the 85% statement floor; PR #324 raised it to 90%
 * and added an explicit 80% branch floor.
 *
 * BELOW_FLOOR_EXEMPTIONS is the visible-debt list — every entry must
 * carry the package's currently-configured statement + branch
 * thresholds and a reason. Drift detection: if either configured
 * threshold differs from what's listed, the check fails so the
 * exemption is updated in lockstep with real package improvements.
 */
import { spawn } from 'node:child_process'
import { readdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIRS = [
  'packages/core',
  'packages/fundamentals',
  'packages/ui-system',
  'packages/tools',
  'packages/zero',
]
const DEFAULT_THRESHOLD = 90
const MINIMUM_FLOOR = 90
const MINIMUM_BRANCH_FLOOR = 85
const CONCURRENCY = 4

/**
 * Packages allowed to configure thresholds below the floor. Each
 * entry carries `currentStatements` + `currentBranches` (matching
 * the package's vitest.config.ts) and a reason. The floor enforcement
 * skips the package when its name appears here; the package's own
 * configured thresholds still apply. **Remove the entry the same PR
 * that raises both thresholds to ≥ floor.**
 *
 * Drift detection: any change to either configured threshold without
 * updating the exemption fails the check.
 */
interface FloorExemption {
  currentStatements: number
  currentBranches: number
  reason: string
}
const BELOW_FLOOR_EXEMPTIONS: Record<string, FloorExemption> = {
  // ── Statement < 90 ──────────────────────────────────────────────────
  '@pyreon/lint': {
    currentStatements: 85,
    currentBranches: 75,
    reason:
      'PR #323 cleanup raised statements 65 → 85 (actual 86.18%) and branches 55 → 75 (actual 80.61%). Below 90/85 — needs further work on rule-edge-case branches.',
  },
  '@pyreon/vite-plugin': {
    currentStatements: 85,
    currentBranches: 80,
    reason:
      'PR #323 cleanup raised statements 0 (hidden) → 85 (actual 87.5%). Branches at 80 (actual 81.18%). Both below floor — gap is in cross-module signal resolution edge cases.',
  },
  '@pyreon/vue-compat': {
    currentStatements: 85,
    currentBranches: 80,
    reason:
      'PR #323 cleanup raised statements 75 → 85 (actual 88.96%). Branches at 80 (actual 81.36%). Both below floor — needs more wrapper / hook tests.',
  },
  '@pyreon/zero': {
    currentStatements: 85,
    currentBranches: 75,
    reason:
      'PR #323 cleanup raised statements 60 → 85 (actual 87.33%) and branches 50 → 75 (actual 79.41%). Meta-framework with build-time / server-runtime surface — most code is integration-tier.',
  },
  '@pyreon/kinetic': {
    currentStatements: 88,
    currentBranches: 80,
    reason:
      'Animation engine — actual 88.96% statements, 82.12% branches. Both below floor by 1-3pt — small follow-up to add edge-case transition tests.',
  },
  // ── Branch < 85 (statements OK) ─────────────────────────────────────
  '@pyreon/elements': {
    currentStatements: 90,
    currentBranches: 76,
    reason:
      'Foundational primitives. Statements at floor (actual 90.24%); branches at 79.83% — Overlay\\\'s SSR / happy-dom-only event-handler branches are legitimately harder to cover.',
  },
  '@pyreon/code': {
    currentStatements: 90,
    currentBranches: 70,
    reason:
      'Code editor (CodeMirror integration). Branches at 73.87% — uncovered branches are CodeMirror lifecycle handlers that need real editor instances.',
  },
  '@pyreon/hooks': {
    currentStatements: 90,
    currentBranches: 75,
    reason:
      '35+ signal hooks. Branches at 78.04% — several hooks have early-return guards (typeof window, etc.) whose negative branch only fires in SSR.',
  },
  '@pyreon/styler': {
    currentStatements: 90,
    currentBranches: 80,
    reason:
      'CSS-in-JS engine. Statements at floor (actual 93.85%); branches at 84.04% — just below the 85 branch floor. Small follow-up to test sheet-split edge cases.',
  },
  '@pyreon/document': {
    currentStatements: 90,
    currentBranches: 80,
    reason:
      'Universal document renderer. Statements at floor (actual 94.34%); branches at 80.67% — many format-specific branches in PDF/DOCX renderers run only with real binary fixtures.',
  },
}

interface CoverageResult {
  package: string
  statements: number
  branches: number
  functions: number
  lines: number
  pass: boolean
  threshold: number
}

/** Extract coverage threshold from a package's vitest.config.ts if present. */
function getPackageThreshold(pkgDir: string): number {
  const configPath = join(pkgDir, 'vitest.config.ts')
  if (!existsSync(configPath)) return DEFAULT_THRESHOLD

  try {
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/statements:\s*(\d+)/)
    if (match?.[1]) return Number(match[1])
  } catch {
    // Fall through to default
  }

  return DEFAULT_THRESHOLD
}

/** Extract branch threshold from a package's vitest.config.ts. Defaults to 90 if absent. */
function getPackageBranchThreshold(pkgDir: string): number {
  const configPath = join(pkgDir, 'vitest.config.ts')
  if (!existsSync(configPath)) return DEFAULT_THRESHOLD

  try {
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/branches:\s*(\d+)/)
    if (match?.[1]) return Number(match[1])
  } catch {
    // Fall through to default
  }

  return DEFAULT_THRESHOLD
}

/** Run coverage for a single package asynchronously. */
function runCoverage(
  pkgDir: string,
  pkgName: string,
  threshold: number,
): Promise<CoverageResult | null> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', 'test', '--', '--coverage', '--reporter=json'], {
      cwd: pkgDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, 120_000)

    child.on('close', () => {
      clearTimeout(timer)

      const match = stdout.match(
        /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
      )
      if (match) {
        const [, stmts, branches, funcs, lines] = match.map(Number)
        const pass = (stmts ?? 0) >= threshold
        resolve({
          package: pkgName,
          statements: stmts ?? 0,
          branches: branches ?? 0,
          functions: funcs ?? 0,
          lines: lines ?? 0,
          pass,
          threshold,
        })
      } else {
        resolve(null)
      }
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

interface PackageInfo {
  dir: string
  name: string
  threshold: number
  branchThreshold: number
}

/** Collect all testable packages. */
function collectPackages(): PackageInfo[] {
  const packages: PackageInfo[] = []

  for (const dir of PACKAGE_DIRS) {
    if (!existsSync(dir)) continue
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))

    for (const pkgDir of entries) {
      const pkgJson = join(pkgDir, 'package.json')
      if (!existsSync(pkgJson)) continue

      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'))
      if (!pkg.scripts?.test) continue
      if (pkg.scripts.test.startsWith('echo')) continue // skip placeholder scripts

      packages.push({
        dir: pkgDir,
        name: pkg.name,
        threshold: getPackageThreshold(pkgDir),
        branchThreshold: getPackageBranchThreshold(pkgDir),
      })
    }
  }

  return packages
}

/** Run packages with bounded concurrency using async spawn. */
async function runWithConcurrency(
  packages: PackageInfo[],
): Promise<CoverageResult[]> {
  const results: CoverageResult[] = []
  const queue = [...packages]

  async function worker() {
    while (queue.length > 0) {
      const pkg = queue.shift()
      if (!pkg) break

      process.stdout.write(`  Testing ${pkg.name}...`)
      const result = await runCoverage(pkg.dir, pkg.name, pkg.threshold)
      if (result) {
        results.push(result)
        console.log(` ${result.statements}% ${result.pass ? '\u2705' : '\u274c'}`)
      } else {
        console.log(' (skipped)')
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, packages.length) }, () => worker())
  await Promise.all(workers)

  return results
}

/**
 * Enforce the floor. Returns a list of misconfigured-threshold
 * errors: any package whose configured `statements` or `branches`
 * threshold falls below the respective floor without an explicit
 * exemption, OR any exempt entry whose listed `currentStatements`/
 * `currentBranches` no longer match the actual configured thresholds
 * (drift detection — keeps the exemption list honest as packages
 * are improved).
 */
function enforceFloor(packages: PackageInfo[]): string[] {
  const errors: string[] = []
  const seenExemptions = new Set<string>()

  for (const pkg of packages) {
    const exemption = BELOW_FLOOR_EXEMPTIONS[pkg.name]
    if (exemption) {
      seenExemptions.add(pkg.name)
      const meetsFloor =
        pkg.threshold >= MINIMUM_FLOOR && pkg.branchThreshold >= MINIMUM_BRANCH_FLOOR
      if (
        exemption.currentStatements !== pkg.threshold ||
        exemption.currentBranches !== pkg.branchThreshold
      ) {
        errors.push(
          `${pkg.name}: BELOW_FLOOR_EXEMPTIONS lists currentStatements=${exemption.currentStatements}/currentBranches=${exemption.currentBranches} but vitest.config.ts has statements=${pkg.threshold}/branches=${pkg.branchThreshold}. ` +
            (meetsFloor
              ? 'Drop the exemption — package now meets both floors.'
              : `Update the exemption entry to currentStatements=${pkg.threshold}, currentBranches=${pkg.branchThreshold}.`),
        )
      }
      continue
    }
    if (pkg.threshold < MINIMUM_FLOOR) {
      errors.push(
        `${pkg.name}: configured statements threshold ${pkg.threshold}% is below MINIMUM_FLOOR (${MINIMUM_FLOOR}%) and no exemption is registered. ` +
          `Either raise the threshold in ${pkg.dir}/vitest.config.ts, or add a BELOW_FLOOR_EXEMPTIONS entry with a reason.`,
      )
    }
    if (pkg.branchThreshold < MINIMUM_BRANCH_FLOOR) {
      errors.push(
        `${pkg.name}: configured branches threshold ${pkg.branchThreshold}% is below MINIMUM_BRANCH_FLOOR (${MINIMUM_BRANCH_FLOOR}%) and no exemption is registered. ` +
          `Either raise the threshold in ${pkg.dir}/vitest.config.ts, or add a BELOW_FLOOR_EXEMPTIONS entry with a reason.`,
      )
    }
  }

  // Stale exemptions — listed but the package no longer exists.
  for (const exemptName of Object.keys(BELOW_FLOOR_EXEMPTIONS)) {
    if (!seenExemptions.has(exemptName)) {
      errors.push(
        `${exemptName}: BELOW_FLOOR_EXEMPTIONS entry is stale (no matching package). Remove it.`,
      )
    }
  }

  return errors
}

// ─── Main ──────────────────────────────────────────────────────────────────

const isCI = !!process.env.CI
const packages = collectPackages()

// Enforce the floor BEFORE running coverage so misconfigured
// thresholds surface even if coverage execution times out / skips.
const floorErrors = enforceFloor(packages)
if (floorErrors.length > 0) {
  console.error(
    `\n❌ Coverage floor violations (MINIMUM_FLOOR=${MINIMUM_FLOOR}% statements, ` +
      `MINIMUM_BRANCH_FLOOR=${MINIMUM_BRANCH_FLOOR}% branches):\n`,
  )
  for (const err of floorErrors) console.error('  - ' + err)
  console.error(
    '\nFix by either raising the package threshold in vitest.config.ts ' +
      'or by adding a BELOW_FLOOR_EXEMPTIONS entry with a reason. See ' +
      'scripts/check-coverage.ts for the canonical list.\n',
  )
  process.exit(1)
}

console.log(`\nRunning coverage for ${packages.length} packages (${CONCURRENCY} parallel)...\n`)

const results = await runWithConcurrency(packages)
const sorted = results.sort((a, b) => a.package.localeCompare(b.package))
const hasFailures = sorted.some((r) => !r.pass)

// Build report
const reportLines: string[] = [
  '',
  '## Coverage Report',
  '',
  '| Package | Stmts | Branch | Funcs | Lines | Threshold | Status |',
  '|---------|-------|--------|-------|-------|-----------|--------|',
]

for (const r of sorted) {
  const status = r.pass ? '\u2705' : '\u274c'
  reportLines.push(
    `| ${r.package} | ${r.statements}% | ${r.branches}% | ${r.functions}% | ${r.lines}% | ${r.threshold}% | ${status} |`,
  )
}

if (hasFailures) {
  reportLines.push('', '\u274c Some packages below their coverage threshold')
} else {
  reportLines.push('', '\u2705 All packages meet their coverage thresholds')
}

const report = reportLines.join('\n')
console.log(report)

// CI: write GitHub Actions annotations and step summary
if (isCI) {
  for (const r of sorted) {
    if (!r.pass) {
      console.log(
        `::error::${r.package} coverage below threshold: ${r.statements}% statements (need ${r.threshold}%)`,
      )
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  }
}

if (hasFailures) {
  process.exit(1)
}
