#!/usr/bin/env bun
/**
 * check-counter-catalog — every dev counter emitted in source has a row in
 * `packages/internals/perf-harness/COUNTERS.md`, and every row has an emitter.
 *
 * The same contract `perf-harness/src/tests/catalog-drift.test.ts` enforces,
 * run as a static gate. That test only runs when perf-harness's tests run (the
 * affected-package closure, or the full coverage run). A PR that adds a
 * counter in a package whose closure does not include perf-harness passed its
 * own CI and turned main red for every later PR whose coverage run did: #4236
 * added `i18n.formatList` that way. This script runs in `validate-fast` and
 * so in CI's Fast Gates for every PR, whatever packages it touches.
 *
 * It scans EVERY package's `src/` (minus tests and build output) rather than
 * the test's hand-kept list of instrumented packages, so a counter added in a
 * package nobody listed yet is caught too.
 *
 * Emit shapes recognised (kept in step with the drift test):
 *   - direct: `<sink>.__pyreon_count__?.('name')`
 *   - a module-local forwarder whose body passes its FIRST PARAMETER to
 *     `__pyreon_count__`, declared as a `function` or a `const`/`let` arrow;
 *     its `fwd('name')` call sites in the same file are the emit sites.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
export const CATALOG_FILE = 'packages/internals/perf-harness/COUNTERS.md'

const COUNT_CALL_RE = /\.__pyreon_count__\??\.?\(\s*['"]([^'"]+)['"](?:\s*,[^)]*)?\)/g
const FORWARDER_DECL_RE =
  /function\s+(\w+)\s*\(\s*(\w+)[^)]*\)[^{]{0,80}\{[\s\S]{0,300}?\.__pyreon_count__\??\.?\(\s*\2\b/g
const FORWARDER_CONST_RE =
  /(?:const|let)\s+(\w+)\s*(?::[^=]{0,120})?=[\s\S]{0,200}?\(\s*(\w+)[^)]{0,60}\)[^=]{0,40}=>[\s\S]{0,300}?\.__pyreon_count__\??\.?\(\s*\2\b/g
const CATALOG_ROW_RE = /^\|\s*`([a-z][a-z0-9.-]+)`\s*\|/gim

/** Counter names one source file emits (direct calls and forwarder call sites). */
export function emittedNames(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(COUNT_CALL_RE)) if (m[1]) out.push(m[1])
  const forwarders = new Set<string>()
  for (const m of source.matchAll(FORWARDER_DECL_RE)) if (m[1]) forwarders.add(m[1])
  for (const m of source.matchAll(FORWARDER_CONST_RE)) if (m[1]) forwarders.add(m[1])
  for (const fwd of forwarders) {
    const callRe = new RegExp(String.raw`\b${fwd}\(\s*['"]([^'"]+)['"]`, 'g')
    for (const m of source.matchAll(callRe)) if (m[1]) out.push(m[1])
  }
  return out
}

/** Counter names with a row in the catalog's markdown tables. */
export function catalogNames(markdown: string): Set<string> {
  const names = new Set<string>()
  for (const m of markdown.matchAll(CATALOG_ROW_RE)) if (m[1]) names.add(m[1])
  return names
}

export interface Drift {
  /** Emitted in source, no catalog row: name → files emitting it. */
  undocumented: [string, string[]][]
  /** Catalog row, emitted nowhere. */
  stale: string[]
}

export function findDrift(emitted: Map<string, string[]>, cataloged: Set<string>): Drift {
  const undocumented = [...emitted]
    .filter(([name]) => !cataloged.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
  const stale = [...cataloged].filter((n) => !emitted.has(n)).sort()
  return { undocumented, stale }
}

const SKIP_DIRS = new Set(['node_modules', 'lib', 'tests', '__tests__', 'dist'])

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
}

/** Every `packages/<group>/<pkg>/src` directory. */
function packageSrcDirs(root: string): string[] {
  const dirs: string[] = []
  const pkgs = join(root, 'packages')
  for (const group of readdirSync(pkgs)) {
    const g = join(pkgs, group)
    if (!statSync(g).isDirectory()) continue
    for (const pkg of readdirSync(g)) {
      const src = join(g, pkg, 'src')
      try {
        if (statSync(src).isDirectory()) dirs.push(src)
      } catch {
        // no src/ (native runtime packages ship Swift/Kotlin source elsewhere)
      }
    }
  }
  return dirs
}

export function scan(root: string): Drift {
  const emitted = new Map<string, string[]>()
  for (const dir of packageSrcDirs(root)) {
    const files: string[] = []
    walk(dir, files)
    for (const file of files) {
      for (const name of emittedNames(readFileSync(file, 'utf8'))) {
        const list = emitted.get(name) ?? []
        list.push(relative(root, file))
        emitted.set(name, list)
      }
    }
  }
  return findDrift(emitted, catalogNames(readFileSync(join(root, CATALOG_FILE), 'utf8')))
}

function main(): void {
  const { undocumented, stale } = scan(ROOT)
  if (undocumented.length === 0 && stale.length === 0) {
    console.log(`✓ counter catalog: every emitted counter has a row in ${CATALOG_FILE}`)
    return
  }
  if (undocumented.length > 0) {
    console.error(`✗ Counters emitted in source with no row in ${CATALOG_FILE}:`)
    for (const [name, files] of undocumented)
      console.error(`  - ${name} (in ${[...new Set(files)].join(', ')})`)
    console.error('  Add a row: | `name` | emitting file | what one increment means |')
  }
  if (stale.length > 0) {
    console.error(`✗ Rows in ${CATALOG_FILE} that no source emits any more:`)
    for (const name of stale) console.error(`  - ${name}`)
    console.error('  Remove the row, or restore the emit if it was dropped by mistake.')
  }
  process.exit(1)
}

if (typeof process.argv[1] === 'string' && process.argv[1].endsWith('check-counter-catalog.ts')) {
  main()
}
