/**
 * Coverage threshold checker.
 * Runs test coverage for all packages and reports failures.
 *
 * Usage: bun scripts/check-coverage.ts
 *
 * Reads coverage thresholds from each package's vitest.config.ts.
 * If no threshold is configured, uses the default (90% statements).
 * Supports parallel execution and CI-friendly output.
 */
import { execSync } from 'node:child_process'
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
const CONCURRENCY = 4

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

/** Run coverage for a single package and return results. */
function runCoverage(pkgDir: string, pkgName: string, threshold: number): CoverageResult | null {
  try {
    const output = execSync('bun run test -- --coverage --reporter=json', {
      cwd: pkgDir,
      timeout: 120_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const match = output.match(
      /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
    )
    if (match) {
      const [, stmts, branches, funcs, lines] = match.map(Number)
      const pass = (stmts ?? 0) >= threshold
      return {
        package: pkgName,
        statements: stmts ?? 0,
        branches: branches ?? 0,
        functions: funcs ?? 0,
        lines: lines ?? 0,
        pass,
        threshold,
      }
    }
  } catch {
    // Package test failed or timed out
  }

  return null
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

/** Run packages with bounded concurrency. */
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
      const result = runCoverage(pkg.dir, pkg.name, pkg.threshold)
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

// ─── Main ──────────────────────────────────────────────────────────────────

const isCI = !!process.env.CI
const packages = collectPackages()

console.log(`\nRunning coverage for ${packages.length} packages...\n`)

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
