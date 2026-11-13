/**
 * A5 — zero app budget + client-leak checks, run against REAL build output by
 * `scripts/verify-modes.ts` cells.
 *
 * Two questions, both about what the browser actually downloads:
 *
 *   1. Did server-only code reach the client? `node:*` imports, the
 *      `.server.*` sibling's sentinel, and a server ACTION handler's sentinel
 *      must be absent from every client asset. The directory walked must
 *      EXIST and CONTAIN JavaScript — the previous `.server.*` check
 *      returned silently on a missing directory, so a layout change could
 *      turn it into a vacuous pass.
 *
 *   2. How much JS does each route's first load cost? For every prerendered
 *      route HTML: every `<script type="module" src>` and `modulepreload`,
 *      plus the transitive closure of their STATIC imports (dynamic
 *      `import()` is deferred work, not first-load), gzipped and summed.
 *      Judged by `check-route-budgets` against `scripts/size-budgets/apps/`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import {
  type BaseFamily,
  formatVerdicts,
  judgeFamily,
  resolveBasePath,
  resolveSizeMode,
  ROUTE_NOISE_BYTES,
  type SizeBaseFile,
  type SizeMode,
} from './size-budget-policy'
import { loadCeilings } from './size-budget-store'

/** Every file under `dir` (recursive). */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath ?? dir, e.name))
}

/**
 * `node:` specifiers in STATIC or DYNAMIC import / require position. A plain
 * string "node:fs" in data is not an import and is not flagged.
 */
const NODE_IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'`](node:[a-z_/]+)["'`]/g

export interface ClientLeakOptions {
  /** Sentinels that must appear in NO client file. */
  forbiddenSentinels: string[]
}

/**
 * Throws when any client asset leaks server-only code. `clientDir` must exist
 * and contain at least one `.js` file — an empty walk is a failure, never a pass.
 */
export function assertClientClean(clientDir: string, opts: ClientLeakOptions): void {
  if (!existsSync(clientDir)) {
    throw new Error(`[zero-app-checks] client dir ${clientDir} does not exist — nothing was checked`)
  }
  const files = walk(clientDir)
  const js = files.filter((f) => /\.m?js$/.test(f))
  if (js.length === 0) {
    throw new Error(`[zero-app-checks] no .js files under ${clientDir} — nothing was checked`)
  }
  const problems: string[] = []
  for (const f of files) {
    if (!/\.(m?js|html|css|json|map)$/.test(f)) continue
    const text = readFileSync(f, 'utf-8')
    for (const s of opts.forbiddenSentinels) {
      if (text.includes(s)) problems.push(`${relative(clientDir, f)} contains server-only sentinel "${s}"`)
    }
    if (/\.m?js$/.test(f)) {
      for (const m of text.matchAll(NODE_IMPORT_RE)) {
        problems.push(`${relative(clientDir, f)} imports "${m[1]}"`)
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`[zero-app-checks] server code reached the client bundle:\n  ${problems.join('\n  ')}`)
  }
}

/** Relative static-import specifiers of a (minified) ES module. */
export function staticImports(code: string): string[] {
  const out: string[] = []
  // `import x from "./a.js"`, `import{a}from"./a.js"`, `import"./a.js"`,
  // `export{a}from"./a.js"`, `export*from"./a.js"` — never `import(`.
  const re = /\b(?:import|export)\b(?!\s*\()[^'"`;]*?["'`](\.{1,2}\/[^"'`]+?\.m?js)["'`]/g
  for (const m of code.matchAll(re)) out.push(m[1] as string)
  return out
}

/** Absolute paths of the JS a page references in its HTML (entry + preloads). */
export function htmlEntryScripts(html: string, clientDir: string, base = '/'): string[] {
  const refs: string[] = []
  for (const m of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g)) {
    refs.push(m[1] as string)
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/g)) {
    refs.push(m[1] as string)
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g)) {
    refs.push(m[1] as string)
  }
  const out = new Set<string>()
  for (const r of refs) {
    if (/^(https?:)?\/\//.test(r)) continue
    const path = r.startsWith(base) ? r.slice(base.length) : r.replace(/^\//, '')
    out.add(resolve(clientDir, path))
  }
  return [...out]
}

/**
 * Gzipped bytes of the first-load JS closure for a page's HTML.
 *
 * `checkoutRoot`, when given, is removed from the code before it is measured.
 * A zero build writes the absolute path of every route module into the client
 * route table, so the same commit built in two directories differs (measured:
 * 374 raw bytes, 13 to 16 B gzipped, between two checkouts of one commit of
 * ssr-showcase). A size that depends on where the repository is checked out is
 * not a property of the code, and the base of a pull request is necessarily
 * built in a different directory than its head.
 */
export function firstLoadJsGzip(
  htmlPath: string,
  clientDir: string,
  checkoutRoot?: string,
): { bytes: number; files: number } {
  const seen = new Set<string>()
  const queue = htmlEntryScripts(readFileSync(htmlPath, 'utf-8'), clientDir)
  if (queue.length === 0) {
    throw new Error(`[zero-app-checks] ${htmlPath} references no module script — nothing to measure`)
  }
  let bytes = 0
  while (queue.length > 0) {
    const f = queue.pop() as string
    if (seen.has(f)) continue
    seen.add(f)
    if (!existsSync(f)) throw new Error(`[zero-app-checks] ${htmlPath} references missing ${f}`)
    const raw = readFileSync(f, 'utf-8')
    const code = checkoutRoot ? raw.replaceAll(checkoutRoot, '') : raw
    bytes += gzipSync(code, { level: 9 }).length
    for (const spec of staticImports(raw)) queue.push(resolve(dirname(f), spec))
  }
  return { bytes, files: seen.size }
}

/** `<example>:<route>` → the route's prerendered HTML, for `ssg.format: 'directory'`. */
export function routeHtmlMap(dist: string, routes: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    routes.map((route) => [route, join(dist, ...route.split('/').filter(Boolean), 'index.html')]),
  )
}

/** Gzipped first-load JS per route, keyed `<example>:<route>`. */
export function measureRoutes(
  example: string,
  clientDir: string,
  routes: Record<string, string>,
  checkoutRoot?: string,
): Record<string, number> {
  const sizes: Record<string, number> = {}
  for (const [route, html] of Object.entries(routes)) {
    sizes[`${example}:${route}`] = firstLoadJsGzip(html, clientDir, checkoutRoot).bytes
  }
  return sizes
}

/** Adds `sizes` to the JSON object in `file` (created when absent). */
export function recordRouteSizes(file: string, sizes: Record<string, number>): void {
  const prev = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as Record<string, number>) : {}
  writeFileSync(file, `${JSON.stringify({ ...prev, ...sizes }, null, 2)}\n`)
}

/**
 * Judges measured route sizes and throws on a failing verdict.
 *
 * `measuredIds` must cover every route that has a ceiling for the examples
 * measured: a ceiling whose route was not measured fails, so a cell that stops
 * running cannot leave its ceilings guarding nothing.
 */
export function judgeRouteSizes(
  sizes: Record<string, number>,
  ceilings: Record<string, number>,
  mode: SizeMode,
  base: BaseFamily | undefined,
): { lines: string[]; failed: number } {
  const verdicts = judgeFamily(
    mode,
    Object.entries(sizes).map(([id, size]) => ({ id, size, ceiling: ceilings[id] })),
    base,
    ROUTE_NOISE_BYTES,
  )
  const { lines, failed } = formatVerdicts('route first-load JS', mode, verdicts)
  const unmeasured = Object.keys(ceilings).filter((id) => !(id in sizes))
  for (const id of unmeasured) {
    lines.unshift(`  ✗ ${id}: has a ceiling but was not measured. Its verify-modes cell did not run, or the route was removed (then remove the ceiling).`)
  }
  return { lines, failed: failed + unmeasured.length }
}

/**
 * Called from a verify-modes cell with the routes it just built.
 *
 * With `PYREON_SIZE_ROUTES_OUT` set (CI), the sizes are recorded there and the
 * `Check Route Budgets` step judges them. Without it the verdict is given
 * here, in the mode `PYREON_SIZE_MODE` names (a local run: ceilings reported,
 * only a missing ceiling fails).
 */
export function checkRouteSizes(
  example: string,
  clientDir: string,
  routes: Record<string, string>,
  budgetsDir: string,
  checkoutRoot?: string,
): void {
  const sizes = measureRoutes(example, clientDir, routes, checkoutRoot)
  const out = process.env['PYREON_SIZE_ROUTES_OUT']
  if (out) {
    recordRouteSizes(out, sizes)
    return
  }
  const mode = resolveSizeMode([], process.env)
  const basePath = resolveBasePath([], process.env)
  const base =
    mode === 'pr' && basePath ? (JSON.parse(readFileSync(basePath, 'utf-8')) as SizeBaseFile).routes : undefined
  const all = loadCeilings(budgetsDir).routes
  const ceilings = Object.fromEntries(Object.entries(all).filter(([id]) => id.startsWith(`${example}:`)))
  const { lines, failed } = judgeRouteSizes(sizes, ceilings, mode, base)
  if (failed > 0) throw new Error(`[route-size]\n${lines.join('\n')}`)
  for (const line of lines) console.log(`[route-size] ${line.trim()}`)
}
