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
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

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

// Packages that cannot be native-rendered (hard DOM/canvas/vendor deps).
// Importing one in a multiplatform component file is a native-build hazard.
const WEB_ONLY_PACKAGES = new Set<string>([
  '@pyreon/charts',
  '@pyreon/flow',
  '@pyreon/code',
  '@pyreon/dnd',
  '@pyreon/document',
  '@pyreon/document-primitives',
  '@pyreon/query',
  '@pyreon/table',
  '@pyreon/virtual',
  '@pyreon/hotkeys',
  '@pyreon/elements',
  '@pyreon/styler',
  '@pyreon/rocketstyle',
  '@pyreon/coolgrid',
  '@pyreon/kinetic',
  '@pyreon/ui-components',
  '@pyreon/connector-document',
])

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

function parseSourceFile(filePath: string): ts.SourceFile | null {
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
}

function makeLocation(
  absPath: string,
  source: ts.SourceFile,
  node: ts.Node,
  rootForRel: string,
): NativeLocation {
  const pos = source.getLineAndCharacterOfPosition(node.getStart(source))
  return {
    path: absPath,
    relPath: relative(rootForRel, absPath),
    line: pos.line + 1,
    column: pos.character + 1,
  }
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
    const source = parseSourceFile(file)
    if (!source) continue

    // First pass: is this a multiplatform file (imports @pyreon/primitives)?
    // Collect web-only imports in the same sweep.
    let importsPrimitives = false
    const webOnlyImports: { spec: string; node: ts.Node }[] = []
    for (const stmt of source.statements) {
      if (!ts.isImportDeclaration(stmt)) continue
      const mod = stmt.moduleSpecifier
      if (!ts.isStringLiteral(mod)) continue
      const spec = mod.text
      if (spec === MULTIPLATFORM_SIGNAL) importsPrimitives = true
      // Match the package root (handles subpaths like `@pyreon/charts/manual`).
      const pkgRoot = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0]!
      if (WEB_ONLY_PACKAGES.has(pkgRoot)) webOnlyImports.push({ spec, node: stmt })
    }
    if (!importsPrimitives) continue
    multiplatformFiles++

    for (const wo of webOnlyImports) {
      findings.push({
        code: 'web-only-package-import',
        message:
          `\`${wo.spec}\` cannot be native-rendered (hard DOM/canvas/vendor dependency) but this file also imports \`@pyreon/primitives\` (a multiplatform component). On iOS/Android it will silently drop / fail to emit. Fix: host the web component in a \`<WebView>\` (for charts/flow/editor/document), or use \`@pyreon/primitives\` for UI. See get_pattern({ name: "multiplatform" }).`,
        location: makeLocation(file, source, wo.node, root),
      })
      findingsByCode['web-only-package-import']++
    }

    // Second pass: top-level interface / TS enum / class declarations.
    for (const decl of source.statements) {
      let kind: string | null = null
      let name = ''
      if (ts.isInterfaceDeclaration(decl)) {
        kind = 'interface'
        name = decl.name.text
      } else if (ts.isEnumDeclaration(decl)) {
        kind = 'TS enum'
        name = decl.name.text
      } else if (ts.isClassDeclaration(decl)) {
        kind = 'class'
        name = decl.name?.text ?? '<anonymous>'
      }
      if (!kind) continue
      const fix =
        kind === 'interface'
          ? `use \`type ${name} = { … }\` (PMTC synthesizes a struct from an object-literal type alias, not an interface)`
          : kind === 'TS enum'
            ? `use a string-literal union \`type ${name} = 'a' | 'b'\` (→ native enum)`
            : `move the logic into functions + signals (or \`defineStore\` / \`model()\`)`
      findings.push({
        code: 'native-unsupported-decl',
        message:
          `Top-level \`${kind} ${name}\` is NOT compiled to native — PMTC silently drops it, so the emitted SwiftUI/Compose references an undefined symbol on the real device build (the \`swiftc -parse\` gate can't catch this). Fix: ${fix}.`,
        location: makeLocation(file, source, decl, root),
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
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true)
  const diags: NativePatternDiagnostic[] = []

  let importsPrimitives = false
  const webOnly: { spec: string; node: ts.Node }[] = []
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const mod = stmt.moduleSpecifier
    if (!ts.isStringLiteral(mod)) continue
    const spec = mod.text
    if (spec === MULTIPLATFORM_SIGNAL) importsPrimitives = true
    const pkgRoot = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!
    if (WEB_ONLY_PACKAGES.has(pkgRoot)) webOnly.push({ spec, node: stmt })
  }
  // Only audit multiplatform snippets — a pure-web snippet legitimately
  // imports charts/elements/etc. and must not be flagged.
  if (!importsPrimitives) return diags

  const lineCol = (node: ts.Node) => {
    const p = source.getLineAndCharacterOfPosition(node.getStart(source))
    return { line: p.line + 1, column: p.character }
  }

  for (const wo of webOnly) {
    const { line, column } = lineCol(wo.node)
    diags.push({
      code: 'native-web-only-import',
      message: `\`${wo.spec}\` cannot be native-rendered (DOM/canvas/vendor dependency) but this is a multiplatform component (imports \`@pyreon/primitives\`). On iOS/Android it silently drops / fails to emit.`,
      line,
      column,
      current: `import … from '${wo.spec}'`,
      suggested: `host the web component in a <WebView> (charts/flow/editor/document), or use @pyreon/primitives for UI — see get_pattern({ name: "multiplatform" })`,
      fixable: false,
    })
  }

  for (const decl of source.statements) {
    let kind: string | null = null
    let name = ''
    if (ts.isInterfaceDeclaration(decl)) {
      kind = 'interface'
      name = decl.name.text
    } else if (ts.isEnumDeclaration(decl)) {
      kind = 'enum'
      name = decl.name.text
    } else if (ts.isClassDeclaration(decl)) {
      kind = 'class'
      name = decl.name?.text ?? '<anonymous>'
    }
    if (!kind) continue
    const suggested =
      kind === 'interface'
        ? `type ${name} = { … }  // object-literal alias → struct on native`
        : kind === 'enum'
          ? `type ${name} = 'a' | 'b'  // string-literal union → native enum`
          : `move logic into functions + signals (or defineStore / model())`
    const { line, column } = lineCol(decl)
    diags.push({
      code: 'native-unsupported-decl',
      message: `Top-level \`${kind} ${name}\` is silently DROPPED by PMTC on native — the emitted SwiftUI/Compose references an undefined symbol on the device build.`,
      line,
      column,
      current: `${kind} ${name}`,
      suggested,
      fixable: false,
    })
  }

  diags.sort((a, b) => a.line - b.line || a.column - b.column)
  return diags
}
