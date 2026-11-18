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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { measureRouteSizes } from './check-route-budgets'
import { prepareBaseTree, run } from './size-base-tree'
import { movesLibSizes, movesRouteSizes, type SizeBaseFile } from './size-budget-policy'
import { loadCeilings, sizeBudgetsDir } from './size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '..')

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
    if (libMoved || routesMoved) prepareBaseTree(dir, !changed.includes('bun.lock'))
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
