/**
 * Counter catalog drift test.
 *
 * Enforces the bidirectional contract between `COUNTERS.md` (the canonical
 * list) and the actual call sites that emit counter writes:
 *
 *   1. Every `globalThis.__pyreon_count__?.('X')` call in any framework
 *      package must have `X` listed in the catalog.
 *   2. Every name listed in the catalog must have at least one emitting
 *      call site.
 *
 * Why this test is load-bearing: counter names are string literals. TypeScript
 * cannot validate them. Without drift enforcement, a PR could (a) add a new
 * counter without documenting it, (b) rename a counter and leave the old
 * name in the docs, or (c) remove a counter from the code but leave it in
 * the overlay's filter list. Any of these silently degrade the observability
 * story over time.
 *
 * This test runs in the harness package so the catalog owner is the same
 * place as the counter sink.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../..')
const CATALOG_PATH = resolve(HERE, '../../COUNTERS.md')

// Packages allowed to emit counters. Adding a new package here is deliberate
// (cross-check matches the catalog's `Emitted from` column).
const INSTRUMENTED_PACKAGE_ROOTS = [
  'packages/core/reactivity/src',
  'packages/core/runtime-dom/src',
  'packages/core/router/src',
  'packages/ui-system/styler/src',
  'packages/ui-system/unistyle/src',
  'packages/ui-system/rocketstyle/src',
]

// Matches `globalThis.__pyreon_count__?.('<name>')` or the non-optional
// `globalThis.__pyreon_count__('<name>')` form.
const COUNT_CALL_RE =
  /globalThis\.__pyreon_count__\??\.?\(\s*['"]([^'"]+)['"](?:\s*,[^)]*)?\)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'lib' || name === 'tests' || name === '__tests__')
        continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function extractEmittedNames(): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  for (const rootRel of INSTRUMENTED_PACKAGE_ROOTS) {
    const root = resolve(REPO_ROOT, rootRel)
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      for (const match of src.matchAll(COUNT_CALL_RE)) {
        const name = match[1]
        if (!name) continue
        const list = byName.get(name) ?? []
        list.push(file.replace(`${REPO_ROOT}/`, ''))
        byName.set(name, list)
      }
    }
  }
  return byName
}

function extractCatalogNames(): Set<string> {
  const md = readFileSync(CATALOG_PATH, 'utf8')
  const names = new Set<string>()
  // Match markdown-table rows starting with a backticked counter name:
  // `| ` + `` ` `` + <name> + `` ` `` + ` |`
  const rowRe = /^\|\s*`([a-z][a-z0-9.-]+)`\s*\|/gim
  for (const match of md.matchAll(rowRe)) {
    const name = match[1]
    if (name) names.add(name)
  }
  return names
}

describe('counter catalog drift', () => {
  const emitted = extractEmittedNames()
  const cataloged = extractCatalogNames()

  it('finds at least one counter in each instrumented package', () => {
    // Defensive: if this ever trips, it means the walker isn't reaching a
    // package that should be instrumented (broken glob? moved package?).
    for (const rootRel of INSTRUMENTED_PACKAGE_ROOTS) {
      const layer = rootRel.split('/').at(-2) === 'runtime-dom'
        ? 'runtime'
        : (rootRel.split('/').at(-2) as string)
      const hasAny = [...emitted.keys()].some((n) => n.startsWith(`${layer}.`))
      expect(hasAny, `no counters emitted for layer ${layer} (${rootRel})`).toBe(true)
    }
  })

  it('every emitted counter name is listed in COUNTERS.md', () => {
    const emittedNames = [...emitted.keys()].sort()
    const undocumented = emittedNames.filter((n) => !cataloged.has(n))
    expect(
      undocumented,
      `Undocumented counters found in source. Add them to packages/internals/perf-harness/COUNTERS.md:\n${undocumented
        .map((n) => `  - ${n} (in ${(emitted.get(n) ?? []).join(', ')})`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('every cataloged counter name has at least one emitter', () => {
    const dead = [...cataloged].filter((n) => !emitted.has(n))
    expect(
      dead,
      `Stale entries in COUNTERS.md — no code emits these anymore:\n${dead
        .map((n) => `  - ${n}`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('catalog has at least 15 counters', () => {
    // Sanity check: if this drops way below, someone probably broke the
    // markdown table parser and the other tests pass trivially.
    expect(cataloged.size).toBeGreaterThanOrEqual(15)
  })
})
