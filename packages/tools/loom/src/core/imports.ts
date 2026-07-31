/**
 * Source-import scan — which bare package specifiers each workspace member's
 * code actually imports, split into PROD surface (shipping source) and DEV
 * surface (tests, config, scripts, benches).
 *
 * Deliberately a lexical scan (import / export-from / dynamic import /
 * require specifiers), not a full parse: it runs across a whole monorepo in
 * seconds and the specifier grammar is regular. The known cost is honest and
 * bounded — a specifier mentioned only inside a comment or string can
 * false-positive; detectors that consume this therefore phrase their
 * findings as evidence-with-files, and `unused-dep` (where a lexical miss
 * would ACCUSE wrongly) stays `info` severity.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ImportScan {
  /** package name → bare specifiers imported from PROD source. */
  prod: Map<string, Map<string, string[]>>
  /** package name → bare specifiers imported from DEV surface. */
  dev: Map<string, Map<string, string[]>>
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/

/**
 * Strip comments and TEMPLATE-LITERAL contents before scanning.
 *
 * The dogfood run made the need concrete: a CLI's recipe catalog and a
 * manifest's example blocks carry entire `import … from '@pyreon/x'` LINES
 * inside backtick strings — code-shaped PROSE. Real import specifiers live in
 * ordinary quotes; template contents are data. The stripper is lexical
 * (single pass, tracks '/'"/backtick/comment state, honors escapes) — not a
 * parser, and documented as such.
 */
export function stripNonCode(text: string): string {
  return stripWithMask(text).stripped
}

/**
 * The stripped view PLUS a per-output-char "was this char in CODE mode"
 * mask. String CONTENTS survive in the stripped view (an import's specifier
 * IS a string), but a `from '…'` sequence living INSIDE another string —
 * a lint rule's fix message, a diagnose catalog's fix-code, a generated
 * api-reference example — must not scan as an import: the STATEMENT KEYWORD
 * has to sit in code. The scanner checks the keyword position against this
 * mask.
 */
export function stripWithMask(text: string): { stripped: string; codeAt: boolean[] } {
  let out = ''
  const codeAt: boolean[] = []
  let i = 0
  const n = text.length
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  const push = (chunk: string, inCode: boolean) => {
    out += chunk
    for (let k = 0; k < chunk.length; k += 1) codeAt.push(inCode)
  }
  while (i < n) {
    const c = text[i]!
    const next = text[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && next === '*') { mode = 'block'; i += 2; continue }
      if (c === '`') { mode = 'template'; i += 1; continue }
      if (c === "'") { mode = 'single'; push(c, true); i += 1; continue }
      if (c === '"') { mode = 'double'; push(c, true); i += 1; continue }
      push(c, true); i += 1; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; push(c, true) } i += 1; continue }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i += 2 } else i += 1; continue }
    if (mode === 'single') {
      if (c === '\\') { push(text.slice(i, i + 2), false); i += 2; continue }
      push(c, false); i += 1
      if (c === "'" || c === '\n') mode = 'code'
      continue
    }
    if (mode === 'double') {
      if (c === '\\') { push(text.slice(i, i + 2), false); i += 2; continue }
      push(c, false); i += 1
      if (c === '"' || c === '\n') mode = 'code'
      continue
    }
    // template: drop contents entirely (interpolations included — an import
    // inside a template is data, and a dynamic import() built from template
    // pieces is unresolvable statically anyway).
    if (c === '\\') { i += 2; continue }
    if (c === '`') { mode = 'code'; i += 1; continue }
    i += 1
  }
  return { stripped: out, codeAt }
}
const SPEC_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"\n]+)['"]/g

/** node builtins (with or without the `node:` prefix) are never dependencies. */
const BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib', 'test', 'sqlite',
])

/** A bare specifier's package-name grammar — rejects the prose a lexical
 * scan can capture from comments and strings (spaces, `https://…`, sentence
 * fragments). npm's own name rules: lowercase-ish, no spaces, no colons. */
const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i

/** `@scope/name/sub/path` → `@scope/name`; `name/sub` → `name`. Null for non-bare. */
export function specifierToPackage(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) return null
  if (spec.includes(':')) return null // node:, https:, data:, virtual:, C:\
  if (/\s/.test(spec)) return null // prose captured from a comment/string
  // Strip query suffixes (vite's `?raw`, `?url`).
  const clean = spec.split('?')[0]!
  const parts = clean.split('/')
  const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
  if (!name || !NAME_RE.test(name)) return null
  if (!clean.startsWith('@') && BUILTINS.has(name)) return null
  return name
}

/** Test/dev-surface classification, aligned with the repo's `isTestPath` idiom. */
export function isDevSurfacePath(relPath: string): boolean {
  if (/(^|\/)(tests?|__tests__|__mocks__|e2e|bench(es)?|scripts|fixtures|templates)(\/|$)/.test(relPath)) return true
  if (/\.(test|spec|stories|bench)\.[a-z]+$/.test(relPath)) return true
  if (/(^|\/)(vitest|vite|playwright|rollup|rolldown|tsup|esbuild)[^/]*\.config\./.test(relPath)) return true
  return false
}

function walkFiles(dir: string, rel: string, out: string[], depthLeft: number): void {
  if (depthLeft === 0) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  // A SUBTREE with its own package.json is a separate unit (a nested vscode
  // extension, a template project) — its imports are declared in ITS
  // manifest, not this package's. Matches how npm scopes file ownership.
  if (rel !== '' && entries.includes('package.json')) return
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'dist' || entry.startsWith('.')) continue
    const abs = join(dir, entry)
    const r = rel ? `${rel}/${entry}` : entry
    if (SOURCE_EXT.test(entry)) {
      out.push(r)
    } else if (!entry.includes('.')) {
      walkFiles(abs, r, out, depthLeft - 1)
    }
  }
}

/** Scan one package directory. Returns specifier → files (relative) per surface. */
export function scanPackageImports(pkgAbsDir: string): {
  prod: Map<string, string[]>
  dev: Map<string, string[]>
} {
  const files: string[] = []
  walkFiles(pkgAbsDir, '', files, 8)
  const prod = new Map<string, string[]>()
  const dev = new Map<string, string[]>()
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(join(pkgAbsDir, file), 'utf8')
    } catch {
      continue
    }
    const bucket = isDevSurfacePath(file) ? dev : prod
    const { stripped, codeAt } = stripWithMask(text)
    for (const m of stripped.matchAll(SPEC_RE)) {
      // The match STARTS at the statement keyword (`from`/`import`/`require`)
      // — that position must be CODE, not the inside of a string.
      if (codeAt[m.index] === false) continue
      const name = specifierToPackage(m[1]!)
      if (!name) continue
      const list = bucket.get(name) ?? []
      if (list.length < 5) list.push(file)
      bucket.set(name, list)
    }
  }
  return { prod, dev }
}

/** Scan every workspace member. */
export function scanImports(rootDir: string, packages: { name: string; dir: string }[]): ImportScan {
  const prod = new Map<string, Map<string, string[]>>()
  const dev = new Map<string, Map<string, string[]>>()
  for (const p of packages) {
    const scan = scanPackageImports(join(rootDir, p.dir))
    prod.set(p.name, scan.prod)
    dev.set(p.name, scan.dev)
  }
  return { prod, dev }
}
