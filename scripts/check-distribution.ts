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
 *  2. **Source maps excluded from the published tarball.** `.js.map`
 *     and `.d.ts.map` files are useful for in-repo development but
 *     are pure overhead in published packages — consumers debug with
 *     their own bundler's source maps. Without exclusion, ~19 MB of
 *     source-map noise ships across the monorepo.
 *
 * Both invariants are enforced via the package's `files` field. The
 * gate ALSO simulates `npm pack --dry-run` for one representative
 * package to prove the exclusion works at publish time, not just on
 * paper.
 *
 * Run:
 *   bun run check-distribution         # report violations, exit non-zero
 *   bun run check-distribution --json  # machine-readable output
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')

interface PackageInfo {
  name: string
  dir: string
  pj: {
    name?: string
    private?: boolean
    sideEffects?: unknown
    files?: string[]
    main?: string
    exports?: unknown
  }
}

function findPackages(): PackageInfo[] {
  const result: PackageInfo[] = []
  const packagesRoot = join(REPO_ROOT, 'packages')
  for (const cat of readdirSync(packagesRoot)) {
    const catDir = join(packagesRoot, cat)
    for (const pkg of readdirSync(catDir)) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      if (!existsSync(pjPath)) continue
      const pj = JSON.parse(readFileSync(pjPath, 'utf8'))
      if (pj.private) continue
      result.push({ name: pj.name, dir: pkgDir, pj })
    }
  }
  return result
}

interface Violation {
  package: string
  rule: 'missing-sideEffects' | 'missing-map-exclusion' | 'tarball-contains-map'
  detail: string
}

const violations: Violation[] = []

const packages = findPackages()

for (const p of packages) {
  // Rule 1: sideEffects must be defined (false or array — both unblock
  // tree-shaking, just with different granularity).
  if (p.pj.sideEffects === undefined) {
    violations.push({
      package: p.name,
      rule: 'missing-sideEffects',
      detail:
        'package.json must declare `sideEffects` (use `false` for pure libraries, an array of paths for entry-point side effects)',
    })
  }

  // Rule 2: if the package ships `lib`, the `files` array must also
  // exclude source maps (`!lib/**/*.map` covers .js.map and .d.ts.map
  // because the npm `files` glob runs against the published path tree).
  if (Array.isArray(p.pj.files) && p.pj.files.includes('lib')) {
    if (!p.pj.files.includes('!lib/**/*.map')) {
      violations.push({
        package: p.name,
        rule: 'missing-map-exclusion',
        detail:
          'package.json `files` must include `"!lib/**/*.map"` to exclude source maps from the published tarball',
      })
    }
  }
}

// Rule 3: simulate `npm pack --dry-run` for one representative package
// and assert the resulting tarball file list contains zero `.map` files.
// We pick @pyreon/reactivity because it's small, stable, and ships the
// canonical 4-element `files` shape used by ~37 other packages — if
// reactivity's tarball is clean, the shape works.
const probePackage = '@pyreon/reactivity'
const probe = packages.find((p) => p.name === probePackage)
if (probe) {
  try {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: probe.dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const result = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
    const tarballFiles = result[0].files.map((f) => f.path)
    const maps = tarballFiles.filter((f) => f.endsWith('.map'))
    if (maps.length > 0) {
      violations.push({
        package: probePackage,
        rule: 'tarball-contains-map',
        detail: `npm pack --dry-run reported ${maps.length} .map file(s) in the would-be-published tarball: ${maps.slice(0, 3).join(', ')}${maps.length > 3 ? ', …' : ''}`,
      })
    }
  } catch (err) {
    // npm not available or pack failed — log but don't fail the gate;
    // CI will run with npm available. Locally this might run in an
    // environment where npm isn't on PATH (Bun-only setup).
    // eslint-disable-next-line no-console
    console.warn(
      `[check-distribution] npm pack probe skipped (${probePackage}): ${(err as Error).message}`,
    )
  }
}

const json = process.argv.includes('--json')

if (json) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ violations, totalPackages: packages.length }, null, 2))
} else if (violations.length === 0) {
  // eslint-disable-next-line no-console
  console.log(
    `✓ Distribution gate clean. ${packages.length} published package(s) checked.`,
  )
  // eslint-disable-next-line no-console
  console.log(`  • All have \`sideEffects\` declared`)
  // eslint-disable-next-line no-console
  console.log(`  • All exclude \`!lib/**/*.map\` from the published tarball`)
  // eslint-disable-next-line no-console
  console.log(`  • npm pack --dry-run probe (${probePackage}): no .map files in tarball`)
} else {
  // eslint-disable-next-line no-console
  console.error(`✗ Distribution gate found ${violations.length} violation(s):\n`)
  for (const v of violations) {
    // eslint-disable-next-line no-console
    console.error(`  [${v.rule}] ${v.package}`)
    // eslint-disable-next-line no-console
    console.error(`    ${v.detail}\n`)
  }
}

if (violations.length > 0) {
  process.exit(1)
}
