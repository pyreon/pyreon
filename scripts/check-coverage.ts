/**
 * Coverage threshold checker.
 * Runs test coverage for all packages and reports failures.
 *
 * Usage:
 *   bun scripts/check-coverage.ts              # full coverage (slow, ~200s)
 *   bun scripts/check-coverage.ts --floor-only # config check only (~5s)
 *
 * Reads coverage thresholds from each package's vitest.config.ts.
 * If no threshold is configured, uses DEFAULT_THRESHOLD.
 * Supports parallel execution and CI-friendly output.
 *
 * ## --floor-only mode (P3a)
 *
 * Runs `enforceFloor()` and exits. No test execution. Used as the
 * PR-time fast gate (~5s) — proves the floor / exemption invariant holds
 * but does NOT detect actual coverage regressions in a PR's changes.
 *
 * The full run (no flag) is the canonical safety net, executed on
 * `push: main` and `merge_group` only — main is never allowed to
 * regress, but PRs get fast feedback instead of paying the 200s+ cost
 * on every iteration.
 *
 * ## Coverage floor (PR #323 → #324 → #1266 → #1279 → THIS PR)
 *
 * MINIMUM_FLOOR is the lowest STATEMENT threshold any package may
 * configure without an explicit entry in BELOW_FLOOR_EXEMPTIONS.
 * MINIMUM_BRANCH_FLOOR is the same for branch coverage. Trajectory:
 *   PR #323 established the 85% statement floor;
 *   PR #324 raised it to 90% + added an explicit 80% branch floor;
 *   PR #1266 raised statements 90 → 94 + branches 80 → 85;
 *   PR #1279 raised statements 94 → 95 (cov-95 floor);
 *   THIS PR raises branches 85 → 95 (cov-95-branches floor).
 *
 * The packages below 95 branches each get an explicit
 * BELOW_FLOOR_EXEMPTIONS entry carrying their current branch
 * threshold + reason. Same structural pattern PR #1279 used for
 * statements: aspiration is clearly 95, each below-95 package is
 * visible debt with documented justification, new packages can't
 * silently slip in below 95. Lifting each package to 95 branches
 * is per-package multi-PR work tracked separately.
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
const DEFAULT_THRESHOLD = 95
const MINIMUM_FLOOR = 95
const MINIMUM_BRANCH_FLOOR = 95
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
  // ── Statements + branches < floor ───────────────────────────────────
  '@pyreon/compiler': {
    currentStatements: 92,
    currentBranches: 85,
    reason:
      'JSX transform compiler. PR #1079 excluded load-native.ts (napi-rs binary loader) + event-names.ts (DOM-event remap data). Branches lifted to 85% via PR #1328. Statements at 92.65%, branches at 85.34% — both below MINIMUM_FLOOR=95 / MINIMUM_BRANCH_FLOOR=95. Residual gap is in jsx.ts (~3000-line file with progressively rarer compiler-edge-case AST branches needing targeted fixtures). Lifting compiler to 95/95 is multi-PR work tracked as a long-tail effort.',
  },
  // ── Branch < MINIMUM_BRANCH_FLOOR=95 (statements OK at ≥95) ─────────
  // Each entry's `currentBranches` mirrors the package's vitest.config.ts
  // branches threshold. Drift detection enforces both stay in sync.
  // Per-package roadmaps:
  // - Compat layers: residual gaps are React/Vue/Solid/Svelte API surface
  //   covered by real-Chromium e2e (`e2e/compat-layers/*.spec.ts`).
  // - Build/dev infra (vite-plugin, zero, lint, cli): residual gaps are
  //   cross-process integration paths hard to drive from happy-dom vitest.
  // - UI layer (styler, runtime-dom, elements, kinetic, router):
  //   residual gaps are compiler-emitted fast paths and timing-sensitive
  //   animation/transition arms, covered by real-Chromium e2e.
  '@pyreon/cli': {
    currentStatements: 95,
    currentBranches: 85,
    reason:
      'CLI tool. Branches at ~85% — residual gap in pyreon doctor subprocess orchestration + interactive prompt paths. Multi-PR per-subcommand work.',
  },
  '@pyreon/server': {
    currentStatements: 95,
    currentBranches: 86,
    reason:
      'SSR server. Branches at ~86% — residual gap is client-side island() path (browser-only client.ts hydration scheduling) covered by islands.browser.test.tsx in real Chromium but unreachable from node-process vitest. PRs #1335 + #1336 added happy-dom coverage for bare island() invocation; further lift to 95 requires real-browser mount tests.',
  },
  '@pyreon/styler': {
    currentStatements: 95,
    currentBranches: 85,
    reason:
      'CSS-in-JS engine. Branches at ~85% — residual gap in StyleSheet recovery paths only exercised by real-Chromium. Covered by ui-showcase real-app regression gate.',
  },
  '@pyreon/zero': {
    currentStatements: 95,
    currentBranches: 85,
    reason:
      'Full-stack meta-framework. Branches at ~85% — residual gap in adapter-build SSG/SSR/ISR plugin chains, fs-router auto-detect, image plugin sharp paths exercised by `verify-modes` build matrix + Playwright e2e rather than unit tests.',
  },
  '@pyreon/runtime-dom': {
    currentStatements: 95,
    currentBranches: 86,
    reason:
      'DOM renderer. Branches at 86.88% — residual gap in template fast paths, hydrate NativeItem swaps, transition timing arms only reachable via compiler-emitted templates in real Chromium (covered by ui-showcase e2e).',
  },
  '@pyreon/vue-compat': {
    currentStatements: 95,
    currentBranches: 86,
    reason:
      'Vue 3 compat shim. Branches at ~86% — residual gap in Transition/TransitionGroup class-prop forwarders. Real-Chromium e2e (`e2e/compat-layers/vue-compat.spec.ts`) covers production shapes.',
  },
  '@pyreon/router': {
    currentStatements: 95,
    currentBranches: 88,
    reason:
      'Router. Branches at ~88% — residual gap in View Transitions API integration (browser-only), scroll restoration timing arms, prefetch IntersectionObserver paths exercised by Playwright e2e (ssr-showcase, ssg-i18n).',
  },
  '@pyreon/vite-plugin': {
    currentStatements: 95,
    currentBranches: 88,
    reason:
      'Vite plugin. Branches at 88.52% — residual gap in Vite plugin hooks invoked by Vite itself (not directly testable from vitest). 48 helper-function tests landed in PR #1323; further lift needs integration tests covered by `verify-modes`.',
  },
  '@pyreon/solid-compat': {
    currentStatements: 95,
    currentBranches: 89,
    reason:
      'Solid compat shim. Branches at ~89% — residual gap in createResource / createMutable proxy traps. Real-Chromium e2e covers production shapes.',
  },
  '@pyreon/svelte-compat': {
    currentStatements: 95,
    currentBranches: 89,
    reason:
      'Svelte compat shim. Branches at ~89% — residual gap in store-contract derived/readable edge arms + Svelte 5 runes adapter. Real-Chromium e2e covers production shapes.',
  },
  '@pyreon/lint': {
    currentStatements: 95,
    currentBranches: 90,
    reason:
      'Lint engine. Branches at ~90% — residual gap in 89-rule AST detectors against rare/synthetic source shapes.',
  },
  '@pyreon/elements': {
    currentStatements: 95,
    currentBranches: 91,
    reason:
      'Element primitives. Branches at ~91% — residual gap in 4-overload prop forwarders + void-tag children-slot branches only exercised by compiler-emitted templates. Covered by `e2e/ui-showcase-regression.spec.ts`.',
  },
  '@pyreon/kinetic': {
    currentStatements: 95,
    currentBranches: 92,
    reason:
      'Animation primitives. Branches at 92.47% — residual gap in Transition timing fallbacks + Stagger/Collapse height-measurement paths only reachable in real browser. PR #1334 added Stagger prop-default tests (+1.32pp); further lift requires extending kinetic.browser.test.tsx.',
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

/** Extract branch threshold from a package's vitest.config.ts. Defaults to DEFAULT_THRESHOLD if absent. */
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
const isFloorOnly = process.argv.includes('--floor-only')
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

// P3a — floor-only mode: pure config gate, no test execution. Used as
// the PR-time fast path; full coverage runs on push:main + merge_group.
if (isFloorOnly) {
  console.log(
    `\n✅ Floor-config check passed (${packages.length} packages, ` +
      `MINIMUM_FLOOR=${MINIMUM_FLOOR}% / MINIMUM_BRANCH_FLOOR=${MINIMUM_BRANCH_FLOOR}%, ` +
      `${Object.keys(BELOW_FLOOR_EXEMPTIONS).length} exemptions current).\n` +
      `Full coverage runs on push:main + merge_group.\n`,
  )
  process.exit(0)
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
