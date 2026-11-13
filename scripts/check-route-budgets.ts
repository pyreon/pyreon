#!/usr/bin/env bun
/**
 * check-route-budgets — first-load JS per built zero route.
 *
 * The sizes come from the `sizeRoutes` cells of `scripts/verify-modes.ts`
 * (entry + modulepreloads + their static import closure, gzipped). CI's
 * `Verify Modes` step records them to `PYREON_SIZE_ROUTES_OUT` and this script
 * judges that file; run without one, it builds the cells itself.
 *
 * The verdict follows `size-budget-policy.ts`, like the two package gates: on
 * a pull request a route is judged on the bytes this change adds, on the
 * default branch against its ceiling in `scripts/size-budgets/apps/`.
 *
 * Run:
 *   bun scripts/check-route-budgets.ts                       # local: ceilings reported
 *   bun scripts/check-route-budgets.ts --mode=main           # fail on a route over its ceiling
 *   bun scripts/check-route-budgets.ts --mode=pr --base=<f>  # fail on this change's own growth
 *   bun scripts/check-route-budgets.ts --routes=<file>       # judge recorded sizes, build nothing
 *   bun scripts/check-route-budgets.ts --update=<id>         # accept that route's size: set its ceiling
 *   bun scripts/check-route-budgets.ts --update              # seed new routes, raise the ones over
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { isUpdateMode } from './bundle-budget-policy'
import { nextCeiling, resolveBasePath, resolveSizeMode, type SizeBaseFile } from './size-budget-policy'
import { loadCeilings, resolveBudgetsDir, writeCeiling } from './size-budget-store'
import { judgeRouteSizes } from './zero-app-checks'

const REPO_ROOT = resolve(import.meta.dirname, '..')

/** Builds the size-judged cells of `root` and returns their route sizes. */
export function measureRouteSizes(root: string): Record<string, number> {
  const scratch = mkdtempSync(join(tmpdir(), 'pyreon-route-sizes-'))
  const out = join(scratch, 'routes.json')
  try {
    const run = spawnSync('bun', [join(REPO_ROOT, 'scripts', 'verify-modes.ts')], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYREON_VERIFY_MODES_ROOT: root, PYREON_SIZE_ROUTES_MEASURE: out },
    })
    if (run.status !== 0 || !existsSync(out)) {
      throw new Error(
        `[Pyreon] check-route-budgets: building the size-judged routes in ${root} failed (exit ${run.status}). Fix the build first.\n${run.stdout}\n${run.stderr}`,
      )
    }
    return JSON.parse(readFileSync(out, 'utf8')) as Record<string, number>
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const recorded = args.find((a) => a.startsWith('--routes='))?.slice('--routes='.length) ?? process.env.PYREON_SIZE_ROUTES_OUT
  let sizes: Record<string, number>
  if (recorded) {
    // A named file that is missing means the step that records it did not run.
    // Building the routes here instead would hide that, so it is a failure.
    if (!existsSync(recorded)) {
      console.error(
        `✗ check-route-budgets: no recorded route sizes at ${recorded}. The Verify Modes step writes them; it failed or did not run.`,
      )
      process.exit(1)
    }
    sizes = JSON.parse(readFileSync(recorded, 'utf8')) as Record<string, number>
  } else {
    sizes = measureRouteSizes(REPO_ROOT)
  }

  const budgetsDir = resolveBudgetsDir(args, REPO_ROOT)
  const ceilings = loadCeilings(budgetsDir).routes

  if (isUpdateMode(args)) {
    const only = args.find((a) => a.startsWith('--update='))?.slice('--update='.length)
    if (only !== undefined && !(only in sizes)) {
      console.error(`✗ --update=${only}: no such measured route. Ids look like ssr-showcase:/about.`)
      process.exit(1)
    }
    let changed = 0
    for (const [id, size] of Object.entries(sizes)) {
      if (only !== undefined && id !== only) continue
      const { value, action } = nextCeiling(ceilings[id], size, only !== undefined)
      if (action === 'refused') {
        console.log(`  ⚠ not lowered: ${id} stays ${value} (measured ${size}). If this shrink is real, scope it: --update=${id}`)
        continue
      }
      if (action === 'keep') continue
      const file = writeCeiling(budgetsDir, 'routes', id, value)
      console.log(`  ${ceilings[id] ?? 'none'} → ${value}  ${id} (measured ${size}) in ${file}`)
      changed += 1
    }
    console.log(`✓ route ceilings — ${changed} changed`)
    return
  }

  const mode = resolveSizeMode(args, process.env)
  const basePath = resolveBasePath(args, process.env)
  let base: SizeBaseFile | undefined
  if (mode === 'pr') {
    if (basePath === undefined || !existsSync(basePath)) {
      console.error(
        '✗ check-route-budgets: pr mode needs the base measurement. Run `bun scripts/size-base.ts --out=<file>` and pass --base=<file> (or PYREON_SIZE_BASE).',
      )
      process.exit(1)
    }
    base = JSON.parse(readFileSync(basePath, 'utf8')) as SizeBaseFile
  }

  for (const [id, size] of Object.entries(sizes)) console.log(`  ${id}: ${size} B gz${ceilings[id] === undefined ? '' : `, ceiling ${ceilings[id]}`}`)
  const { lines, failed } = judgeRouteSizes(sizes, ceilings, mode, base?.routes)
  for (const line of lines) (line.startsWith('✓') || line.startsWith('  ·') ? console.log : console.error)(line)
  if (failed > 0) process.exit(1)
}

if (import.meta.main) main()
