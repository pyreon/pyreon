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
  /** package name → bare specifiers imported at RUNTIME from PROD source. */
  prod: Map<string, Map<string, string[]>>
  /** package name → bare specifiers imported at RUNTIME from DEV surface. */
  dev: Map<string, Map<string, string[]>>
  /**
   * package name → bare specifiers imported TYPE-ONLY, from either surface
   * (`import type` / `export type` statements, and everything in a `.d.ts`).
   * Erased at build, so these are evidence the dep is USED but never evidence
   * that a consumer needs it INSTALLED — the distinction `prod-import-of-dev-dep`
   * and `phantom-dep` both turn on.
   */
  type: Map<string, Map<string, string[]>>
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
 * fragments). npm's own name rules: lowercase-ish, no spaces, no colons.
 *
 * `~` is DELIBERATELY absent: npm names cannot contain it, and `~/…` is the
 * single most common tsconfig path alias. Admitting it made every
 * `import '~/components/X'` scan as a package named `~` and surface as a
 * phantom dep — a warning, so `--strict` failed CI on a non-issue. */
const NAME_RE = /^(@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/i

/** `@scope/name/sub/path` → `@scope/name`; `name/sub` → `name`. Null for non-bare.
 *
 * `aliases` are tsconfig `paths` prefixes (see {@link readTsconfigAliases}):
 * a specifier under one is an INTERNAL path, not a package, however
 * package-shaped it looks (`src/x` with `baseUrl`, `@app/x` with a
 * `"@app/*"` mapping). Omitting the set keeps the pure name grammar. */
export function specifierToPackage(spec: string, aliases?: ReadonlySet<string>): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) return null
  if (spec.includes(':')) return null // node:, https:, data:, virtual:, C:\
  if (/\s/.test(spec)) return null // prose captured from a comment/string
  // Strip query suffixes (vite's `?raw`, `?url`).
  const clean = spec.split('?')[0]!
  const parts = clean.split('/')
  const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
  if (!name || !NAME_RE.test(name)) return null
  if (!clean.startsWith('@') && BUILTINS.has(name)) return null
  if (aliases && (aliases.has(name) || aliases.has(parts[0]!))) return null
  return name
}

/**
 * Read `compilerOptions.paths` prefixes from a package's tsconfig and the
 * workspace root's, so an internal alias is never mistaken for a package.
 *
 * tsconfig is JSONC — comments and trailing commas are legal and common —
 * so it is read through the same lexical stripper the source scan uses
 * (JSON is a subset of the grammar it models) plus a trailing-comma pass.
 * `extends` is followed one RELATIVE level: the dominant monorepo shape is a
 * local base config, and resolving a chain through node_modules would need a
 * module resolver this tool deliberately does not have. A missed alias
 * degrades to the previous behaviour (a possible phantom-dep), never to a
 * wrong graph.
 */
export function readTsconfigAliases(pkgAbsDir: string, rootDir?: string): Set<string> {
  const out = new Set<string>()
  const seen = new Set<string>()
  const visit = (file: string, depthLeft: number): void => {
    if (depthLeft < 0 || seen.has(file)) return
    seen.add(file)
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      return
    }
    // Comments out, trailing commas out — then a plain JSON parse.
    const text = stripNonCode(raw).replace(/,(\s*[}\]])/g, '$1')
    let json: { compilerOptions?: { paths?: Record<string, unknown> }; extends?: unknown }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      return // an unparseable tsconfig is not a reason to fail a dep scan
    }
    for (const key of Object.keys(json.compilerOptions?.paths ?? {})) {
      // `~/*` → `~`; `@app/*` → `@app`; a bare `foo` stays `foo`.
      const prefix = key.replace(/\/\*$/, '').replace(/\*$/, '')
      if (prefix) out.add(prefix)
    }
    if (typeof json.extends === 'string' && json.extends.startsWith('.')) {
      visit(join(file, '..', json.extends), depthLeft - 1)
    }
  }
  visit(join(pkgAbsDir, 'tsconfig.json'), 1)
  if (rootDir) visit(join(rootDir, 'tsconfig.json'), 1)
  return out
}

/**
 * Statement-level type-only imports — `import type … from 'x'` and
 * `export type … from 'x'`. These are ERASED at build: the consumer never
 * needs the package at runtime, so they must not drive `prod-import-of-dev-dep`
 * (importing types from a devDependency is the correct pattern) and must not
 * be reported as a runtime phantom.
 *
 * Decided by walking BACK from the specifier to the nearest statement head,
 * NOT by a forward regex over the statement. The first cut here used
 * `import\s+type\s[^'"\n]*?['"]…` and silently missed the dominant real-world
 * shape — a prettier-wrapped multi-line import:
 *
 *     import type {
 *       ExtractProps,
 *     } from '@scope/types'
 *
 * because the character class excluded newlines. Allowing newlines instead
 * would be worse: `export type X = string` followed by a real
 * `import { r } from 'pkg'` lets a lazy match run across the gap and mark a
 * RUNTIME import as erased — under-reporting a genuine dependency, the more
 * damaging direction. Taking the NEAREST head cannot cross a statement.
 *
 * Deliberately statement-level only. An INLINE modifier — `import { type A,
 * b } from 'x'` — leaves a real runtime import, and under
 * `verbatimModuleSyntax` even `import { type A } from 'x'` still emits the
 * import statement.
 */
const STATEMENT_HEAD_RE = /\b(?:import|export)\s+(type\s)?/g

/** How far back a statement head may sit from its specifier. A wrapped import
 * list is rarely 200 chars, let alone 2000; beyond that we read it as runtime,
 * which is the safe direction. */
const HEAD_LOOKBACK = 2000

function isTypeOnlyStatement(stripped: string, specIndex: number): boolean {
  const window = stripped.slice(Math.max(0, specIndex - HEAD_LOOKBACK), specIndex)
  STATEMENT_HEAD_RE.lastIndex = 0
  let last: RegExpExecArray | null = null
  for (let m = STATEMENT_HEAD_RE.exec(window); m; m = STATEMENT_HEAD_RE.exec(window)) last = m
  return Boolean(last?.[1])
}

/** A `.d.ts` file declares types only — every import in it is erased. */
function isTypeDeclarationFile(relPath: string): boolean {
  return /\.d\.[cm]?ts$/.test(relPath)
}

/**
 * Does a package-relative path match one glob?
 *
 * Segment-wise, the same vocabulary `expandGlob` uses for workspace globs —
 * `*` matches within ONE segment, `**` matches any depth including zero. A
 * regex built from the whole glob in one pass is the tempting shortcut and is
 * where the escaping bugs live (`**` rewritten to `.*` then re-scanned by the
 * single-`*` pass), so this walks segments instead.
 *
 * `src/manifest.ts` · `**\/manifest.ts` · `src/**` · `**\/*.gen.ts`
 */
export function matchesPathGlob(relPath: string, glob: string): boolean {
  const p = relPath.split('/')
  const g = glob.split('/')
  const segMatches = (name: string, seg: string): boolean => {
    if (seg === '*') return true
    if (!seg.includes('*')) return name === seg
    const escaped = seg.split('*').map((part) => part.replace(/[.+^${}()|[\]\\?]/g, '\\$&'))
    return new RegExp(`^${escaped.join('[^/]*')}$`).test(name)
  }
  const walk = (pi: number, gi: number): boolean => {
    if (gi === g.length) return pi === p.length
    if (g[gi] === '**') {
      for (let k = pi; k <= p.length; k += 1) if (walk(k, gi + 1)) return true
      return false
    }
    if (pi === p.length) return false
    return segMatches(p[pi]!, g[gi]!) && walk(pi + 1, gi + 1)
  }
  return walk(0, 0)
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

/**
 * Scan one package directory. Returns specifier → files (relative) per surface.
 *
 * `devPaths` are package-relative globs the PROJECT declares as not-shipping
 * source. They extend {@link isDevSurfacePath} rather than forming a separate
 * exclusion, because that is exactly what they mean: the file is real, its
 * imports are real evidence the dependency is USED, but a consumer never
 * receives it — so it must not drive `phantom-dep` or `prod-import-of-dev-dep`
 * while still keeping `unused-dep` quiet.
 *
 * The motivating case is unknowable from inside loom: this repo's
 * `src/manifest.ts` files import `@pyreon/manifest` at runtime to feed
 * gen-docs, and `scripts/publish.ts` strips `src/` from every tarball. 55 of
 * the repo's 60 non-example gating warnings were that one convention.
 */
export function scanPackageImports(pkgAbsDir: string, rootDir?: string, devPaths: readonly string[] = []): {
  prod: Map<string, string[]>
  dev: Map<string, string[]>
  type: Map<string, string[]>
} {
  const files: string[] = []
  walkFiles(pkgAbsDir, '', files, 8)
  const aliases = readTsconfigAliases(pkgAbsDir, rootDir)
  const prod = new Map<string, string[]>()
  const dev = new Map<string, string[]>()
  const type = new Map<string, string[]>()
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(join(pkgAbsDir, file), 'utf8')
    } catch {
      continue
    }
    const declaredDev = devPaths.some((glob) => matchesPathGlob(file, glob))
    const runtimeBucket = isDevSurfacePath(file) || declaredDev ? dev : prod
    const { stripped, codeAt } = stripWithMask(text)
    // Every import in a `.d.ts` is type-only by construction.
    const declarationFile = isTypeDeclarationFile(file)
    for (const m of stripped.matchAll(SPEC_RE)) {
      // The match STARTS at the statement keyword (`from`/`import`/`require`)
      // — that position must be CODE, not the inside of a string.
      if (codeAt[m.index] === false) continue
      const name = specifierToPackage(m[1]!, aliases)
      if (!name) continue
      // Only a `from` clause can belong to a type-only statement. `require(…)`
      // and dynamic `import(…)` are runtime by definition, and a bare
      // `import 'x'` is a side-effect import — walking back from those would
      // read an unrelated earlier `import type` as their head.
      const typeOnly =
        declarationFile ||
        (m[0].startsWith('from') && isTypeOnlyStatement(stripped, m.index))
      const bucket = typeOnly ? type : runtimeBucket
      const list = bucket.get(name) ?? []
      if (list.length < 5) list.push(file)
      bucket.set(name, list)
    }
  }
  return { prod, dev, type }
}

/** Scan every workspace member. `devPaths` — see {@link scanPackageImports}. */
export function scanImports(
  rootDir: string,
  packages: { name: string; dir: string }[],
  devPaths: readonly string[] = [],
): ImportScan {
  const prod = new Map<string, Map<string, string[]>>()
  const dev = new Map<string, Map<string, string[]>>()
  const type = new Map<string, Map<string, string[]>>()
  for (const p of packages) {
    const scan = scanPackageImports(join(rootDir, p.dir), rootDir, devPaths)
    prod.set(p.name, scan.prod)
    dev.set(p.name, scan.dev)
    type.set(p.name, scan.type)
  }
  return { prod, dev, type }
}
