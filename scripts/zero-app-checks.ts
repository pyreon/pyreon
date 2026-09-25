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
 *      Locked in `scripts/zero-app-budgets.json`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

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

/** Gzipped bytes of the first-load JS closure for a page's HTML. */
export function firstLoadJsGzip(htmlPath: string, clientDir: string): { bytes: number; files: number } {
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
    const code = readFileSync(f)
    bytes += gzipSync(code, { level: 9 }).length
    for (const spec of staticImports(code.toString('utf-8'))) queue.push(resolve(dirname(f), spec))
  }
  return { bytes, files: seen.size }
}

export interface AppBudgets {
  /** `<example>:<route>` → max gzipped first-load JS bytes. */
  budgets: Record<string, number>
}

/**
 * Measures each route and compares to its locked budget. A route with no
 * budget entry fails (a new route is locked deliberately, not implicitly).
 * `PYREON_ZERO_BUDGETS_REPORT=1` prints the measurements for re-locking.
 */
export function assertRouteBudgets(
  example: string,
  clientDir: string,
  routes: Record<string, string>,
  budgetsFile: string,
): void {
  const { budgets } = JSON.parse(readFileSync(budgetsFile, 'utf-8')) as AppBudgets
  const problems: string[] = []
  for (const [route, html] of Object.entries(routes)) {
    const key = `${example}:${route}`
    const { bytes, files } = firstLoadJsGzip(html, clientDir)
    if (process.env['PYREON_ZERO_BUDGETS_REPORT']) {
      console.log(`[zero-app-budget] ${key}: ${bytes} B gz across ${files} file(s)`)
    }
    const limit = budgets[key]
    if (limit === undefined) problems.push(`${key}: no budget in ${budgetsFile} (measured ${bytes} B gz)`)
    else if (bytes > limit) {
      problems.push(
        `${key}: first-load JS is ${bytes} B gz, budget ${limit} B (+${bytes - limit}). ` +
          `If the growth is intended, raise THIS entry by hand and say why in the PR.`,
      )
    }
  }
  if (problems.length > 0) throw new Error(`[zero-app-budget]\n  ${problems.join('\n  ')}`)
}
