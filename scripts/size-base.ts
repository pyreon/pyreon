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
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { measureRouteSizes } from './check-route-budgets'
import { listDirIfExists } from './fs-read'
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
  // Each copy is attempted, not preceded by an existence check: a package the
  // base does not have, or one with no `lib/`, fails the copy with ENOENT and
  // is skipped. Bootstrap then builds whatever is missing.
  for (const cat of listDirIfExists(join(REPO_ROOT, 'packages'))) {
    for (const pkg of listDirIfExists(join(REPO_ROOT, 'packages', cat.name))) {
      const rel = join('packages', cat.name, pkg.name, 'lib')
      copyIfPresent(join(REPO_ROOT, rel), join(base, rel))
    }
  }
  // The compiler's native binary is an untracked build artifact. Route cells
  // compile through it when it exists and through the JS backend when it does
  // not, and the two emit a few bytes apart, so the base must use whichever
  // backend the head has. (CI's Build job has none at this point.)
  const native = join('packages', 'core', 'compiler', 'native')
  for (const file of listDirIfExists(join(REPO_ROOT, native))) {
    if (file.name.endsWith('.node')) copyIfPresent(join(REPO_ROOT, native, file.name), join(base, native, file.name))
  }
  copyIfPresent(join(REPO_ROOT, '.bootstrap-cache.json'), join(base, '.bootstrap-cache.json'))
}

/**
 * Copies `from` to `to`; a source or destination parent that does not exist is
 * skipped (returns false). One operation, with no existence check before it.
 */
function copyIfPresent(from: string, to: string): boolean {
  try {
    cpSync(from, to, { recursive: true })
    return true
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return false
    throw err
  }
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
  // Which workspaces have a `node_modules`, and which of them the base also
  // has, is read from directory listings, never probed per path.
  const groups = ['node_modules']
  const parents = ['.', 'examples', ...listDirIfExists(join(REPO_ROOT, 'packages')).map((c) => join('packages', c.name))]
  for (const parent of parents) {
    const inBase = new Set(listDirIfExists(join(base, parent)).map((e) => e.name))
    for (const entry of listDirIfExists(join(REPO_ROOT, parent))) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || !inBase.has(entry.name)) continue
      if (parent === '.' && entry.name !== 'docs') continue
      const installed = listDirIfExists(join(REPO_ROOT, parent, entry.name)).some((e) => e.name === 'node_modules')
      if (installed) groups.push(join(parent, entry.name, 'node_modules'))
    }
  }
  for (const group of groups) {
    const linked = spawnSync('cp', ['-al', join(REPO_ROOT, group), join(base, group)], { stdio: 'ignore' })
    if (linked.status !== 0) return false
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
