import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ─── Client-safe main-entry regression (bokisch.com build warning) ───────────
//
// `@pyreon/zero`'s main entry is client-safe — a consumer's BROWSER build
// imports it. The `node:async_hooks` ALS module (`i18n-routing-als.ts`) must
// never be reachable from it, because Vite/Rolldown then creates the
// `i18n-routing-als` chunk in the browser graph and emits:
//   [plugin rolldown:vite-resolve] Module "node:async_hooks" has been
//   externalized for browser compatibility, imported by "…/i18n-routing-als.ts"
// That's the exact warning bokisch.com hit. The fix moved the only reference
// (the `await import('./i18n-routing-als')` inside the server-only `i18nRouting`
// plugin) out of the client-reachable `i18n-routing.ts` into `i18n-routing-plugin.ts`
// (exported only from `@pyreon/zero/server`).
//
// This test models exactly what makes Vite emit the chunk: it walks the module
// graph from the main entry following BOTH static imports AND **relative
// dynamic imports** (`import('./x')` — Vite always chunks those, so they're
// reachable for bundling purposes even when they only RUN server-side), and
// asserts no reachable module statically imports `node:async_hooks`.
//
// Why a static walk rather than a real `vite build`: calling Vite's `build()`
// INSIDE vitest runs in vitest's own Vite context, which changes warning
// routing AND tree-shaking/chunking vs a standalone consumer build — verified,
// it does not reproduce. The static reachability walk is deterministic, fast,
// and is the faithful model of Rolldown's "reachable relative import → chunk"
// behavior. (The production gate `check-client-bundle-node-imports` deliberately
// does NOT follow dynamic imports — that's the gap that let this ship; this
// test closes it for the specific client-safe `@pyreon/zero` main entry.)
//
// Bisect contract: re-introduce a client-reachable `await import('./i18n-routing-als')`
// (e.g. back in `i18n-routing.ts`) → als becomes reachable → `node:async_hooks`
// found → this test fails naming the path. Keep it in the server-only plugin
// module → als unreachable → pass.

const here = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(here, '..')
const MAIN_ENTRY = join(SRC_DIR, 'index.ts')

/** Static `import/export … from './x'` specifiers (type-only skipped). */
const STATIC_RE =
  /(?:^|[\s;}])(?:import|export)\s+(type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g
/** Dynamic `import('./x')` specifiers. */
const DYNAMIC_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function specifiers(source: string): { node: string[]; relative: string[] } {
  const node: string[] = []
  const relative: string[] = []
  const add = (spec: string): void => {
    if (spec.startsWith('node:')) node.push(spec)
    else if (spec.startsWith('.')) relative.push(spec)
  }
  let m: RegExpExecArray | null
  while ((m = STATIC_RE.exec(source)) !== null) {
    if (m[1]) continue // type-only — erased before bundling
    if (m[2]) add(m[2])
  }
  while ((m = DYNAMIC_RE.exec(source)) !== null) {
    if (m[1]) add(m[1])
  }
  return { node, relative }
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = dirname(fromFile)
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
    const candidate = resolve(base, `${spec}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** node:* specifiers reachable from MAIN_ENTRY via static + relative-dynamic imports. */
function reachableNodeImports(): string[] {
  const visited = new Set<string>()
  const queue: string[] = [MAIN_ENTRY]
  const hits: string[] = []
  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const { node, relative } = specifiers(source)
    for (const n of node) hits.push(`${n} (via ${file.slice(SRC_DIR.length + 1)})`)
    for (const rel of relative) {
      const target = resolveRelative(file, rel)
      if (target && target.startsWith(SRC_DIR)) queue.push(target)
    }
  }
  return hits
}

describe('@pyreon/zero main entry — client-safe (no node:* reachable)', () => {
  it('does not reach node:async_hooks (the server-only ALS chain)', () => {
    const reached = reachableNodeImports()
    const asyncHooks = reached.filter((h) => h.startsWith('node:async_hooks'))
    expect(asyncHooks, asyncHooks.join('\n')).toEqual([])
  })
})
