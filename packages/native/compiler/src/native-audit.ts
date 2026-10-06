/**
 * native-audit — project-level scan for multiplatform (PMTC) build hazards.
 * Consumed by `pyreon doctor --check-native` (the `native-audit` gate) and
 * exported for the MCP surface. Mirrors `auditSsg` / `auditIslands`: pure
 * syntactic TS-compiler-API scan, no type-check pass.
 *
 * Scope: a file is audited ONLY if it imports `@pyreon/primitives` — the
 * signal that it's a multiplatform component compiled by PMTC to SwiftUI /
 * Compose. (A web-only file that never targets native isn't a concern.)
 * In those files it flags two high-confidence native-build hazards the
 * `swiftc -parse` / `kotlinc`-stub gate can't catch at build time:
 *
 *  - **`web-only-package-import`** — importing a package that can NOT be
 *    native-rendered (`@pyreon/charts`/`flow`/`code`/`dnd`/`document`/`query`/
 *    `table`/`virtual` + the web CSS-in-JS UI stack `elements`/`styler`/
 *    `rocketstyle`/`coolgrid`/`kinetic`/`ui-components`). On native these
 *    silently drop / fail to emit. Fix: host the component in a `<WebView>`
 *    (charts/flow/editor) or use `@pyreon/primitives` (UI).
 *  - **`native-unsupported-decl`** — a top-level `interface` / TS `enum` /
 *    `class` declaration. PMTC silently DROPS these (the emit references an
 *    undefined symbol on the real device build). Fix: `type X = { … }` /
 *    `type X = 'a' | 'b'` / functions + signals.
 *
 * See `get_pattern({ name: 'multiplatform' })` for the full supported subset.
 *
 * Lives in `@pyreon/native-compiler` (served as `@pyreon/native-compiler/audit`)
 * rather than the web compiler: it is the native story, and it reads the SAME
 * `WEB_ONLY_PACKAGES` the parser's import warning does. Parsing is oxc (what
 * PMTC itself parses with), so the audit agrees with the compiler it audits
 * about what is parseable -- and a file PMTC cannot parse is skipped here too,
 * where the previous TypeScript-API parser recovered from syntax errors.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseSync, type Program, type Statement } from 'oxc-parser'
import { WEB_ONLY_PACKAGES } from './web-only-packages'

export type NativeFindingCode = 'web-only-package-import' | 'native-unsupported-decl'

export interface NativeLocation {
  path: string
  relPath: string
  line: number
  column: number
}

export interface NativeFinding {
  code: NativeFindingCode
  message: string
  location: NativeLocation
}

export interface NativeAuditResult {
  root: string | null
  findings: NativeFinding[]
  summary: {
    filesScanned: number
    multiplatformFiles: number
    findingsByCode: Record<NativeFindingCode, number>
  }
}

const MULTIPLATFORM_SIGNAL = '@pyreon/primitives'

function findRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    try {
      if (statSync(join(dir, 'package.json')).isFile()) return dir
    } catch {
      // fall through
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function walkTsx(dir: string, out: string[], depth = 0): void {
  if (depth > 14) return
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
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkTsx(full, out, depth + 1)
      continue
    }
    if (name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(name)) {
      out.push(full)
    }
  }
}

interface ParsedFile {
  program: Program
  /** Offsets of every line start, for offset -> line/column. */
  lineStarts: number[]
}

function indexLines(code: string): number[] {
  const starts = [0]
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

function parseCode(filename: string, code: string): ParsedFile | null {
  const result = parseSync(filename, code, { lang: 'tsx' })
  // An unrecoverable parse leaves an empty program: nothing to audit.
  if (result.errors.length > 0 && result.program.body.length === 0) return null
  return { program: result.program, lineStarts: indexLines(code) }
}

function parseSourceFile(filePath: string): ParsedFile | null {
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  return parseCode(filePath, source)
}

/** 0-based line + 0-based column of a source offset (binary search). */
function locate(file: ParsedFile, offset: number): { line: number; column: number } {
  let lo = 0
  let hi = file.lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (file.lineStarts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo, column: offset - file.lineStarts[lo]! }
}

function makeLocation(
  absPath: string,
  file: ParsedFile,
  offset: number,
  rootForRel: string,
): NativeLocation {
  const pos = locate(file, offset)
  return {
    path: absPath,
    relPath: relative(rootForRel, absPath),
    line: pos.line + 1,
    column: pos.column + 1,
  }
}

/** The package ROOT of a specifier (handles subpaths like `@pyreon/charts/manual`). */
function packageRoot(spec: string): string {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!
}

interface ImportScan {
  importsPrimitives: boolean
  webOnly: { spec: string; start: number }[]
}

function scanImports(program: Program): ImportScan {
  let importsPrimitives = false
  const webOnly: ImportScan['webOnly'] = []
  for (const stmt of program.body) {
    if (stmt.type !== 'ImportDeclaration') continue
    const spec = stmt.source.value
    if (spec === MULTIPLATFORM_SIGNAL) importsPrimitives = true
    if (WEB_ONLY_PACKAGES.has(packageRoot(spec))) webOnly.push({ spec, start: stmt.start })
  }
  return { importsPrimitives, webOnly }
}

interface UnsupportedDecl {
  kind: 'TS enum' | 'class'
  name: string
  /** Start of the whole statement, `export` / `export default` included. */
  start: number
}

/**
 * Top-level `enum` / `class` declarations, `export`ed or not. `interface` is
 * deliberately NOT flagged. PMTC synthesizes a struct from one, verified
 * against both emitters: a plain interface, one with optional fields, one with
 * a nested object field and one with an array field all emit a `struct` /
 * `data class` with ZERO warnings. The shapes it cannot take -- `extends`,
 * generics, a method member -- it WARNS about by name at compile time, which
 * is strictly better than a file-level heuristic that cannot tell those shapes
 * apart. Flagging every interface made this rule fire on three correct files
 * and told their authors to rewrite working code.
 */
function unsupportedDecls(program: Program): UnsupportedDecl[] {
  const out: UnsupportedDecl[] = []
  for (const stmt of program.body) {
    const decl: Statement | null =
      (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') &&
      stmt.declaration
        ? (stmt.declaration as Statement)
        : stmt
    if (decl.type === 'TSEnumDeclaration') {
      out.push({ kind: 'TS enum', name: decl.id.name, start: stmt.start })
    } else if (decl.type === 'ClassDeclaration') {
      out.push({ kind: 'class', name: decl.id?.name ?? '<anonymous>', start: stmt.start })
    }
  }
  return out
}

/**
 * Audit a project directory for multiplatform native-build hazards. Scans
 * `<cwd>` recursively for `.tsx` files that import `@pyreon/primitives`.
 */
export function auditNative(cwd: string): NativeAuditResult {
  const root = findRoot(cwd) ?? cwd
  const files: string[] = []
  walkTsx(resolve(cwd), files)

  const findings: NativeFinding[] = []
  let multiplatformFiles = 0
  const findingsByCode: Record<NativeFindingCode, number> = {
    'web-only-package-import': 0,
    'native-unsupported-decl': 0,
  }

  for (const file of files) {
    const parsed = parseSourceFile(file)
    if (!parsed) continue
    const { importsPrimitives, webOnly } = scanImports(parsed.program)
    if (!importsPrimitives) continue
    multiplatformFiles++

    for (const wo of webOnly) {
      findings.push({
        code: 'web-only-package-import',
        message:
          `\`${wo.spec}\` is web-only — ${WEB_ONLY_PACKAGES.get(wo.spec) ?? 'no native frontend'} — but this file also imports \`@pyreon/primitives\` (a multiplatform component). Fix: host the web component in a \`<WebView>\`, or use \`@pyreon/primitives\` for UI. See get_pattern({ name: "multiplatform" }).`,
        location: makeLocation(file, parsed, wo.start, root),
      })
      findingsByCode['web-only-package-import']++
    }

    for (const d of unsupportedDecls(parsed.program)) {
      const fix =
        d.kind === 'TS enum'
          ? `use a string-literal union \`type ${d.name} = 'a' | 'b'\` (→ native enum)`
          : `move the logic into functions + signals (or \`defineStore\` / \`model()\`)`
      findings.push({
        code: 'native-unsupported-decl',
        message:
          `Top-level \`${d.kind} ${d.name}\` is not compiled to native. PMTC warns about it by name when you build, so this is not a silent drop — the audit surfaces it WITHOUT a compile, across the whole project. Fix: ${fix}.`,
        location: makeLocation(file, parsed, d.start, root),
      })
      findingsByCode['native-unsupported-decl']++
    }
  }

  return {
    root,
    findings,
    summary: {
      filesScanned: files.length,
      multiplatformFiles,
      findingsByCode,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Snippet-level detector (MCP `validate` feedback loop)
// ═══════════════════════════════════════════════════════════════════════════════

export interface NativePatternDiagnostic {
  code: 'native-web-only-import' | 'native-unsupported-decl'
  message: string
  /** 1-based line */
  line: number
  /** 0-based column (matches detectPyreonPatterns) */
  column: number
  current: string
  suggested: string
  fixable: boolean
}

/**
 * Snippet-level multiplatform-hazard detector for the MCP `validate` tool —
 * the per-keystroke feedback loop complementing the project-level
 * `auditNative` / `pyreon doctor --check-native`. Same two detectors, same
 * scoping: only fires when the snippet imports `@pyreon/primitives` (i.e. it's
 * a multiplatform component PMTC compiles to native), so a pure-web snippet
 * never false-positives. Returns the `detectPyreonPatterns`-compatible
 * diagnostic shape so the validate handler merges all three detector sets.
 */
export function detectNativePatterns(
  code: string,
  filename = 'snippet.tsx',
): NativePatternDiagnostic[] {
  const parsed = parseCode(filename, code)
  if (!parsed) return []
  const { importsPrimitives, webOnly } = scanImports(parsed.program)
  // Only audit multiplatform snippets — a pure-web snippet legitimately
  // imports charts/elements/etc. and must not be flagged.
  if (!importsPrimitives) return []

  const diags: NativePatternDiagnostic[] = []
  for (const wo of webOnly) {
    const { line, column } = locate(parsed, wo.start)
    diags.push({
      code: 'native-web-only-import',
      message: `\`${wo.spec}\` is web-only — ${WEB_ONLY_PACKAGES.get(wo.spec) ?? 'no native frontend'} — but this is a multiplatform component (imports \`@pyreon/primitives\`).`,
      line: line + 1,
      column,
      current: `import … from '${wo.spec}'`,
      suggested: `host the web component in a <WebView> (charts/flow/editor/document), or use @pyreon/primitives for UI — see get_pattern({ name: "multiplatform" })`,
      fixable: false,
    })
  }

  for (const d of unsupportedDecls(parsed.program)) {
    const kind = d.kind === 'TS enum' ? 'enum' : 'class'
    const suggested =
      kind === 'enum'
        ? `type ${d.name} = 'a' | 'b'  // string-literal union → native enum`
        : `move logic into functions + signals (or defineStore / model())`
    const { line, column } = locate(parsed, d.start)
    diags.push({
      code: 'native-unsupported-decl',
      message: `Top-level \`${kind} ${d.name}\` is not compiled to native. PMTC warns about it by name at build time; this reports it without a compile.`,
      line: line + 1,
      column,
      current: `${kind} ${d.name}`,
      suggested,
      fixable: false,
    })
  }

  diags.sort((a, b) => a.line - b.line || a.column - b.column)
  return diags
}
