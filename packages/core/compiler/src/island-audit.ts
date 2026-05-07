/**
 * Project-wide islands audit for the `audit_islands` MCP tool +
 * `pyreon doctor --check-islands` CLI flag (PR C of the islands DX
 * roadmap).
 *
 * Companion gates that pre-date this module:
 *
 *   - PR G's `island-never-with-registry-entry` detector (in
 *     `pyreon-intercept.ts`) catches the same shape per FILE — it only
 *     fires when the `island()` declaration AND `hydrateIslands({...})`
 *     call are in the same source.
 *   - PR B's auto-registry (`@pyreon/vite-plugin` `islands: true`)
 *     eliminates the manual sync entirely — the registry is generated
 *     from `island()` declarations, so it can't drift.
 *
 * What this audit adds: cross-file analysis. Five findings:
 *
 *   1. `never-with-registry-entry` — project-wide cross-file version of
 *      the per-file detector. Fires when ANY file's `island()` with
 *      `hydrate: 'never'` matches a key in ANY file's `hydrateIslands`
 *      call.
 *   2. `duplicate-name` — two `island()` declarations with the same
 *      `name`. Runtime would only hydrate the first; the second fails
 *      silently.
 *   3. `registry-mismatch` — a `hydrateIslands({ X })` entry with no
 *      matching `island()` declaration anywhere in the project. Catches
 *      the manual-form drift foot-gun (typo / removed island /
 *      forgotten import).
 *   4. `nested-island` — an `island()` whose loader-imported file ALSO
 *      contains an `island()` call. Statically reachable nesting; the
 *      outer's `hydrateRoot` would replace the inner before its loader
 *      runs.
 *   5. `dead-island` — an `island()` declared in a file that no other
 *      file imports (statically OR dynamically). Heuristic catches the
 *      common shape of "declared but never wired up." False negatives
 *      possible (file imported but the island binding within it isn't
 *      used) — that's the cost of staying syntactic + cheap.
 *
 * Architectural note. This is intentionally syntactic, not semantic.
 * The audit reads source files as text + AST and never resolves through
 * type-checking. False negatives are acceptable; false positives must
 * be rare. Every finding includes file paths + line/column + actionable
 * fix suggestion so the user can verify in seconds.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

export type IslandFindingCode =
  | 'never-with-registry-entry'
  | 'duplicate-name'
  | 'registry-mismatch'
  | 'nested-island'
  | 'dead-island'

export interface IslandLocation {
  /** Absolute path */
  path: string
  /** Path relative to the repo root for readable reporting */
  relPath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
}

export interface IslandFinding {
  code: IslandFindingCode
  /** One-paragraph human-readable explanation, including the fix path. */
  message: string
  /** Where the finding surfaces. */
  location: IslandLocation
  /**
   * Companion locations for cross-file findings (`duplicate-name` lists
   * the OTHER occurrence; `nested-island` lists the inner island's
   * declaration; `never-with-registry-entry` lists the matching island
   * declaration).
   */
  related?: IslandLocation[] | undefined
}

export interface IslandAuditResult {
  root: string | null
  findings: IslandFinding[]
  summary: {
    filesScanned: number
    islandsDeclared: number
    registryEntries: number
    findingsByCode: Record<IslandFindingCode, number>
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // fall through
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function walkSourceFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 12) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules' || name === 'lib' || name === 'dist') continue
    if (name === '__tests__' || name === 'tests') continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      walkSourceFiles(full, out, depth + 1)
      continue
    }
    if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\.(tsx?|jsx?)$/.test(name)) {
      out.push(full)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-file extraction
// ═══════════════════════════════════════════════════════════════════════════════

interface IslandDecl {
  name: string
  hydrate: string
  /** Raw import path string from the loader fn body, e.g. './Counter' */
  importPath: string | undefined
  loc: IslandLocation
  /** Containing file's directory — used to resolve `importPath` */
  fileDir: string
}

interface RegistryEntry {
  /** The key in the `hydrateIslands({...})` call (the island name being registered) */
  key: string
  loc: IslandLocation
}

interface FileExtraction {
  islands: IslandDecl[]
  registryEntries: RegistryEntry[]
  /** Set of resolved (best-effort) absolute paths this file imports */
  imports: Set<string>
}

function lineColAt(sf: ts.SourceFile, pos: number): { line: number; column: number } {
  const lc = sf.getLineAndCharacterOfPosition(pos)
  return { line: lc.line + 1, column: lc.character + 1 }
}

/** Strip surrounding quotes from a string literal as parsed by TS. */
function stringLiteralValue(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  return undefined
}

/**
 * Extract `island()` declarations recognized in the file. Mirrors the
 * shape recognized by `@pyreon/vite-plugin`'s `scanIslandDeclarations`
 * and PR G's `collectNeverIslandNames` — only inline-arrow loaders +
 * string-literal options are captured. Other shapes fall through (false
 * negatives, by design).
 */
function extractIslandDecls(sf: ts.SourceFile, absPath: string, root: string): IslandDecl[] {
  const decls: IslandDecl[] = []
  const fileDir = dirname(absPath)
  const relPath = relative(root, absPath)

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'island' &&
      node.arguments.length >= 2
    ) {
      const loaderArg = node.arguments[0]
      const optsArg = node.arguments[1]

      let importPath: string | undefined
      // Recognize `() => import('PATH')` — single ImportExpression in body
      if (loaderArg && ts.isArrowFunction(loaderArg)) {
        const body = loaderArg.body
        const callTarget = ts.isCallExpression(body) ? body : undefined
        if (callTarget && callTarget.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg0 = callTarget.arguments[0]
          if (arg0) importPath = stringLiteralValue(arg0)
        }
      }

      if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
        let nameVal: string | undefined
        let hydrateVal: string | undefined
        for (const prop of optsArg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const keyText = ts.isIdentifier(prop.name)
            ? prop.name.text
            : ts.isStringLiteral(prop.name)
              ? prop.name.text
              : ''
          if (keyText === 'name') {
            nameVal = stringLiteralValue(prop.initializer)
          } else if (keyText === 'hydrate') {
            const v = stringLiteralValue(prop.initializer)
            // Normalize `'interaction(focus)'` → `'interaction'` for grouping
            hydrateVal = v?.startsWith('interaction') ? 'interaction' : v
          }
        }
        if (nameVal) {
          const lc = lineColAt(sf, node.getStart(sf))
          decls.push({
            name: nameVal,
            hydrate: hydrateVal ?? 'load',
            importPath,
            loc: { path: absPath, relPath, line: lc.line, column: lc.column },
            fileDir,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return decls
}

/**
 * Extract `hydrateIslands({...})` registry entries. Recognizes both
 * shorthand (`{ Counter }`) and property-assignment (`{ Counter: () =>
 * import('./Counter') }`) forms.
 */
function extractRegistryEntries(
  sf: ts.SourceFile,
  absPath: string,
  root: string,
): RegistryEntry[] {
  const entries: RegistryEntry[] = []
  const relPath = relative(root, absPath)

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'hydrateIslands' &&
      node.arguments.length >= 1
    ) {
      const arg = node.arguments[0]
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue
          const keyNode = prop.name
          const key = ts.isIdentifier(keyNode)
            ? keyNode.text
            : ts.isStringLiteral(keyNode)
              ? keyNode.text
              : ''
          if (!key) continue
          const lc = lineColAt(sf, prop.getStart(sf))
          entries.push({
            key,
            loc: { path: absPath, relPath, line: lc.line, column: lc.column },
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return entries
}

/**
 * Extract every import target (static `import` declarations + dynamic
 * `import()` expressions) and resolve relative paths to absolute paths
 * for the imports map. Bare specifiers (`@pyreon/server`) are kept as-is
 * — we only use this for the dead-island heuristic, which compares
 * against absolute file paths of declared islands, so bare specs simply
 * never match.
 */
function extractImports(sf: ts.SourceFile, absPath: string): Set<string> {
  const out = new Set<string>()
  const fileDir = dirname(absPath)

  function record(spec: string): void {
    if (spec.startsWith('.')) {
      out.add(resolve(fileDir, spec))
    } else {
      out.add(spec)
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg0 = node.arguments[0]
      const v = arg0 ? stringLiteralValue(arg0) : undefined
      if (v) record(v)
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function extractFromFile(absPath: string, root: string): FileExtraction {
  let code = ''
  try {
    code = readFileSync(absPath, 'utf8')
  } catch {
    return { islands: [], registryEntries: [], imports: new Set() }
  }
  const sf = ts.createSourceFile(absPath, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  return {
    islands: extractIslandDecls(sf, absPath, root),
    registryEntries: extractRegistryEntries(sf, absPath, root),
    imports: extractImports(sf, absPath),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Import-path resolution helper
// ═══════════════════════════════════════════════════════════════════════════════

const TS_EXTS = ['.ts', '.tsx', '.js', '.jsx']

/**
 * Try common extensions + index files to land an absolute path on a
 * concrete file. Used by both helpers below.
 */
function resolveAbsToFile(absBase: string): string | null {
  try {
    if (statSync(absBase).isFile()) return absBase
  } catch {
    // fall through
  }
  for (const ext of TS_EXTS) {
    try {
      const candidate = `${absBase}${ext}`
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // try next
    }
  }
  for (const ext of TS_EXTS) {
    try {
      const candidate = join(absBase, `index${ext}`)
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Resolve `import './Counter'` (or similar) to an absolute file path.
 * Used by `nested-island` to follow an island's loader to its target.
 */
function resolveImport(fromDir: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  return resolveAbsToFile(resolve(fromDir, spec))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detectors
// ═══════════════════════════════════════════════════════════════════════════════

function detectDuplicateName(
  declsByFile: Map<string, IslandDecl[]>,
  findings: IslandFinding[],
): void {
  const byName = new Map<string, IslandDecl[]>()
  for (const decls of declsByFile.values()) {
    for (const d of decls) {
      const list = byName.get(d.name) ?? []
      list.push(d)
      byName.set(d.name, list)
    }
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue
    // Each duplicate gets its own finding pointing at one occurrence,
    // with `related` listing the others. The user sees N findings for
    // N duplicates so every IDE jumps highlight the conflict cleanly.
    for (let i = 0; i < list.length; i++) {
      const self = list[i]
      if (!self) continue
      const others = list
        .filter((_, j) => j !== i)
        .map((d) => d.loc)
      findings.push({
        code: 'duplicate-name',
        message: `Two or more \`island()\` declarations share the name "${name}". The client-side hydration registry is keyed by name; only the FIRST loader fires — every other declaration fails silently with no error flag, and the user sees broken interactivity on the second component without any signal pointing at the cause. Rename one to make the names unique.`,
        location: self.loc,
        related: others,
      })
    }
  }
}

function detectNeverWithRegistry(
  decls: IslandDecl[],
  registry: RegistryEntry[],
  findings: IslandFinding[],
): void {
  const neverByName = new Map<string, IslandDecl>()
  for (const d of decls) {
    if (d.hydrate === 'never') neverByName.set(d.name, d)
  }
  for (const entry of registry) {
    const decl = neverByName.get(entry.key)
    if (!decl) continue
    findings.push({
      code: 'never-with-registry-entry',
      message: `island "${entry.key}" was declared with \`hydrate: 'never'\` (at ${decl.loc.relPath}:${decl.loc.line}) but is registered in \`hydrateIslands({...})\`. The whole point of the \`'never'\` strategy is shipping zero client JS — registering pulls the component module into the client bundle graph (the runtime short-circuits never-strategy before the registry lookup, so the loader never fires, but the bundler still includes the import). Drop this entry; the framework handles never-strategy islands at SSR with no client-side wiring. Auto-registry under \`@pyreon/vite-plugin\` (\`pyreon({ islands: true })\`) automatically omits never-strategy islands — switch to \`hydrateIslandsAuto(registry)\` to eliminate the manual sync entirely.`,
      location: entry.loc,
      related: [decl.loc],
    })
  }
}

function detectRegistryMismatch(
  decls: IslandDecl[],
  registry: RegistryEntry[],
  findings: IslandFinding[],
): void {
  const declaredNames = new Set(decls.map((d) => d.name))
  for (const entry of registry) {
    if (declaredNames.has(entry.key)) continue
    findings.push({
      code: 'registry-mismatch',
      message: `\`hydrateIslands({ ${entry.key}: ... })\` references "${entry.key}" but no \`island()\` in the project declares this name. Common causes: (1) typo (the registry key must EXACTLY match the \`name\` field on the \`island()\` declaration, including case), (2) the \`island()\` was renamed or deleted but the registry entry wasn't updated, (3) the file declaring the island isn't part of the scanned source tree (audit walks \`packages/\` and \`examples/\` by default). Switch to \`hydrateIslandsAuto(registry)\` from \`@pyreon/server/client\` (with \`@pyreon/vite-plugin\` \`islands: true\`) to eliminate manual-sync drift.`,
      location: entry.loc,
    })
  }
}

function detectNestedIsland(
  decls: IslandDecl[],
  declsByFile: Map<string, IslandDecl[]>,
  findings: IslandFinding[],
): void {
  for (const outer of decls) {
    if (!outer.importPath) continue
    const resolved = resolveImport(outer.fileDir, outer.importPath)
    if (!resolved) continue
    const innerDecls = declsByFile.get(resolved)
    if (!innerDecls || innerDecls.length === 0) continue
    for (const inner of innerDecls) {
      findings.push({
        code: 'nested-island',
        message: `island "${outer.name}" loads a file that ALSO contains an \`island()\` declaration ("${inner.name}" at ${inner.loc.relPath}:${inner.loc.line}). Nested islands are unsupported — the outer's \`hydrateRoot\` would replace the inner subtree before its loader runs, so the inner never hydrates. Refactor to flatten (move the inner island's content into the outer, OR remove the inner \`island()\` wrapper and let the outer render the component directly).`,
        location: outer.loc,
        related: [inner.loc],
      })
    }
  }
}

function detectDeadIslands(
  decls: IslandDecl[],
  importedFiles: Set<string>,
  findings: IslandFinding[],
): void {
  for (const d of decls) {
    if (importedFiles.has(d.loc.path)) continue
    findings.push({
      code: 'dead-island',
      message: `island "${d.name}" is declared in ${d.loc.relPath} but no other file in the project imports from this module (statically OR dynamically). The island's component will never reach a rendered tree — it's effectively unreachable code. Either (1) wire it up by importing + rendering the component from a route, or (2) remove the \`island()\` declaration. Note: the audit's heuristic flags files that no other source imports; if your island is registered via \`hydrateIslandsAuto()\`, the auto-registry's \`() => import('PATH')\` loader DOES count as an import, so a flagged island is genuinely orphaned.`,
      location: d.loc,
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export function auditIslands(rootDir: string): IslandAuditResult {
  const root = findMonorepoRoot(rootDir)
  const findings: IslandFinding[] = []
  const summary = {
    filesScanned: 0,
    islandsDeclared: 0,
    registryEntries: 0,
    findingsByCode: {
      'never-with-registry-entry': 0,
      'duplicate-name': 0,
      'registry-mismatch': 0,
      'nested-island': 0,
      'dead-island': 0,
    } as Record<IslandFindingCode, number>,
  }

  if (!root) return { root: null, findings, summary }

  const files: string[] = []
  walkSourceFiles(join(root, 'packages'), files)
  walkSourceFiles(join(root, 'examples'), files)
  summary.filesScanned = files.length

  const declsByFile = new Map<string, IslandDecl[]>()
  const allDecls: IslandDecl[] = []
  const allRegistry: RegistryEntry[] = []
  // Set of canonical absolute file paths that some other file imports
  // (statically OR dynamically). Used by the dead-island detector to
  // distinguish declared-but-orphaned islands from declared-and-wired-up
  // ones. extractImports records resolve()'d relative specs WITHOUT
  // extension-completion, so we re-canonicalize each entry through the
  // file-resolution helper to land on the actual file path.
  const resolvedImports = new Set<string>()

  for (const file of files) {
    const ex = extractFromFile(file, root)
    if (ex.islands.length > 0) {
      declsByFile.set(file, ex.islands)
      allDecls.push(...ex.islands)
    }
    allRegistry.push(...ex.registryEntries)
    for (const spec of ex.imports) {
      // extractImports stores absolute paths for relative specs (already
      // resolve()'d) and bare package names as-is. Bare specs never
      // match an island file path, so skip them. For absolute paths,
      // try ext / index completion to land on the canonical file the
      // dead-island detector compares against.
      if (!spec.startsWith('/')) continue
      const resolved = resolveAbsToFile(spec)
      if (resolved) resolvedImports.add(resolved)
    }
  }

  summary.islandsDeclared = allDecls.length
  summary.registryEntries = allRegistry.length

  // Run detectors. Order is informational only — findings are sorted
  // by (file, line) at the end for stable display.
  detectDuplicateName(declsByFile, findings)
  detectNeverWithRegistry(allDecls, allRegistry, findings)
  detectRegistryMismatch(allDecls, allRegistry, findings)
  detectNestedIsland(allDecls, declsByFile, findings)
  detectDeadIslands(allDecls, resolvedImports, findings)

  for (const f of findings) {
    summary.findingsByCode[f.code] = (summary.findingsByCode[f.code] ?? 0) + 1
  }

  findings.sort((a, b) => {
    const pathCmp = a.location.relPath.localeCompare(b.location.relPath)
    if (pathCmp !== 0) return pathCmp
    return a.location.line - b.location.line || a.location.column - b.location.column
  })

  return { root, findings, summary }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

export interface IslandAuditFormatOptions {
  /** When true, emit JSON instead of markdown-ish text. */
  json?: boolean | undefined
}

const CODE_HEADERS: Record<IslandFindingCode, string> = {
  'never-with-registry-entry':
    'Never-strategy island in client registry — defeats zero-JS strategy',
  'duplicate-name': 'Duplicate island names — only the first hydrates',
  'registry-mismatch': 'Registry references unknown island — runtime warns + skips',
  'nested-island': 'Nested island — outer hydrateRoot replaces inner before its loader runs',
  'dead-island': 'Declared but unused island — no other file imports its module',
}

export function formatIslandAudit(
  result: IslandAuditResult,
  options: IslandAuditFormatOptions = {},
): string {
  if (options.json) return JSON.stringify(result, null, 2)

  if (!result.root) {
    return (
      'No monorepo root found. The islands audit walks `packages/` and `examples/` ' +
      'starting from the cwd. Run `pyreon doctor --check-islands` from the Pyreon repo root.'
    )
  }

  const parts: string[] = []
  parts.push(
    `# Islands audit — ${result.summary.filesScanned} files scanned, ` +
      `${result.summary.islandsDeclared} \`island()\` declaration${result.summary.islandsDeclared === 1 ? '' : 's'}, ` +
      `${result.summary.registryEntries} \`hydrateIslands\` registry ` +
      `entr${result.summary.registryEntries === 1 ? 'y' : 'ies'}`,
  )
  parts.push('')

  if (result.findings.length === 0) {
    parts.push('✓ No island findings. Project-wide cross-file checks are clean:')
    parts.push('  - No duplicate names')
    parts.push('  - No `hydrate: "never"` islands in any client registry')
    parts.push('  - No registry entries pointing at undeclared names')
    parts.push('  - No nested islands')
    parts.push('  - No declared-but-unimported islands')
    return parts.join('\n')
  }

  parts.push(
    `Findings: ${result.findings.length} (` +
      Object.entries(result.summary.findingsByCode)
        .filter(([, n]) => n > 0)
        .map(([code, n]) => `${code}: ${n}`)
        .join(', ') +
      ')',
  )
  parts.push('')

  // Group by code so the output reads like a per-finding-type catalog.
  const byCode = new Map<IslandFindingCode, IslandFinding[]>()
  for (const f of result.findings) {
    const list = byCode.get(f.code) ?? []
    list.push(f)
    byCode.set(f.code, list)
  }

  for (const [code, list] of byCode) {
    parts.push(`## ${code} — ${list.length} finding${list.length === 1 ? '' : 's'}`)
    parts.push('')
    parts.push(`> ${CODE_HEADERS[code]}`)
    parts.push('')
    for (const f of list) {
      parts.push(`  ${f.location.relPath}:${f.location.line}:${f.location.column}`)
      parts.push(`    ${f.message}`)
      if (f.related && f.related.length > 0) {
        for (const r of f.related) {
          parts.push(`    related: ${r.relPath}:${r.line}:${r.column}`)
        }
      }
      parts.push('')
    }
  }

  return parts.join('\n')
}
