#!/usr/bin/env bun
/**
 * size-base — measures the commit a pull request merges into, so the three
 * size gates can judge the pull request on what IT adds.
 *
 * Writes one JSON file (`SizeBaseFile` in `size-budget-policy.ts`) holding, for
 * each family (package bundles, minimal imports, zero routes), the base
 * commit's sizes and ceilings.
 *
 * The base is measured with THIS checkout's scripts, pointed at a worktree of
 * the base commit: a change to how sizes are measured then applies to both
 * sides and cannot appear as growth.
 *
 * Cost. When no changed path can move a size (`movesLibSizes` /
 * `movesRouteSizes`), the base builds to the same bytes as the head: nothing is
 * built and the file says so (`sizes: null`). Otherwise the base worktree gets
 * the head's `lib/` trees and bootstrap manifest, and `scripts/bootstrap.ts`
 * rebuilds only the packages whose sources differ (it content-hashes sources
 * and `lib/`), which is the same "nearest lib/, corrected incrementally" path
 * CI's cache fallback uses.
 *
 *   bun scripts/size-base.ts --ref=HEAD^1 --out=/tmp/size-base.json [--dir=<worktree path>]
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { measureRouteSizes } from './check-route-budgets'
import { movesLibSizes, movesRouteSizes, type SizeBaseFile } from './size-budget-policy'
import { loadCeilings, sizeBudgetsDir } from './size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '..')

function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): string {
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env },
  })
  if (r.status !== 0) {
    throw new Error(
      `[Pyreon] size-base: \`${cmd} ${args.join(' ')}\` failed in ${cwd} (exit ${r.status}).\n${r.stdout.slice(-4000)}\n${r.stderr.slice(-4000)}`,
    )
  }
  console.log(`[size-base] ${cmd} ${args.slice(0, 3).join(' ')} — ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return r.stdout
}

/** Copies every built `lib/` of the head into the same package of `base`. */
function seedLib(base: string): void {
  const packages = join(REPO_ROOT, 'packages')
  for (const cat of readdirSync(packages)) {
    const catDir = join(packages, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const pkg of readdirSync(catDir)) {
      const lib = join(catDir, pkg, 'lib')
      const target = join(base, 'packages', cat, pkg)
      if (existsSync(lib) && existsSync(target)) cpSync(lib, join(target, 'lib'), { recursive: true })
    }
  }
  const manifest = join(REPO_ROOT, '.bootstrap-cache.json')
  if (existsSync(manifest)) cpSync(manifest, join(base, '.bootstrap-cache.json'))
}

/**
 * Gives `base` the head's installed dependencies by hard-linking them, which
 * takes seconds where an install takes a minute (CI's Build job restores
 * `node_modules`, not bun's download cache, so an install there downloads
 * every tarball). Only valid when both trees have the same lockfile; every
 * workspace symlink bun writes is relative, so the links resolve inside
 * `base`. Returns false when it could not link everything; the caller then
 * installs.
 */
function linkNodeModules(base: string): boolean {
  const groups = ['node_modules', 'docs/node_modules']
  for (const parent of ['examples', ...readdirSync(join(REPO_ROOT, 'packages')).map((c) => join('packages', c))]) {
    const dir = join(REPO_ROOT, parent)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) groups.push(join(parent, name, 'node_modules'))
  }
  for (const group of groups) {
    const from = join(REPO_ROOT, group)
    const to = join(base, group)
    if (!existsSync(from) || !existsSync(dirname(to))) continue
    if (spawnSync('cp', ['-al', from, to], { stdio: 'ignore' }).status !== 0) return false
  }
  return true
}

interface MeasureOutput {
  measured: { name?: string; id?: string; gzip: number; failed?: boolean }[]
}

/** Runs one of this checkout's package gates in measure-only mode over `base`. */
function measurePackages(script: string, base: string): Record<string, number> {
  const out = run(
    'bun',
    [join(REPO_ROOT, 'scripts', script), '--measure-only', '--json', `--packages-root=${join(base, 'packages')}`],
    REPO_ROOT,
  )
  const sizes: Record<string, number> = {}
  for (const m of (JSON.parse(out) as MeasureOutput).measured) {
    const id = m.name ?? m.id
    if (id !== undefined && m.failed !== true) sizes[id] = m.gzip
  }
  return sizes
}

function main(): void {
  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const ref = flag('ref')
  const out = flag('out')
  if (!ref || !out) {
    console.error('usage: bun scripts/size-base.ts --ref=<commit> --out=<file> [--dir=<worktree path>]')
    process.exit(2)
  }
  const sha = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], REPO_ROOT).trim()
  const changed = run('git', ['diff', '--name-only', sha, 'HEAD'], REPO_ROOT).split('\n').filter(Boolean)
  const libMoved = changed.some(movesLibSizes)
  const routesMoved = changed.some(movesRouteSizes)

  const dir = resolve(flag('dir') ?? join(mkdtempSync(join(tmpdir(), 'pyreon-size-base-')), 'tree'))
  run('git', ['worktree', 'add', '--detach', '--force', dir, sha], REPO_ROOT)
  try {
    // An absent directory reads as no ceilings: a base from before the
    // per-owner layout. Every entry is then judged against its ceiling only.
    const ceilings = loadCeilings(sizeBudgetsDir(dir))
    const base: SizeBaseFile = {
      ref: sha,
      bundle: { sizes: null, ceilings: ceilings.bundle },
      imports: { sizes: null, ceilings: ceilings.imports },
      routes: { sizes: null, ceilings: ceilings.routes },
    }
    if (libMoved || routesMoved) {
      seedLib(dir)
      const sameLock = !changed.includes('bun.lock')
      const started = Date.now()
      if (sameLock && linkNodeModules(dir)) {
        console.log(`[size-base] dependencies linked from the head — ${((Date.now() - started) / 1000).toFixed(1)}s`)
      } else {
        run('bun', ['install', '--frozen-lockfile'], dir, { PYREON_BOOTSTRAP_SKIP: '1' })
      }
      run('bun', ['scripts/bootstrap.ts'], dir)
    }
    if (libMoved) {
      base.bundle.sizes = measurePackages('check-bundle-budgets.ts', dir)
      base.imports.sizes = measurePackages('check-import-budgets.ts', dir)
    }
    if (routesMoved) {
      const started = Date.now()
      base.routes.sizes = measureRouteSizes(dir)
      console.log(`[size-base] route cells — ${((Date.now() - started) / 1000).toFixed(1)}s`)
    }
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), `${JSON.stringify(base, null, 2)}\n`)
    const count = (sizes: Record<string, number> | null): string =>
      sizes === null ? 'same as head (no input changed)' : `${Object.keys(sizes).length} measured`
    console.log(`[size-base] base ${sha.slice(0, 9)}: bundles ${count(base.bundle.sizes)}; imports ${count(base.imports.sizes)}; routes ${count(base.routes.sizes)}`)
    console.log(`[size-base] wrote ${resolve(out)}`)
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT })
    rmSync(dir, { recursive: true, force: true })
  }
}

main()
