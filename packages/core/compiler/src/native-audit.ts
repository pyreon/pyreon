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
import { assertClassicTs } from './ts'

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

// Web-only packages, DERIVED from the manifests (see the generated block
// below). A package that declares a `nativeFrontend` partially crosses and
// is deliberately absent: flagging those told authors their working code was
// broken, while 17 genuinely web-only packages went unflagged.
// Importing one in a multiplatform component file is a native-build hazard.
//
// SOURCE OF TRUTH: each package's `manifest.ts` declares
// `multiplatform: { tier }`. This list must contain exactly the packages whose
// tier is `web-only` — `native-audit-web-only-drift.test.ts` asserts that, because
// this list silently went stale once: elements/styler/rocketstyle/coolgrid gained
// native frontends and moved to tier `shared` (the native compiler carries
// `emit-rocketstyle.ts`, `parse-rocketstyle.ts`, `attrs-native.ts` for them), but
// stayed listed here — so the audit reported the tri-target examples that exist to
// PROVE ui-system on native as native-build hazards.
// <gen:web-only-packages:start>
// GENERATED — do not edit by hand. Derived from every package manifest's
// `multiplatform` declaration (tier === 'web-only' AND no `nativeFrontend`)
// by `bun scripts/check-multiplatform-tier.ts --write-table`, which also
// gates that this stays in sync. Edit the MANIFEST, not this list.
//
// The value is the manifest's `rationale` — the per-package reason the
// warning quotes, so one blanket line does not have to serve packages as
// different as a linter, a `<head>` manager and an animation engine.
const WEB_ONLY_PACKAGES: ReadonlyMap<string, string> = new Map([
  ['@pyreon/atlas', "the component workbench — dev tooling that runs in a browser, not app runtime"],
  ['@pyreon/charts', "the ECharts bridge wraps a browser canvas engine — consume it on native via the `<WebView>` bridge subpath; the `/plot` engine takes the other road: every family's geometry is generated into the native runtimes (PyreonChartEngine.swift/.kt, drift-tested on both toolchains), with the canvas hosts and gestures web-only"],
  ['@pyreon/code', "wraps CodeMirror 6 (DOM editor engine); consume on native via the `<WebView>` bridge subpath"],
  ['@pyreon/compiler', "the web JSX compiler + build tooling itself; the native sibling is @pyreon/native-compiler — nothing here ships to an app runtime"],
  ['@pyreon/config', "build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target"],
  ['@pyreon/connector-document', "bridges ui-components to @pyreon/document extraction — both ends are web/document engines"],
  ['@pyreon/document', "wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering"],
  ['@pyreon/document-primitives', "document-authoring primitives feeding the pdfmake/docx renderers"],
  ['@pyreon/flow', "SVG rendering (the layout engine itself is pure and platform-free); consume on native via the `<WebView>` bridge subpath"],
  ['@pyreon/head', "document `<head>` management — no equivalent surface exists on iOS/Android"],
  ['@pyreon/lathe', "the code generator — build-time tooling that emits app code, not app runtime itself"],
  ['@pyreon/lint', "lint tooling — runs at dev time, not app runtime"],
  ['@pyreon/loom', "the dependency observatory — dev tooling, not app runtime"],
  ['@pyreon/mcp', "the MCP server — dev/AI tooling, not app runtime"],
  ['@pyreon/rich-text', "wraps TipTap/ProseMirror (DOM editor); consume on native via the `<WebView>` bridge subpath"],
  ['@pyreon/runtime-dom', "the DOM renderer — on native, PMTC emits SwiftUI/Compose instead of running a renderer; `<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives` (this package is web-only, so importing them from here warns)"],
  ['@pyreon/runtime-server', "server-side HTML rendering (SSR/streaming) — a web-platform concern with no native analogue"],
  ['@pyreon/server', "SSR handler + islands for web deployments; native apps have no server-rendered HTML"],
  ['@pyreon/testing', "the web testing kit (Testing-Library parity over the DOM renderer); native testing is XCUITest/Compose-test territory"],
  ['@pyreon/ui-components', ""],
  ['@pyreon/ui-primitives', ""],
  ['@pyreon/unistyle', "responsive breakpoints + CSS-variable theming over real CSS; native theming is compile-time tokens + the 2-bucket size-class model"],
  ['@pyreon/virtual', "DOM virtualization (scroll containers, measured rows); native lists are lazy by construction (LazyColumn/LazyVStack)"],
  ['@pyreon/zero', "the web meta-framework (SSR/SSG/ISR, Vite, fs-router); native apps are built by PMTC + create-multiplatform, not zero"],
  ['@pyreon/zero-content', "markdown/MDX content pipeline for zero's web rendering"],
])
// <gen:web-only-packages:end>

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
  assertClassicTs()
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
          `\`${wo.spec}\` is web-only — ${WEB_ONLY_PACKAGES.get(wo.spec) ?? 'no native frontend'} — but this file also imports \`@pyreon/primitives\` (a multiplatform component). Fix: host the web component in a \`<WebView>\`, or use \`@pyreon/primitives\` for UI. See get_pattern({ name: "multiplatform" }).`,
        location: makeLocation(file, source, wo.node, root),
      })
      findingsByCode['web-only-package-import']++
    }

    // Second pass: top-level interface / TS enum / class declarations.
    for (const decl of source.statements) {
      let kind: string | null = null
      let name = ''
      // `interface` is deliberately NOT flagged. PMTC synthesizes a struct
      // from one, verified against both emitters: a plain interface, one with
      // optional fields, one with a nested object field and one with an array
      // field all emit a `struct` / `data class` with ZERO warnings. The
      // shapes it cannot take -- `extends`, generics, a method member -- it
      // WARNS about by name at compile time, which is strictly better than a
      // file-level heuristic that cannot tell those shapes apart. Flagging
      // every interface made this rule fire on three correct files and told
      // their authors to rewrite working code.
      if (ts.isEnumDeclaration(decl)) {
        kind = 'TS enum'
        name = decl.name.text
      } else if (ts.isClassDeclaration(decl)) {
        kind = 'class'
        name = decl.name?.text ?? '<anonymous>'
      }
      if (!kind) continue
      const fix =
        kind === 'TS enum'
          ? `use a string-literal union \`type ${name} = 'a' | 'b'\` (→ native enum)`
          : `move the logic into functions + signals (or \`defineStore\` / \`model()\`)`
      findings.push({
        code: 'native-unsupported-decl',
        message:
          `Top-level \`${kind} ${name}\` is not compiled to native. PMTC warns about it by name when you build, so this is not a silent drop — the audit surfaces it WITHOUT a compile, across the whole project. Fix: ${fix}.`,
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
  assertClassicTs()
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
      message: `\`${wo.spec}\` is web-only — ${WEB_ONLY_PACKAGES.get(wo.spec) ?? 'no native frontend'} — but this is a multiplatform component (imports \`@pyreon/primitives\`).`,
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
    // See the sibling pass above: `interface` is deliberately not flagged,
    // because PMTC compiles one into a struct / data class and warns by name
    // for the shapes it cannot take.
    if (ts.isEnumDeclaration(decl)) {
      kind = 'enum'
      name = decl.name.text
    } else if (ts.isClassDeclaration(decl)) {
      kind = 'class'
      name = decl.name?.text ?? '<anonymous>'
    }
    if (!kind) continue
    const suggested =
      kind === 'enum'
        ? `type ${name} = 'a' | 'b'  // string-literal union → native enum`
        : `move logic into functions + signals (or defineStore / model())`
    const { line, column } = lineCol(decl)
    diags.push({
      code: 'native-unsupported-decl',
      message: `Top-level \`${kind} ${name}\` is not compiled to native. PMTC warns about it by name at build time; this reports it without a compile.`,
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
