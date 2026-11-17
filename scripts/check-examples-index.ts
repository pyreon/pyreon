#!/usr/bin/env bun
/**
 * check-examples-index — `examples/README.md` lists every example, and only
 * examples that exist.
 *
 * The README is the one place that says which example directories are worth
 * reading and which are fixtures, harnesses or device-gate hosts. An index
 * that silently misses a new example, or still links a removed one, is worse
 * than none, so every add, move or removal has to update it in the same PR.
 *
 * Rules:
 *   - every workspace directory under `examples/` (a directory with a
 *     `package.json`, at any depth below a group folder) is linked as
 *     `](./<path>/)`;
 *   - every `](./<path>/)` link in the README resolves to such a directory.
 *
 * Usage: bun scripts/check-examples-index.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listExampleDirs, REPO_ROOT } from './example-dirs'

/** The `./<path>/` directory links in the README, without the `./` and trailing `/`. */
export function readmeExampleLinks(readme: string): string[] {
  const links = new Set<string>()
  for (const m of readme.matchAll(/\]\(\.\/([^)\s#]+?)\/?\)/g)) links.add(m[1]!.replace(/\/+$/, ''))
  return [...links].sort()
}

export interface IndexProblems {
  /** Example directories the README does not link. */
  unlisted: string[]
  /** README links that name no example directory. */
  dangling: string[]
}

export function compareExamplesIndex(exampleDirs: readonly string[], links: readonly string[]): IndexProblems {
  const dirs = new Set(exampleDirs)
  const linked = new Set(links)
  return {
    unlisted: exampleDirs.filter((d) => !linked.has(d)),
    dangling: links.filter((l) => !dirs.has(l)),
  }
}

function main(): void {
  const examplesRoot = join(REPO_ROOT, 'examples')
  const readmePath = join(examplesRoot, 'README.md')
  if (!existsSync(readmePath)) {
    console.error('[check-examples-index] ✗ examples/README.md is missing. Add it: it is the index of every example.')
    process.exit(1)
  }
  // The shared listing throws on an empty scan; keep this gate's own message.
  const dirs = listExampleDirs(REPO_ROOT, { allowNone: true })
  if (dirs.length === 0) {
    console.error('[check-examples-index] ✗ found ZERO example directories under examples/ — the scan is wrong.')
    process.exit(1)
  }
  const { unlisted, dangling } = compareExamplesIndex(dirs, readmeExampleLinks(readFileSync(readmePath, 'utf8')))
  if (unlisted.length === 0 && dangling.length === 0) {
    console.log(`[check-examples-index] OK — examples/README.md links all ${dirs.length} examples.`)
    return
  }
  for (const d of unlisted)
    {console.error(`[check-examples-index] ✗ examples/${d} is not in examples/README.md. Add a row linking ](./${d}/) with one line on what it shows or tests.`)}
  for (const l of dangling)
    {console.error(`[check-examples-index] ✗ examples/README.md links ./${l}/, which is not an example directory. Remove or fix the row.`)}
  process.exit(1)
}

if (import.meta.main) main()
