#!/usr/bin/env bun
/**
 * check-site-budgets — the JavaScript each budgeted pyreon.dev page requests
 * on load, judged like the other size gates (`size-budget-policy.ts`).
 *
 * Measuring and judging live in `site-budgets.ts`; this is the command.
 *
 * Run:
 *   bun scripts/check-site-budgets.ts                       # local: build, measure, ceilings reported
 *   bun scripts/check-site-budgets.ts --mode=main           # fail on a page over its ceiling
 *   bun scripts/check-site-budgets.ts --mode=pr --base-ref=<commit>
 *                                                           # fail on this change's own growth
 *   bun scripts/check-site-budgets.ts --dist=docs/dist      # measure that build as it is, build nothing
 *   bun scripts/check-site-budgets.ts --sizes=<file>        # judge recorded sizes, measure nothing
 *   bun scripts/check-site-budgets.ts --update=<id>         # accept that page's size: set its ceiling
 *   bun scripts/check-site-budgets.ts --update              # raise the ones over
 *
 * In `pr` mode the base comes from `--base=<file>` (or `PYREON_SIZE_BASE`), or
 * is measured here from `--base-ref` (`--base-dir` names its worktree). With
 * neither, the gate fails: a size gate that passes without its base is not a
 * gate. A new page is added with `--update=docs:<route>`.
 */

import { resolve } from 'node:path'

import { readTextIfExists } from './fs-read'
import { isEntry } from './is-entry'
import { buildSite, judgeSiteSizes, measureSite, measureSiteBase, SITE, siteDist, siteIds } from './site-budgets'
import { nextCeiling, resolveBasePath, resolveSizeMode, type SiteBaseFile } from './size-budget-policy'
import { loadCeilings, resolveBudgetsDir, writeCeiling } from './size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '..')

const flag = (args: readonly string[], name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

function fail(message: string): never {
  console.error(`✗ check-site-budgets: ${message}`)
  process.exit(1)
}

/** The sizes to judge: a recorded file, or a measurement of this checkout's site. */
function headSizes(args: readonly string[], ids: readonly string[]): Record<string, number> {
  const recorded = flag(args, 'sizes')
  if (recorded !== undefined) {
    const text = readTextIfExists(recorded)
    if (text === undefined) {
      fail(`no recorded sizes at ${recorded}.`)
    }

    return JSON.parse(text) as Record<string, number>
  }
  const dist = flag(args, 'dist')
  if (dist !== undefined) {
    return measureSite(resolve(dist), ids, REPO_ROOT)
  }
  buildSite(REPO_ROOT)

  return measureSite(siteDist(REPO_ROOT), ids, REPO_ROOT)
}

/** `--update`: sets ceilings from the measurement, by the rule every size gate shares (`nextCeiling`). */
function update(args: readonly string[], budgetsDir: string, ceilings: Readonly<Record<string, number>>): void {
  const only = flag(args, 'update')
  if (only !== undefined && !only.startsWith(`${SITE}:`)) {
    fail(`--update=${only}: ids look like ${SITE}:/why/components-run-once.`)
  }
  const ids = only === undefined || only in ceilings ? siteIds(ceilings) : [...siteIds(ceilings), only]
  const sizes = headSizes(args, ids)
  if (only !== undefined && !(only in sizes)) {
    fail(`--update=${only}: that page is not in the build, so it was not measured.`)
  }
  let changed = 0
  for (const [id, size] of Object.entries(sizes)) {
    if (only !== undefined && id !== only) {
      continue
    }
    const { value, action } = nextCeiling(ceilings[id], size, only !== undefined)
    if (action === 'refused') {
      console.log(`  ⚠ not lowered: ${id} stays ${value} (measured ${size}). If this shrink is real, scope it: --update=${id}`)
    } else if (action !== 'keep') {
      const file = writeCeiling(budgetsDir, 'site', id, value)
      console.log(`  ${ceilings[id] ?? 'none'} → ${value}  ${id} (measured ${size}) in ${file}`)
      changed += 1
    }
  }
  console.log(`✓ site ceilings — ${changed} changed`)
}

/** The base of a pull request: a recorded file, or measured here from `--base-ref`. */
function prBase(args: readonly string[], ids: readonly string[]): SiteBaseFile {
  const path = resolveBasePath(args, process.env)
  if (path !== undefined) {
    const text = readTextIfExists(path)
    if (text === undefined) {
      fail(`pr mode: no base measurement at ${path}.`)
    }

    return JSON.parse(text) as SiteBaseFile
  }
  const ref = flag(args, 'base-ref')
  if (ref === undefined) {
    fail('pr mode needs the base measurement. Pass --base-ref=<the commit this change merges into>, or --base=<file>.')
  }

  return measureSiteBase(ref, ids, flag(args, 'base-dir'))
}

/** One line per measured page: its size, its ceiling and, on a pull request, what this change added. */
function report(
  sizes: Readonly<Record<string, number>>,
  ceilings: Readonly<Record<string, number>>,
  baseSizes: Readonly<Record<string, number>> | undefined,
): void {
  for (const [id, size] of Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))) {
    const ceiling = ceilings[id]
    const room = ceiling === undefined ? '' : `, ceiling ${ceiling} (${(((ceiling - size) / ceiling) * 100).toFixed(1)}% free)`
    const before = baseSizes?.[id]
    const delta = before === undefined ? '' : `, ${size >= before ? '+' : ''}${size - before} B against the base`
    console.log(`  ${id}: ${size} B gz${room}${delta}`)
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const budgetsDir = resolveBudgetsDir(args, REPO_ROOT)
  const ceilings = Object.fromEntries(Object.entries(loadCeilings(budgetsDir).site).filter(([id]) => id.startsWith(`${SITE}:`)))
  // `--update` or `--update=<id>`, never a longer flag that merely starts with it.
  if (args.some((a) => a === '--update' || a.startsWith('--update='))) {
    update(args, budgetsDir, ceilings)

    return
  }
  const mode = resolveSizeMode(args, process.env)
  const ids = siteIds(ceilings)
  if (ids.length === 0) {
    fail(`no ceilings for the ${SITE} site in ${budgetsDir}. A gate with nothing to measure is not a pass.`)
  }
  const sizes = headSizes(args, ids)
  const base = mode === 'pr' ? prBase(args, ids) : undefined
  report(sizes, ceilings, base?.site.sizes ?? undefined)
  const { lines, failed } = judgeSiteSizes(sizes, ceilings, mode, base?.site)
  for (const line of lines) {
    const log = line.startsWith('✓') || line.startsWith('  ·') ? console.log : console.error
    log(line)
  }
  if (failed > 0) {
    process.exit(1)
  }
}

if (isEntry(import.meta.url)) {
  main()
}
