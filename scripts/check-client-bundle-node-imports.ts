#!/usr/bin/env bun
/**
 * check-client-bundle-node-imports — guard against Node-only modules
 * leaking into client-safe published packages.
 *
 * ## The bug class
 *
 * `@pyreon/zero`'s main entry is documented as "browser-safe — no
 * node:fs, node:path, or other server-only imports" (see
 * `packages/zero/zero/src/index.ts:1-12`). Server-only code lives at
 * subpath imports (`@pyreon/zero/server`, `@pyreon/zero/favicon`,
 * etc.).
 *
 * PR #1125 first cut shipped a regression: `i18n-routing.ts` (which
 * is exported from the main entry via `useLocale`/`setLocale`/...) added
 * `import { AsyncLocalStorage } from 'node:async_hooks'` at module
 * scope. This pulled `node:async_hooks` into the BROWSER bundle. The
 * browser couldn't resolve it, hydration broke, ssr-showcase e2e
 * failed on `counter doesn't increment` + the `theme toggle silent`.
 *
 * The root cause is structural: any client-safe published package
 * that statically imports `node:*` is broken in the browser. This
 * gate catches the regression at CI time so it never ships.
 *
 * ## How it works
 *
 * For each package in `CLIENT_SAFE_PACKAGES`:
 *
 *  1. Read its main-entry build target (the file pointed at by
 *     `package.json#exports['.'].import`).
 *  2. Walk the file's `import` / `export from` statements
 *     transitively, following relative paths within the package.
 *  3. Collect every bare specifier starting with `node:`.
 *  4. Fail if any are found.
 *
 * The check operates on TypeScript source files (not bundled output)
 * because static `import 'node:fs'` at module scope leaks regardless
 * of whether Vite tree-shakes it — the bundler emits the import,
 * the browser fails to resolve it. The TS-level walk is faster than
 * a full Vite bundle pass and catches the bug at the same precision.
 *
 * ## Scope
 *
 * Only packages explicitly declared `client-safe` are checked.
 * Server-only packages (`@pyreon/server`, `@pyreon/runtime-server`,
 * `@pyreon/vite-plugin`, etc.) legitimately use `node:*` modules.
 * The list is the authoritative source — add a package only when
 * its main entry is documented as client-safe.
 *
 * Run:
 *   bun run check-client-bundle-node-imports         # exit non-zero on violations
 *   bun run check-client-bundle-node-imports --json  # machine-readable
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
const JSON_MODE = process.argv.includes('--json')

/**
 * Packages whose main `import` entry must be browser-safe.
 *
 * Add a package here only when its `package.json#exports['.'].import`
 * is documented as client-safe. Server-only packages (entire
 * `runtime-server`, `server`, `vite-plugin` etc.) and packages with
 * a separate `/server` subpath split must NOT be added — their
 * main entry legitimately uses `node:*`.
 *
 * The list is the authoritative source. A package added here gets
 * its main-entry source walked transitively; any `node:*` import in
 * the reachable file set fails the gate.
 */
const CLIENT_SAFE_PACKAGES: ReadonlyArray<{
  pkg: string
  dir: string
}> = [
  // @pyreon/zero — main entry is docstring-marked client-safe; server
  // code at `@pyreon/zero/server`. The PR-S7 regression was here.
  { pkg: '@pyreon/zero', dir: 'packages/zero/zero' },
]

interface Finding {
  package: string
  file: string
  importedFrom: string
  nodeSpecifier: string
}

function readPackageJson(dir: string): Record<string, unknown> {
  const path = join(dir, 'package.json')
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * Resolve the main entry source file from package.json exports.
 *
 * Prefers the `bun` condition (Pyreon's workspace convention — points
 * at `src/index.ts`), falls back to `import` (points at `lib/index.js`
 * but TS source is colocated at `src/index.ts`).
 */
function resolveMainEntrySource(pkgDir: string): string | null {
  const pkg = readPackageJson(pkgDir)
  const exports = pkg.exports as Record<string, unknown> | undefined
  if (!exports) return null
  const rootExport = exports['.']
  if (typeof rootExport !== 'object' || rootExport === null) return null
  const conds = rootExport as Record<string, unknown>
  const bunPath = typeof conds.bun === 'string' ? conds.bun : null
  if (bunPath) {
    const full = join(pkgDir, bunPath)
    if (existsSync(full)) return full
  }
  // Fall back to deriving src/index.ts from any of the .js paths
  const candidates = ['src/index.ts', 'src/index.tsx']
  for (const c of candidates) {
    const full = join(pkgDir, c)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Extract every static import / export-from specifier from a TS source
 * string. Returns the raw specifier text (`./foo`, `node:async_hooks`,
 * `@pyreon/core`, etc.).
 *
 * Uses a deliberate regex — full AST parsing would be more correct but
 * is expensive and TS comments-in-strings shapes that fool the regex are
 * rare in practice. For false-positive defense, lines starting with `//`
 * or inside `/* ... *​/` are stripped first.
 */
function extractSpecifiers(source: string): string[] {
  // Strip block comments first (multi-line). Then strip line comments.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  const specs: string[] = []
  // Match: `import ... from '...'` / `export ... from '...'`.
  // Captures both the `type` keyword (group 1) and the quoted
  // specifier (group 2). `import type` / `export type` statements
  // are TypeScript-erased — they never reach the runtime graph and
  // therefore can't pull a module into the browser bundle.
  const importRe =
    /(?:^|[\s;}])(?:import|export)\s+(type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(stripped)) !== null) {
    // Skip type-only imports/exports — they're erased by tsc/esbuild
    // before the bundler ever sees them, so a `node:*` type-import
    // (rare but legitimate — pulls a type from a Node lib) doesn't
    // leak into the client bundle.
    if (m[1] /* "type " */) continue
    if (m[2]) specs.push(m[2])
  }
  // Also catch dynamic imports `import('x')` — these DO bundle (Vite
  // chunks them) but a `node:*` dynamic import is still broken in the
  // browser at runtime. Worth flagging.
  //
  // Exception: when the dynamic import is awaited inside a function
  // body that's only invoked from server-side hooks (e.g. Vite's
  // `configureServer`), the chunk is server-only and safe. We can't
  // reliably distinguish "called from server hook" at the static
  // level — so we skip dynamic imports entirely. The bug class this
  // gate exists to catch is STATIC `import 'node:X'` at module
  // scope (the PR-S7 first-cut shape).
  return specs
}

/**
 * Walk reachable files from the entry, transitively following relative
 * imports within the same package. Returns the set of `node:*`
 * specifiers found along with the source file each came from.
 */
function walkPackage(
  pkgName: string,
  entryPath: string,
  pkgDir: string,
): Finding[] {
  const findings: Finding[] = []
  const visited = new Set<string>()
  const queue: string[] = [entryPath]

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

    const specs = extractSpecifiers(source)
    for (const spec of specs) {
      if (spec.startsWith('node:')) {
        findings.push({
          package: pkgName,
          file: file.slice(pkgDir.length + 1),
          importedFrom: file.slice(pkgDir.length + 1),
          nodeSpecifier: spec,
        })
        continue
      }
      // Follow relative imports (stay within the package source).
      if (spec.startsWith('.')) {
        const baseDir = dirname(file)
        // Try resolving with common TS extensions
        for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
          const candidate = resolve(baseDir, `${spec}${ext}`)
          if (existsSync(candidate)) {
            queue.push(candidate)
            break
          }
        }
      }
    }
  }
  return findings
}

// ─── Run ────────────────────────────────────────────────────────────────────

const allFindings: Finding[] = []
const skipped: string[] = []

for (const { pkg, dir } of CLIENT_SAFE_PACKAGES) {
  const pkgDir = join(REPO_ROOT, dir)
  if (!existsSync(pkgDir)) {
    skipped.push(`${pkg} (directory not found at ${dir})`)
    continue
  }
  const entry = resolveMainEntrySource(pkgDir)
  if (!entry) {
    skipped.push(`${pkg} (could not resolve main entry source)`)
    continue
  }
  const findings = walkPackage(pkg, entry, pkgDir)
  allFindings.push(...findings)
}

if (JSON_MODE) {
  console.log(JSON.stringify({ findings: allFindings, skipped }, null, 2))
  process.exit(allFindings.length > 0 ? 1 : 0)
}

if (skipped.length > 0) {
  for (const s of skipped) {
    console.warn(`[check-client-bundle-node-imports] WARN: skipped ${s}`)
  }
}

if (allFindings.length === 0) {
  console.log(
    `[check-client-bundle-node-imports] OK — ${CLIENT_SAFE_PACKAGES.length} client-safe package(s) checked, no node:* imports found in any reachable source.`,
  )
  process.exit(0)
}

console.error(
  `[check-client-bundle-node-imports] FAILED — ${allFindings.length} node:* import(s) found in client-safe package source:`,
)
console.error('')
for (const f of allFindings) {
  console.error(
    `  ${f.package} → ${f.file} imports "${f.nodeSpecifier}" (NODE-ONLY MODULE)`,
  )
}
console.error('')
console.error(
  'Client-safe packages must not statically import node:* modules — the browser cannot resolve them.',
)
console.error('Fix options:')
console.error('  1. Move the Node-using code to a server-only file and import it lazily from a Vite plugin hook.')
console.error('     (See `packages/zero/zero/src/i18n-routing-als.ts` for the setter-pattern bridge.)')
console.error('  2. Re-export the affected helpers from a `@pyreon/<pkg>/server` subpath instead of the main entry.')
console.error('')
console.error(
  'Reference precedent: PR #1125 first cut broke ssr-showcase e2e by adding `import "node:async_hooks"` to a client-safe file.',
)
process.exit(1)
