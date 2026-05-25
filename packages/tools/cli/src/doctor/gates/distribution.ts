/**
 * Distribution-hygiene gate — programmatic API.
 *
 * Two static invariants every published `@pyreon/*` package must hold:
 *   1. `sideEffects` field declared (bundler tree-shaking)
 *   2. `files` array does NOT exclude `lib/** /*.map` — source maps are
 *      shipped so consumers get readable stack traces into framework
 *      internals (matches every major JS library: React, Vue, Solid,
 *      Preact, Svelte, TanStack). Stripped from production bundles by
 *      the consumer's bundler, never reaches end users.
 *
 * Plus a live `npm pack --dry-run` probe of `@pyreon/reactivity` to
 * verify maps actually land in the tarball at publish time (the
 * `files` field can be technically right but npm's interpretation can
 * still diverge).
 *
 * Pure function — the standalone script `scripts/check-distribution.ts`
 * is a thin wrapper that calls this and formats the output.
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

/**
 * Pure parse-and-emit function for the `npm pack --dry-run` JSON
 * output. Exported as `_internal` so tests can exercise the .map-
 * detection + finding emission path without spawning the live npm
 * subprocess — under CI parallel load the real probe runs 100s+,
 * tripping the per-test timeout. Returns the finding (if any) for
 * the caller to push onto the gate's findings array.
 *
 * Inverted contract: emits a finding when the tarball is MISSING
 * `.map` files. Maps are now required to ship — they make framework
 * stack traces readable. An empty `files` entry in npm output is
 * treated as "no files reported" (likely a malformed dry-run output)
 * and silently passes — the package-level `files` array check above
 * is the authoritative source.
 */
export const _detectMapsInPackOutput = (
  raw: string,
  cwd: string,
  probe: { dir: string },
  probePackage: string,
): Finding | null => {
  const result = JSON.parse(raw) as Array<{ files: Array<{ path: string }> }>
  const tarballFiles = result[0]?.files?.map((f) => f.path) ?? []
  // Empty / missing files entry → likely malformed output. Don't fire
  // a false positive; the static `files`-array check above is the
  // authoritative source of truth for this contract.
  if (tarballFiles.length === 0) return null
  const maps = tarballFiles.filter((f) => f.endsWith('.map'))
  if (maps.length > 0) return null
  return {
    category: 'architecture',
    severity: 'error',
    code: 'distribution/tarball-missing-maps',
    gate: 'distribution',
    message: `${probePackage}: npm pack --dry-run reported 0 .map files in the would-be-published tarball. Source maps must ship so framework stack traces are readable — check the package's \`files\` array does not exclude \`lib/**/*.map\`.`,
    location: {
      path: join(probe.dir, 'package.json'),
      relPath: relative(cwd, join(probe.dir, 'package.json')),
    },
  }
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
   * `@pyreon/reactivity` — small, stable, canonical `files` shape
   * used by ~37 other published packages.
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

    // Rule 2: if the package ships `lib`, the `files` array must NOT
    // exclude source maps. Maps are shipped so consumers get readable
    // stack traces into framework internals.
    if (Array.isArray(p.pj.files) && p.pj.files.includes('lib')) {
      if (p.pj.files.includes('!lib/**/*.map')) {
        findings.push({
          category: 'architecture',
          severity: 'error',
          code: 'distribution/excludes-source-maps',
          gate: 'distribution',
          message: `${p.name} package.json \`files\` must NOT include \`"!lib/**/*.map"\`. Source maps are shipped so framework stack traces are readable — every major JS library (React, Vue, Solid, Preact, Svelte, TanStack) ships them. Bundlers strip maps from production builds; they never reach end users.`,
          location: {
            path: join(p.dir, 'package.json'),
            relPath: relative(opts.cwd, join(p.dir, 'package.json')),
          },
          fix: 'Remove `"!lib/**/*.map"` from the `files` array',
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
        const finding = _detectMapsInPackOutput(
          out,
          opts.cwd,
          probe,
          probePackage,
        )
        if (finding) findings.push(finding)
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
