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
  'packages/core/runtime-server/src',
  'packages/core/router/src',
  'packages/core/server/src',
  'packages/ui-system/styler/src',
  'packages/ui-system/unistyle/src',
  'packages/ui-system/rocketstyle/src',
  'packages/fundamentals/form/src',
  'packages/fundamentals/store/src',
  'packages/fundamentals/rx/src',
  'packages/fundamentals/query/src',
  'packages/fundamentals/i18n/src',
  // M2.3 — SSG perf counters live on the zero plugin (build-time, not
  // runtime); the package emits under the `ssg.*` namespace. The zero
  // package also emits `isr.*` (ISR revalidate timer clear) and `theme.*`
  // (ThemeToggle refcount) leak-class diagnostics.
  'packages/zero/zero/src',
  // Post-#741 leak-class diagnostic counters across the compat layers
  // and vite plugin. Each emits under its own namespace (`solid-compat`,
  // `svelte-compat`, `vite-plugin`) — see COUNTERS.md for the list.
  'packages/tools/solid-compat/src',
  'packages/tools/svelte-compat/src',
  'packages/tools/vite-plugin/src',
]

// Some packages emit counters under a namespace that doesn't match the package
// name (e.g. `runtime-dom` emits `runtime.*`, `server` emits `island.*` for
// the islands feature). Map the package directory name to the counter prefix
// used in COUNTERS.md so the per-package "found at least one counter" sanity
// check passes against the actual prefix.
const LAYER_PREFIX_OVERRIDE: Record<string, string> = {
  'runtime-dom': 'runtime',
  server: 'island',
  zero: 'ssg',
}

// Matches any `<ident>.__pyreon_count__?.('<name>')` call — the direct emit
// shape, where the literal sits inside the `__pyreon_count__` call (a locally
// bound `_countSink = globalThis as { ... }` forwarding it straight through).
const COUNT_CALL_RE = /\.__pyreon_count__\??\.?\(\s*['"]([^'"]+)['"](?:\s*,[^)]*)?\)/g

// A package may route its emits through a tiny TDZ-immune forwarder that reads
// `globalThis` at call time instead of a module-const sink — e.g.
//   function _count(name) { (globalThis as …).__pyreon_count__?.(name) }
// then `_count('island.scheduled')` at each site (introduced by #2096 to fix
// an intermittent module-const TDZ crash). The literal then lives at the
// FORWARDER call, and the `__pyreon_count__` call takes a variable — so
// COUNT_CALL_RE sees neither. Match a `function <fwd>(<param>…)` whose body
// forwards that FIRST PARAMETER into `.__pyreon_count__?.(<param>)` (the `\2`
// backref) — this is what distinguishes a forwarder from an ordinary emitter,
// which passes a string LITERAL (and whose own name must NOT be treated as a
// forwarder, else its non-counter string-arg calls become phantom counters).
// Then `<fwd>('<name>')` calls are attributed as emit sites. Bounded
// lookaheads keep the match inside one small function body.
const FORWARDER_DECL_RE =
  /function\s+(\w+)\s*\(\s*(\w+)[^)]*\)[^{]{0,80}\{[\s\S]{0,300}?\.__pyreon_count__\??\.?\(\s*\2\b/g

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
  const record = (name: string | undefined, file: string): void => {
    if (!name) return
    const list = byName.get(name) ?? []
    list.push(file.replace(`${REPO_ROOT}/`, ''))
    byName.set(name, list)
  }
  for (const rootRel of INSTRUMENTED_PACKAGE_ROOTS) {
    const root = resolve(REPO_ROOT, rootRel)
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      // Direct `.__pyreon_count__?.('<name>')` emits.
      for (const match of src.matchAll(COUNT_CALL_RE)) record(match[1], file)
      // Forwarder-indirection emits: find local counter forwarders in this
      // file, then attribute their `<fwd>('<name>')` call sites (same file —
      // a forwarder is module-local). A non-forwarder name never has such a
      // string-literal call, so this only ever ADDS real emit sites.
      const forwarders = new Set<string>()
      for (const m of src.matchAll(FORWARDER_DECL_RE)) if (m[1]) forwarders.add(m[1])
      for (const fwd of forwarders) {
        const callRe = new RegExp(String.raw`\b${fwd}\(\s*['"]([^'"]+)['"]`, 'g')
        for (const m of src.matchAll(callRe)) record(m[1], file)
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
      const pkgDir = rootRel.split('/').at(-2) as string
      const layer = LAYER_PREFIX_OVERRIDE[pkgDir] ?? pkgDir
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
