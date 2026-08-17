#!/usr/bin/env bun
/**
 * check-app-loc — a ratchet on how much code a Pyreon APP has to write.
 *
 * The framework's stated goal is that an app built on Pyreon needs materially
 * less production code than the same app elsewhere. That is a measurable claim,
 * and an unmeasured claim rots: every PR is free to add app-side boilerplate,
 * and nothing notices until someone re-counts by hand and finds the number has
 * drifted the wrong way.
 *
 * So this counts developer-written lines across a fixed set of reference apps
 * and fails when the count GROWS, in the same idiom as `lint-baseline.json` and
 * the bundle budgets: the baseline only moves DOWN, and moving it down is the
 * PR signal that a reduction actually landed.
 *
 * WHAT IS COUNTED, and why the exclusions matter more than the inclusions:
 *
 *   - Comments are EXCLUDED. Counting them would make deleting documentation a
 *     way to win the metric, which is the opposite of the intent.
 *   - Blank lines are EXCLUDED for the same reason (reformatting is not a
 *     reduction).
 *   - Imports are COUNTED. They are lines a developer writes and maintains, and
 *     one of the levers under consideration (widening auto-import) targets them
 *     directly — excluding them would hide that lever's effect entirely.
 *
 * The apps are pinned by name rather than globbed, because the metric is only
 * comparable over time if the denominator is stable. Adding an app to the list
 * is a deliberate act that necessarily moves the baseline up once.
 *
 * Usage:
 *   bun scripts/check-app-loc.ts            # verify against the baseline
 *   bun scripts/check-app-loc.ts --update   # re-record (review the diff!)
 *   bun scripts/check-app-loc.ts --json
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const BASELINE = join(REPO_ROOT, 'scripts', 'app-loc-baseline.json')

/**
 * Reference apps — the closest examples to real application shape. Showcases
 * (app-showcase, fundamentals-playground, ui-showcase) are deliberately absent:
 * they exercise packages on purpose, so their line counts measure API surface
 * coverage rather than how much code an app needs.
 */
const APPS = ['hn-clone', 'kanban', 'chat', 'collab-board'] as const

const SOURCE_EXT = /\.(ts|tsx)$/
/**
 * Generated or tool-owned paths a developer does not hand-write.
 *
 * NOTE: `lib` is deliberately NOT here. It is a package BUILD directory
 * elsewhere in the repo, but this walker only ever descends
 * `examples/<app>/src`, where `lib/` is the near-universal app convention for
 * shared modules — hn-clone keeps its api client, i18n, bookmarks and prefs
 * there. An earlier version skipped it and silently under-counted every app's
 * shared code, which made the metric read as unchanged across a port that
 * removed 41 lines.
 */
const SKIP = /(^|\/)(node_modules|dist|\.zero)(\/|$)|\.d\.ts$/

interface AppCount {
  code: number
  files: number
}
type Baseline = { total: number; apps: Record<string, AppCount> }

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e)
    if (SKIP.test(full)) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(full)) out.push(full)
  }
  return out
}

/**
 * Count code lines: everything that is neither blank nor a comment.
 *
 * Comment detection is deliberately LINE-BASED rather than a real parse. A
 * parser would be more precise about block comments containing code, but the
 * metric only needs to be CONSISTENT over time — and a line-based rule cannot
 * drift as the parser is upgraded. It tracks whether we are inside a block
 * comment so a commented-out block does not count as code.
 */
export function countCodeLines(source: string): number {
  let code = 0
  let inBlock = false
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (inBlock) {
      if (line.includes('*/')) inBlock = false
      continue
    }
    if (line === '') continue
    if (line.startsWith('//')) continue
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true
      continue
    }
    code++
  }
  return code
}

function measure(): Baseline {
  const apps: Record<string, AppCount> = {}
  let total = 0
  for (const app of APPS) {
    const src = join(REPO_ROOT, 'examples', app, 'src')
    const files = walk(src)
    let code = 0
    for (const f of files) code += countCodeLines(readFileSync(f, 'utf8'))
    apps[app] = { code, files: files.length }
    total += code
  }
  return { total, apps }
}

function main(argv: string[]): number {
  const update = argv.includes('--update')
  const json = argv.includes('--json')
  const current = measure()

  if (json) {
    console.log(JSON.stringify(current, null, 2))
    return 0
  }

  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`[check-app-loc] baseline written: ${current.total} code lines`)
    console.log('Review the diff — this file only moves DOWN except when the app list changes.')
    return 0
  }

  let baseline: Baseline
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline
  } catch {
    console.log('[check-app-loc] no baseline yet — run with --update to record one.')
    return 0
  }

  const grown: string[] = []
  for (const app of APPS) {
    const now = current.apps[app]?.code ?? 0
    const was = baseline.apps[app]?.code ?? 0
    if (now > was) grown.push(`  ${app}: ${was} → ${now} (+${now - was})`)
  }

  if (grown.length > 0) {
    console.error('[check-app-loc] ✗ reference apps GREW:')
    console.error(grown.join('\n'))
    console.error('')
    console.error('An app needing more code is the regression this gate exists to catch.')
    console.error('If the growth is a genuine new FEATURE in the example rather than')
    console.error('boilerplate, re-record with `--update` and say so in the PR.')
    return 1
  }

  const delta = baseline.total - current.total
  const suffix = delta > 0 ? ` (−${delta} since the baseline — run --update to lock it in)` : ''
  console.log(`[check-app-loc] ✓ ${current.total} code lines across ${APPS.length} apps${suffix}`)
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
