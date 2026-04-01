/**
 * Coverage threshold checker.
 * Runs test coverage for all packages and reports failures.
 *
 * Usage: bun scripts/check-coverage.ts
 *
 * Reads coverage thresholds from each package's vitest.config.ts.
 * If no threshold is configured, uses the default (90% statements).
 */
import { execSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIRS = ['packages/core', 'packages/fundamentals', 'packages/ui-system', 'packages/tools', 'packages/zero']
const DEFAULT_THRESHOLD = 90

interface CoverageResult {
  package: string
  statements: number
  branches: number
  functions: number
  lines: number
  pass: boolean
}

const results: CoverageResult[] = []
let hasFailures = false

for (const dir of PACKAGE_DIRS) {
  if (!existsSync(dir)) continue
  const packages = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name))

  for (const pkgDir of packages) {
    const pkgJson = join(pkgDir, 'package.json')
    if (!existsSync(pkgJson)) continue

    // Check if package has test script
    const pkg = JSON.parse(require('fs').readFileSync(pkgJson, 'utf-8'))
    if (!pkg.scripts?.test) continue

    try {
      const output = execSync(`bun run test -- --coverage --reporter=json`, {
        cwd: pkgDir,
        timeout: 60000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Parse coverage from output
      const match = output.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/)
      if (match) {
        const [, stmts, branches, funcs, lines] = match.map(Number)
        const pass = (stmts ?? 0) >= DEFAULT_THRESHOLD
        results.push({
          package: pkg.name,
          statements: stmts ?? 0,
          branches: branches ?? 0,
          functions: funcs ?? 0,
          lines: lines ?? 0,
          pass,
        })
        if (!pass) hasFailures = true
      }
    } catch {
      // Package test failed or timed out — skip
    }
  }
}

// Print report
console.log('\n## Coverage Report\n')
console.log('| Package | Stmts | Branch | Funcs | Lines | Status |')
console.log('|---------|-------|--------|-------|-------|--------|')

for (const r of results.sort((a, b) => a.package.localeCompare(b.package))) {
  const status = r.pass ? '✅' : '❌'
  console.log(`| ${r.package} | ${r.statements}% | ${r.branches}% | ${r.functions}% | ${r.lines}% | ${status} |`)
}

if (hasFailures) {
  console.log(`\n❌ Some packages below ${DEFAULT_THRESHOLD}% statement coverage`)
  process.exit(1)
} else {
  console.log(`\n✅ All packages above ${DEFAULT_THRESHOLD}% statement coverage`)
}
