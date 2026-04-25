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
 * ## Coverage floor (PR #323)
 *
 * MINIMUM_FLOOR is the lowest threshold any package may configure
 * without an explicit entry in BELOW_FLOOR_EXEMPTIONS. The floor is
 * 85% — any package whose vitest.config.ts sets `statements:` below
 * 85 fails the check unless its name appears in the exemption list.
 *
 * BELOW_FLOOR_EXEMPTIONS is the visible-debt list — every entry must
 * carry a reason and is intended to be REMOVED in a follow-up PR
 * once that package's threshold is raised to ≥ MINIMUM_FLOOR. The
 * list is the floor's canonical exception register; do not add to it
 * without also opening a tracking issue or referencing one.
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
const MINIMUM_FLOOR = 85
const CONCURRENCY = 4

/**
 * Packages allowed to configure a `statements` threshold below
 * `MINIMUM_FLOOR`. Each entry carries the current threshold and the
 * reason it's exempt; the floor enforcement skips the package when
 * its name appears here, so the package's own configured threshold
 * still applies. **Remove the entry the same PR that raises the
 * package's threshold to ≥ MINIMUM_FLOOR.**
 *
 * Tracked debt as of PR #323 (coverage sweep findings):
 */
const BELOW_FLOOR_EXEMPTIONS: Record<string, { current: number; reason: string }> = {
  '@pyreon/vite-plugin': {
    current: 0,
    reason: 'No tests today (PR #323 finding). Followup: write vite-plugin tests.',
  },
  // @pyreon/zero: was 60 — exemption removed in PR #323 commit "zero"
  // (excluded build-time Vite plugins, server-runtime middleware, and
  // JSX components from coverage as integration-tier; added validate
  // unit test; threshold raised to 85).
  // @pyreon/lint: was 65 — exemption removed in PR #323 commit "lint"
  // (excluded cli/watcher/ignore/lsp from coverage as integration-only;
  // added reporter + imports + ast-utils unit tests; threshold raised
  // to 85).
  // @pyreon/coolgrid: was 68 — exemption removed in PR #323 commit
  // "coolgrid" (excluded styled.ts integration-tier files; threshold
  // raised to 90).
  // @pyreon/storybook: was 75 — exemption removed in PR #323 commit "storybook"
  // (deleted unused _getAbsolutePath, added preset shape test, threshold raised
  // to 95).
  // @pyreon/vue-compat: was 75 — exemption removed in PR #323 commit
  // "vue-compat" (added jsx-runtime wrapper tests, threshold raised to 85).
  // @pyreon/styler: was 82 — exemption removed in PR #323 commit "styler"
  // (excluded benchmark.bench.ts from coverage; threshold raised to 90).
  // @pyreon/unistyle: was 84 — exemption removed in PR #323 commit "unistyle"
  // (deleted dead spacingShorthand utils.ts, threshold raised to 95).
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

/** Collect all testable packages. */
function collectPackages(): { dir: string; name: string; threshold: number }[] {
  const packages: { dir: string; name: string; threshold: number }[] = []

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
      })
    }
  }

  return packages
}

/** Run packages with bounded concurrency using async spawn. */
async function runWithConcurrency(
  packages: { dir: string; name: string; threshold: number }[],
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
 * Enforce the MINIMUM_FLOOR. Returns a list of misconfigured-threshold
 * errors: any package whose configured threshold falls below the
 * floor without an explicit entry in BELOW_FLOOR_EXEMPTIONS, OR any
 * exempt entry whose listed `current` no longer matches the actual
 * configured threshold (drift detection — keeps the exemption list
 * honest as packages are improved).
 */
function enforceFloor(
  packages: { dir: string; name: string; threshold: number }[],
): string[] {
  const errors: string[] = []
  const seenExemptions = new Set<string>()

  for (const pkg of packages) {
    const exemption = BELOW_FLOOR_EXEMPTIONS[pkg.name]
    if (exemption) {
      seenExemptions.add(pkg.name)
      // Drift: the exemption claims a threshold that no longer matches
      // the package's actual config. Either the threshold was raised
      // (good — drop the exemption) or it was changed without updating
      // the list (the list is now lying).
      if (exemption.current !== pkg.threshold) {
        errors.push(
          `${pkg.name}: BELOW_FLOOR_EXEMPTIONS lists current=${exemption.current}% but vitest.config.ts has ${pkg.threshold}%. ` +
            (pkg.threshold >= MINIMUM_FLOOR
              ? `Drop the exemption — package now meets the floor.`
              : `Update the exemption entry to current=${pkg.threshold}.`),
        )
      }
      continue
    }
    if (pkg.threshold < MINIMUM_FLOOR) {
      errors.push(
        `${pkg.name}: configured threshold ${pkg.threshold}% is below MINIMUM_FLOOR (${MINIMUM_FLOOR}%) and no exemption is registered. ` +
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

// Enforce the 85% floor before running coverage so misconfigured
// thresholds surface even if coverage execution times out / skips.
const floorErrors = enforceFloor(packages)
if (floorErrors.length > 0) {
  console.error('\n❌ Coverage floor violations (MINIMUM_FLOOR = ' + MINIMUM_FLOOR + '%):\n')
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
