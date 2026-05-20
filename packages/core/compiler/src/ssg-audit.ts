/**
 * Project-wide SSG audit — scans route files for SSG / ISR foot-guns
 * surfaced by the SSG roadmap PRs (L5, A, I). Three detector codes ship
 * today:
 *
 *  - **`404-outside-layout-dir`** (PR L5 carve-out): a `_404.tsx` (or
 *    `_not-found.tsx`) file NOT co-located with a `_layout.tsx`. PR L5's
 *    `findNotFoundFallback` filters to layout records with `children`;
 *    a standalone `_404.tsx` outside a layout directory renders via the
 *    SSG entry's pre-L5 standalone path (no layout chrome). The audit
 *    catches this at the filesystem level so users move their
 *    `_404.tsx` into the canonical `_layout` directory.
 *
 *  - **`dynamic-route-missing-get-static-paths`** (PR A consequence): a
 *    dynamic route file (`[id].tsx`, `[...slug].tsx`) that lacks a
 *    `getStaticPaths` export. The SSG plugin silently SKIPS the route
 *    during auto-detect — the user thinks `/posts/1` etc. are
 *    prerendered but the dist has no `dist/posts/<id>/index.html`. The
 *    audit catches this at scan time so users add the enumerator OR
 *    declare the route as runtime-only.
 *
 *  - **`non-literal-revalidate-export`** (PR I limitation): a route
 *    file exports `export const revalidate = TTL` (variable reference)
 *    or `export const revalidate = ...` (expression). The literal-
 *    capture path in `extractLiteralExport` skips non-literals — the
 *    manifest's revalidate entry is omitted, platform-driven ISR is
 *    silently unconfigured for that route. The audit catches this so
 *    users inline the literal (`export const revalidate = 60`).
 *
 * Real-app coverage:
 *   - Per-code synthetic-fixture tests in `tests/ssg-audit.test.ts`
 *     (one fixture per finding type, bisect-verified by reverting the
 *     detector's match condition)
 *   - Doctor wiring at `packages/tools/cli/src/doctor.ts:checkSsg`,
 *     CLI flag `pyreon doctor --check-ssg [--json]`
 *
 * Same syntactic-only style as `island-audit.ts` — no type-check pass,
 * no module resolution. False negatives acceptable; false positives
 * must be rare. Every finding ships with file path + line/column +
 * actionable fix suggestion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

export type SsgFindingCode =
  | '404-outside-layout-dir'
  | 'dynamic-route-missing-get-static-paths'
  | 'non-literal-revalidate-export'

export interface SsgLocation {
  /** Absolute path */
  path: string
  /** Path relative to the repo root for readable reporting */
  relPath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
}

export interface SsgFinding {
  code: SsgFindingCode
  /** One-paragraph human-readable explanation, including the fix path. */
  message: string
  /** Where the finding surfaces. */
  location: SsgLocation
  /**
   * Companion locations for cross-file findings. Not currently emitted
   * by any detector but kept in the contract so future codes have the
   * shape available without an API change.
   */
  related?: SsgLocation[] | undefined
}

export interface SsgAuditResult {
  root: string | null
  findings: SsgFinding[]
  summary: {
    filesScanned: number
    routesScanned: number
    dynamicRoutes: number
    revalidateExports: number
    findingsByCode: Record<SsgFindingCode, number>
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

/**
 * Walk a directory looking for files under any `routes/` subdirectory.
 * fs-router treats files under `src/routes/` as routes; we mirror the
 * convention. Skips node_modules / lib / dist / test directories.
 */
function findRouteFiles(rootDir: string, out: string[], depth = 0): void {
  if (depth > 12) return
  let entries: string[]
  try {
    entries = readdirSync(rootDir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules' || name === 'lib' || name === 'dist') continue
    if (name === '__tests__' || name === 'tests') continue
    const full = join(rootDir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      // If this directory is named `routes`, descend and collect every
      // route file under it. Otherwise recurse into the directory
      // looking for nested `routes/` directories (handles
      // `examples/<app>/src/routes/`).
      if (name === 'routes') {
        walkRoutesDir(full, out)
      } else {
        findRouteFiles(full, out, depth + 1)
      }
      continue
    }
  }
}

function walkRoutesDir(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules') continue
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkRoutesDir(full, out)
      continue
    }
    if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\.(tsx?|jsx?)$/.test(name)) {
      out.push(full)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AST parse helpers (shared shape with island-audit.ts)
// ═══════════════════════════════════════════════════════════════════════════════

function parseSourceFile(filePath: string): ts.SourceFile | null {
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
}

function locOf(source: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const pos = source.getLineAndCharacterOfPosition(node.getStart(source))
  return { line: pos.line + 1, column: pos.character + 1 }
}

function makeLocation(
  absPath: string,
  source: ts.SourceFile,
  node: ts.Node,
  rootForRel: string,
): SsgLocation {
  const { line, column } = locOf(source, node)
  return {
    path: absPath,
    relPath: relative(rootForRel, absPath),
    line,
    column,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detectors
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 1) `_404.tsx` / `_not-found.tsx` outside a `_layout.tsx` directory.
 *
 * fs-router scans `_404.tsx` / `_not-found.tsx` and attaches the default
 * export as `notFoundComponent` on its parent layout's RouteRecord. PR L5's
 * `findNotFoundFallback` filters to records with `Array.isArray(r.children)
 * && r.children.length > 0` — i.e. layouts only. A standalone `_404.tsx`
 * outside a layout directory:
 *   - Becomes attached to a page record (no children)
 *   - PR L5's walker skips it
 *   - SSG entry falls back to the pre-L5 standalone render (no chrome)
 *
 * The audit catches this at filesystem-walk time, fast and structural.
 */
function detect404OutsideLayoutDir(
  routeFiles: readonly string[],
  rootForRel: string,
): SsgFinding[] {
  const findings: SsgFinding[] = []
  // Build a Set of directories that contain a `_layout.{tsx,ts,jsx,js}` file.
  const layoutDirs = new Set<string>()
  for (const file of routeFiles) {
    const base = file.split('/').pop() ?? ''
    if (/^_layout\.(tsx?|jsx?)$/.test(base)) {
      layoutDirs.add(dirname(file))
    }
  }
  for (const file of routeFiles) {
    const base = file.split('/').pop() ?? ''
    if (!/^_(404|not-found)\.(tsx?|jsx?)$/.test(base)) continue
    const dir = dirname(file)
    if (layoutDirs.has(dir)) continue
    // Synthesize a location at line 1 col 1 — the FILE itself is the
    // finding, not a specific line inside it.
    findings.push({
      code: '404-outside-layout-dir',
      message:
        `${base} is not co-located with a _layout.tsx — without a parent layout, PR L5's ` +
        `findNotFoundFallback won't pick it up at SSG time and the 404 will render WITHOUT ` +
        `layout chrome (nav, footer, providers). Move ${base} into a directory that contains ` +
        `_layout.tsx (the canonical pattern: src/routes/_layout.tsx + src/routes/_404.tsx).`,
      location: {
        path: file,
        relPath: relative(rootForRel, file),
        line: 1,
        column: 1,
      },
    })
  }
  return findings
}

/**
 * 2) Dynamic route file missing `getStaticPaths` export.
 *
 * `[id].tsx`, `[...slug].tsx` — under SSG mode without a `getStaticPaths`,
 * the auto-detect step silently skips the route. User expects
 * `dist/posts/1/index.html` but never gets it.
 *
 * We syntactically scan for `export const getStaticPaths` or
 * `export function getStaticPaths`. Re-exports / async-function form
 * supported. Same literal-extraction shape used in fs-router's scanner.
 */
function detectDynamicRouteMissingGetStaticPaths(
  routeFiles: readonly string[],
  rootForRel: string,
): SsgFinding[] {
  const findings: SsgFinding[] = []
  for (const file of routeFiles) {
    const base = file.split('/').pop() ?? ''
    // CodeQL #12: `.+` is greedy + unbounded; `[^\]]+` matches the
    // bracket content without backtrack potential and can't overshoot
    // the closing `]`. Filenames are OS-bounded (~255 chars) anyway.
    if (!/\[[^\]]+\]/.test(base)) continue
    // Skip layouts / errors / 404s — only PAGE files take getStaticPaths.
    if (/^_(layout|error|loading|404|not-found)\./.test(base)) continue
    // Skip API routes under `routes/api/` (path-based convention).
    // fs-router treats `api/` as the runtime-handler namespace; pages
    // are everything else. Caught originally in M3.B against cpa-pw-blog's
    // `api/echo/[...path].ts`.
    if (/[/\\]routes[/\\]api[/\\]/.test(file)) continue
    const source = parseSourceFile(file)
    if (!source) continue
    let hasGetStaticPaths = false
    let hasDefaultExport = false
    function visit(node: ts.Node): void {
      if (hasGetStaticPaths && hasDefaultExport) return
      if (ts.isVariableStatement(node)) {
        const hasExport = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        )
        if (hasExport) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === 'getStaticPaths') {
              hasGetStaticPaths = true
            }
          }
        }
      }
      if (ts.isFunctionDeclaration(node)) {
        const hasExport = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        )
        const isDefault = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
        )
        if (hasExport && node.name?.text === 'getStaticPaths') {
          hasGetStaticPaths = true
        }
        if (hasExport && isDefault) {
          hasDefaultExport = true
        }
      }
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        // `export default <expr>`
        hasDefaultExport = true
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    // Files without `export default` are API routes by structure. Skip.
    // Page routes require a default-exported component (fs-router renders
    // `route.component`); files exporting only method handlers
    // (`GET` / `POST` / etc.) without a default are API routes wherever
    // they sit in the tree.
    if (!hasDefaultExport) continue
    if (!hasGetStaticPaths) {
      findings.push({
        code: 'dynamic-route-missing-get-static-paths',
        message:
          `Dynamic route "${base}" has no \`getStaticPaths\` export — under \`mode: 'ssg'\` ` +
          `the auto-detect step SILENTLY SKIPS this route, so the dist won't contain prerendered HTML. ` +
          `Either add \`export const getStaticPaths = () => [{ params: { ... } }, ...]\` enumerating ` +
          `the concrete values, OR declare the route as runtime-only by switching to mode: 'ssr' / 'isr'.`,
        location: {
          path: file,
          relPath: relative(rootForRel, file),
          line: 1,
          column: 1,
        },
      })
    }
  }
  return findings
}

/**
 * 3) `export const revalidate = X` where X is NOT a pure literal.
 *
 * PR I's `extractLiteralExport` skips re-export forms (`const x = 60;
 * export { x as revalidate }`) and non-literal expressions
 * (`export const revalidate = TTL` where TTL is a const elsewhere). The
 * manifest emission skips the entry silently — user thinks ISR is wired
 * but `_pyreon-revalidate.json` is missing the path. The audit catches
 * the syntactic shape and warns.
 *
 * Valid literals: NumericLiteral (`60`), FalseKeyword (`false`).
 * Anything else — Identifier reference, BinaryExpression, CallExpression,
 * TemplateLiteral — flagged.
 */
function detectNonLiteralRevalidateExport(
  routeFiles: readonly string[],
  rootForRel: string,
): SsgFinding[] {
  const findings: SsgFinding[] = []
  for (const file of routeFiles) {
    const parsed = parseSourceFile(file)
    if (!parsed) continue
    const source: ts.SourceFile = parsed
    function visit(node: ts.Node): void {
      if (ts.isVariableStatement(node)) {
        const hasExport = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        )
        if (!hasExport) {
          ts.forEachChild(node, visit)
          return
        }
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || decl.name.text !== 'revalidate') continue
          const init = decl.initializer
          if (!init) continue
          // Accept NumericLiteral and `false` keyword.
          if (ts.isNumericLiteral(init)) continue
          if (init.kind === ts.SyntaxKind.FalseKeyword) continue
          // Anything else is a non-literal that PR I's extractor skips.
          findings.push({
            code: 'non-literal-revalidate-export',
            message:
              `\`export const revalidate\` must be a NUMERIC LITERAL (e.g. \`60\`, \`3600\`) or ` +
              `\`false\` — non-literal expressions (variable references, math, function calls, ` +
              `template literals) are silently dropped from the build-time ISR manifest (PR I's ` +
              `extractLiteralExport limitation). Inline the value: \`export const revalidate = 60\`.`,
            location: makeLocation(file, source, init, rootForRel),
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return findings
}

// ═══════════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════════

export function auditSsg(rootDir: string): SsgAuditResult {
  const root = findMonorepoRoot(rootDir) ?? rootDir
  const routeFiles: string[] = []
  findRouteFiles(rootDir, routeFiles)

  // Count dynamic routes + revalidate exports for the summary (independent
  // of whether each emitted a finding) — useful signal in the JSON output.
  let dynamicRoutes = 0
  let revalidateExports = 0
  for (const file of routeFiles) {
    const base = file.split('/').pop() ?? ''
    // CodeQL #13: same fix as line 282 — bounded inner class.
    if (/\[[^\]]+\]/.test(base) && !/^_(layout|error|loading|404|not-found)\./.test(base)) {
      dynamicRoutes++
    }
    const source = parseSourceFile(file)
    if (!source) continue
    function visit(node: ts.Node): void {
      if (ts.isVariableStatement(node)) {
        const hasExport = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        )
        if (hasExport) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === 'revalidate') {
              revalidateExports++
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  const findings: SsgFinding[] = [
    ...detect404OutsideLayoutDir(routeFiles, root),
    ...detectDynamicRouteMissingGetStaticPaths(routeFiles, root),
    ...detectNonLiteralRevalidateExport(routeFiles, root),
  ]

  const findingsByCode: Record<SsgFindingCode, number> = {
    '404-outside-layout-dir': 0,
    'dynamic-route-missing-get-static-paths': 0,
    'non-literal-revalidate-export': 0,
  }
  for (const f of findings) findingsByCode[f.code]++

  return {
    root,
    findings,
    summary: {
      filesScanned: routeFiles.length,
      routesScanned: routeFiles.length,
      dynamicRoutes,
      revalidateExports,
      findingsByCode,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter (mirrors formatIslandAudit)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SsgAuditFormatOptions {
  /** Filter findings to a minimum severity. Currently all SSG findings
   *  are 'warning'-level; reserved for future severity tiers. */
  minSeverity?: 'warning' | 'error' | undefined
}

export function formatSsgAudit(
  result: SsgAuditResult,
  _options: SsgAuditFormatOptions = {},
): string {
  const lines: string[] = []
  lines.push('── SSG audit ─────────────────────────────────────────────────────')
  lines.push('')
  lines.push(
    `Scanned ${result.summary.routesScanned} route file(s), ${result.summary.dynamicRoutes} dynamic route(s), ${result.summary.revalidateExports} revalidate export(s).`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✓ No SSG / ISR issues found.')
    lines.push('')
    return lines.join('\n')
  }
  lines.push(`Found ${result.findings.length} issue(s):`)
  for (const f of result.findings) {
    lines.push('')
    lines.push(`  [${f.code}] ${f.location.relPath}:${f.location.line}:${f.location.column}`)
    lines.push(`    ${f.message}`)
  }
  lines.push('')
  lines.push('Run `pyreon doctor --check-ssg --json` for machine-readable output.')
  lines.push('')
  return lines.join('\n')
}
