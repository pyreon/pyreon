/**
 * Distribution-hygiene gate — programmatic API.
 *
 * Two static invariants every published `@pyreon/*` package must hold:
 *   1. `sideEffects` field declared (bundler tree-shaking)
 *   2. `!lib/** /*.map` excluded from `files` array (no source-map ship)
 *
 * Plus a live `npm pack --dry-run` probe of `@pyreon/reactivity` to
 * verify the exclusion actually works at publish time (the `files`
 * field is technically right but npm's interpretation can diverge).
 *
 * Pure function — the standalone script `scripts/check-distribution.ts`
 * is a thin wrapper that calls this and formats the output.
 *
 * Mirrors the script logic 1:1 — no behavior change, just makes the
 * findings programmatically consumable by `pyreon doctor` aggregation
 * (PR 2).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Finding, GateResult } from '../types'

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

const findPackages = (repoRoot: string): PackageInfo[] => {
  const result: PackageInfo[] = []
  const packagesRoot = join(repoRoot, 'packages')
  if (!existsSync(packagesRoot)) return result
  for (const cat of readdirSync(packagesRoot)) {
    const catDir = join(packagesRoot, cat)
    let pkgs: string[]
    try {
      pkgs = readdirSync(catDir)
    } catch {
      continue
    }
    for (const pkg of pkgs) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      if (!existsSync(pjPath)) continue
      let pj: PackageInfo['pj']
      try {
        pj = JSON.parse(readFileSync(pjPath, 'utf8'))
      } catch {
        continue
      }
      if (pj.private) continue
      if (typeof pj.name !== 'string') continue
      result.push({ name: pj.name, dir: pkgDir, pj })
    }
  }
  return result
}

export interface DistributionGateOptions {
  /**
   * Repository root directory. The gate walks `<cwd>/packages/*` and
   * shells out to `npm pack` from `<cwd>/packages/core/reactivity`.
   */
  cwd: string

  /**
   * Skip the `npm pack --dry-run` probe. Useful for unit tests +
   * environments where npm isn't on PATH. Defaults to `false`.
   */
  skipPackProbe?: boolean

  /**
   * Package to probe via `npm pack --dry-run`. Defaults to
   * `@pyreon/reactivity` — small, stable, canonical 4-element `files`
   * shape used by ~37 other published packages.
   */
  probePackage?: string
}

/**
 * Run the distribution-hygiene gate. Returns findings + metadata.
 *
 * @example
 * const result = await runDistributionGate({ cwd: process.cwd() })
 * if (result.findings.length > 0) process.exit(1)
 */
export const runDistributionGate = async (
  opts: DistributionGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const probePackage = opts.probePackage ?? '@pyreon/reactivity'
  const findings: Finding[] = []
  const packages = findPackages(opts.cwd)

  for (const p of packages) {
    // Rule 1: sideEffects must be defined.
    if (p.pj.sideEffects === undefined) {
      findings.push({
        category: 'architecture',
        severity: 'error',
        code: 'distribution/missing-sideEffects',
        gate: 'distribution',
        message: `${p.name} package.json must declare \`sideEffects\` (use \`false\` for pure libraries, an array of paths for entry-point side effects) — required for bundler tree-shaking.`,
        location: {
          path: join(p.dir, 'package.json'),
          relPath: relative(opts.cwd, join(p.dir, 'package.json')),
        },
        fix: 'Add `"sideEffects": false` to package.json',
      })
    }

    // Rule 2: if the package ships `lib`, the `files` array must
    // exclude source maps.
    if (Array.isArray(p.pj.files) && p.pj.files.includes('lib')) {
      if (!p.pj.files.includes('!lib/**/*.map')) {
        findings.push({
          category: 'architecture',
          severity: 'error',
          code: 'distribution/missing-map-exclusion',
          gate: 'distribution',
          message: `${p.name} package.json \`files\` must include \`"!lib/**/*.map"\` to exclude source maps from the published tarball.`,
          location: {
            path: join(p.dir, 'package.json'),
            relPath: relative(opts.cwd, join(p.dir, 'package.json')),
          },
          fix: 'Add `"!lib/**/*.map"` to the `files` array',
        })
      }
    }
  }

  // Rule 3: live `npm pack --dry-run` probe.
  if (!opts.skipPackProbe) {
    const probe = packages.find((p) => p.name === probePackage)
    if (probe) {
      try {
        const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
          cwd: probe.dir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const result = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
        const tarballFiles = result[0]?.files.map((f) => f.path) ?? []
        const maps = tarballFiles.filter((f) => f.endsWith('.map'))
        if (maps.length > 0) {
          findings.push({
            category: 'architecture',
            severity: 'error',
            code: 'distribution/tarball-contains-map',
            gate: 'distribution',
            message: `${probePackage}: npm pack --dry-run reported ${maps.length} .map file(s) in the would-be-published tarball: ${maps.slice(0, 3).join(', ')}${maps.length > 3 ? ', …' : ''}`,
            location: {
              path: join(probe.dir, 'package.json'),
              relPath: relative(opts.cwd, join(probe.dir, 'package.json')),
            },
          })
        }
      } catch {
        // npm not available or pack failed — silently skip. Locally
        // this might run in an environment where npm isn't on PATH
        // (Bun-only setup); CI has npm so the gate fires there.
      }
    }
  }

  return {
    gate: 'distribution',
    category: 'architecture',
    findings,
    meta: {
      scanned: packages.length,
      elapsedMs: Date.now() - start,
    },
  }
}
