#!/usr/bin/env bun
/**
 * audit-types — find typed-but-unimplemented public surfaces.
 *
 * Walks every `.ts` file in a target package's `src/`, extracts every
 * exported interface field, and counts references in non-type, non-test
 * source. Fields with ZERO references are likely typed-but-unimplemented:
 * they appear in the public API surface but no runtime code reads them.
 *
 * Why this exists: 0.14.0 shipped with `ssg.paths`, `isr.revalidate`,
 * and `Adapter.build()` typed in the public API but never read by any
 * runtime code. Apps using those features silently no-op'd. The existing
 * test suite couldn't catch it because nothing exercised the typed
 * surface end-to-end. This audit catches it at PR time by checking
 * "does any runtime code path actually consume what the public types
 * claim consumers can configure?"
 *
 * The audit is heuristic — false positives are expected. Use the report
 * to triage. Exemptions go in `EXEMPT_FIELDS`.
 *
 * Run:
 *   bun run audit-types                  # default — audit @pyreon/zero
 *   bun run audit-types <package>        # audit a specific package
 *   bun run audit-types --strict         # exit non-zero if any HIGH findings
 *   bun run audit-types --json           # machine-readable output
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'

const REPO_ROOT = resolve(import.meta.dir, '..')

// ─── Exemptions ─────────────────────────────────────────────────────────────
//
// Fields legitimately unread by runtime — typically external-consumer
// surfaces (return types, adapter contracts users implement) or
// self-describing metadata. Add a one-line justification per entry.

interface Exemption {
  package: string
  /** Interface name */
  interface: string
  /** Field name on that interface */
  field: string
  /** Why it's OK to be unread by runtime */
  reason: string
}

const EXEMPT_FIELDS: Exemption[] = [
  // `RouteMeta.requiresAuth` is a CONVENTION read by user-defined
  // navigation guards (the doc-comment literally says "if true, guards
  // can redirect to login"). The router itself doesn't read it — that's
  // by design. Cleanest possible "user-side contract" shape; no runtime
  // gap to close.
  {
    package: '@pyreon/router',
    interface: 'RouteMeta',
    field: 'requiresAuth',
    reason: 'user-side convention — read by user-defined NavigationGuards, not the router runtime',
  },
  // `NativeItem.__isNative` is a brand marker read by `@pyreon/runtime-dom`
  // (mount.ts, nodes.ts, hydrate.ts, template.ts). The audit's heuristic
  // only scans within the defining package (`@pyreon/core`), so a
  // cross-package brand is structurally invisible to it. Dual-package
  // brand → exempt.
  {
    package: '@pyreon/core',
    interface: 'NativeItem',
    field: '__isNative',
    reason: 'brand marker consumed cross-package by @pyreon/runtime-dom (mount/nodes/hydrate/template)',
  },
]

// File-level exemptions — entire files whose interfaces are
// pass-through type catalogs (HTML attribute lists, prop-forwarding
// surfaces). Their fields are consumed by dynamic key iteration
// in `applyProps`-style DOM forwarders, not by name.
const EXEMPT_FILES: RegExp[] = [
  /jsx-runtime\.ts$/, // HTML/SVG attribute type catalog — DOM forwarder uses dynamic keys
  /jsx-dev-runtime\.ts$/,
  /\.d\.ts$/, // ambient declarations
]

function isFileExempt(filePath: string): boolean {
  return EXEMPT_FILES.some((re) => re.test(filePath))
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'OK'

interface FieldFinding {
  package: string
  /** Owning interface or type */
  interface: string
  field: string
  /** File where the interface is declared */
  declaredIn: string
  /** Line in declaredIn */
  declaredLine: number
  /** Number of references to `.field` outside type/test files */
  refCount: number
  severity: Severity
}

// ─── Walk source files ──────────────────────────────────────────────────────

function* walkSourceFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      // Skip test, dist, lib, node_modules
      if (
        entry === 'tests' ||
        entry === '__tests__' ||
        entry === 'lib' ||
        entry === 'dist' ||
        entry === 'node_modules' ||
        entry.startsWith('.')
      ) {
        continue
      }
      yield* walkSourceFiles(path)
    } else if (stat.isFile()) {
      // Only .ts/.tsx, skip declaration files (.d.ts) and tests
      if (!/\.(ts|tsx)$/.test(entry)) continue
      if (entry.endsWith('.d.ts')) continue
      if (/\.test\.(ts|tsx)$/.test(entry)) continue
      if (/\.spec\.(ts|tsx)$/.test(entry)) continue
      if (/\.bench\.(ts|tsx)$/.test(entry)) continue
      yield path
    }
  }
}

// ─── Extract exported interface/type fields via oxc AST ────────────────────

interface ExtractedField {
  interface: string
  field: string
  /** 0-based offset in source */
  offset: number
}

function extractFields(filename: string, code: string): ExtractedField[] {
  let ast: { program: unknown }
  try {
    ast = parseSync(filename, code, {
      sourceType: 'module',
      lang: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    }) as { program: unknown }
  } catch {
    return []
  }

  const out: ExtractedField[] = []

  // Walk top-level program body for exported interfaces / type aliases.
  // We don't recurse into nested type literals here — a "leaf" field of a
  // nested object type (e.g. `ssg: { paths: ... }`) is captured because
  // we walk into TSTypeLiteral too.
  const program = ast.program as { body?: any[] }
  for (const node of program.body ?? []) {
    visit(node)
  }

  function visit(node: any): void {
    if (!node || typeof node !== 'object') return

    // Top-level export named declaration → unwrap
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      visit(node.declaration)
      return
    }

    // Interface declaration
    if (node.type === 'TSInterfaceDeclaration') {
      const name = node.id?.name as string
      // Body is TSInterfaceBody with .body[] of TSPropertySignature
      for (const member of node.body?.body ?? []) {
        collectField(member, name)
      }
      return
    }

    // Type alias → if it points at a type literal, walk it
    if (node.type === 'TSTypeAliasDeclaration') {
      const name = node.id?.name as string
      walkTypeAnnotation(node.typeAnnotation, name)
      return
    }
  }

  function walkTypeAnnotation(t: any, ownerName: string): void {
    if (!t || typeof t !== 'object') return
    if (t.type === 'TSTypeLiteral') {
      for (const member of t.members ?? []) {
        collectField(member, ownerName)
      }
    }
    // Union / intersection → walk each arm
    if (t.type === 'TSUnionType' || t.type === 'TSIntersectionType') {
      for (const arm of t.types ?? []) {
        walkTypeAnnotation(arm, ownerName)
      }
    }
  }

  function collectField(member: any, ownerName: string): void {
    if (!member || member.type !== 'TSPropertySignature') return
    const key = member.key
    if (!key) return
    const fieldName = key.type === 'Identifier' ? key.name : undefined
    if (!fieldName) return
    out.push({
      interface: ownerName,
      field: fieldName,
      offset: (member.start as number) ?? 0,
    })

    // Walk into the field's type for nested object types — captures
    // `ssg.paths` when ssg is an inline `{ paths: ... }` literal.
    const ann = member.typeAnnotation?.typeAnnotation
    if (ann && ann.type === 'TSTypeLiteral') {
      for (const sub of ann.members ?? []) {
        collectField(sub, `${ownerName}.${fieldName}`)
      }
    }
  }

  return out
}

// ─── Reference counting ─────────────────────────────────────────────────────

function offsetToLine(code: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === '\n') line++
  }
  return line
}

function countReferences(
  packageDir: string,
  fieldName: string,
  declaringFile: string,
  declarationOffset: number,
): number {
  // Whole-word match across the package's src/ — captures every shape:
  //   - Member access:        `.field`
  //   - Bracket access:       `['field']`
  //   - Destructuring:        `const { field } = obj`
  //   - Object literal:       `{ field: value }`
  //   - Multiline object:     all of the above split across lines
  //
  // Trade-off: same-named locals and comments match too. For this audit
  // that's the right direction — the bug class we're catching is
  // "field is typed but NEVER mentioned anywhere else." A permissive
  // match still flags those (zero refs even with this lenient pattern
  // = almost certainly unimplemented).
  //
  // We count the field name occurrences and subtract 1 for the
  // declaration itself (we know its exact location in the declaring
  // file).
  const pattern = new RegExp(`\\b${escapeRegex(fieldName)}\\b`, 'g')
  let count = 0
  for (const file of walkSourceFiles(packageDir)) {
    const code = readFileSync(file, 'utf-8')
    // Strip block + line comments so doc references don't inflate counts
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const matches = stripped.match(pattern)
    count += matches?.length ?? 0
  }

  // Subtract one occurrence for the field's declaration. The declaration
  // is a property name (`field:` or `field?:`) which our `\bfield\b`
  // pattern matches. We know declarationOffset is in declaringFile so
  // the count for that file includes the declaration.
  void declarationOffset
  void declaringFile
  return Math.max(0, count - 1)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Severity ───────────────────────────────────────────────────────────────

function severityFor(refCount: number): Severity {
  if (refCount === 0) return 'HIGH'
  if (refCount <= 2) return 'MEDIUM'
  if (refCount <= 5) return 'LOW'
  return 'OK'
}

// ─── Audit a single package ─────────────────────────────────────────────────

function isExempt(pkg: string, ifaceName: string, fieldName: string): boolean {
  return EXEMPT_FIELDS.some(
    (e) => e.package === pkg && e.interface === ifaceName && e.field === fieldName,
  )
}

interface AuditResult {
  package: string
  packageDir: string
  findings: FieldFinding[]
}

function auditPackage(packageName: string): AuditResult {
  const candidates = [
    join(REPO_ROOT, 'packages', 'zero', packageName.replace('@pyreon/', '')),
    join(REPO_ROOT, 'packages', 'core', packageName.replace('@pyreon/', '')),
    join(REPO_ROOT, 'packages', 'fundamentals', packageName.replace('@pyreon/', '')),
    join(REPO_ROOT, 'packages', 'tools', packageName.replace('@pyreon/', '')),
    join(REPO_ROOT, 'packages', 'ui-system', packageName.replace('@pyreon/', '')),
    join(REPO_ROOT, 'packages', 'ui', packageName.replace('@pyreon/', '')),
  ]
  const packageDir = candidates.find((c) => existsSync(join(c, 'package.json')))
  if (!packageDir) {
    throw new Error(`could not locate package ${packageName} under packages/*/`)
  }

  const srcDir = join(packageDir, 'src')
  const findings: FieldFinding[] = []

  for (const file of walkSourceFiles(srcDir)) {
    if (isFileExempt(file)) continue
    const code = readFileSync(file, 'utf-8')
    const fields = extractFields(file, code)
    for (const f of fields) {
      if (isExempt(packageName, f.interface, f.field)) continue
      const refCount = countReferences(srcDir, f.field, file, f.offset)
      const severity = severityFor(refCount)
      findings.push({
        package: packageName,
        interface: f.interface,
        field: f.field,
        declaredIn: relative(REPO_ROOT, file),
        declaredLine: offsetToLine(code, f.offset),
        refCount,
        severity,
      })
    }
  }

  return { package: packageName, packageDir, findings }
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function formatReport(results: AuditResult[]): string {
  const lines: string[] = []
  lines.push('# audit-types report')
  lines.push('')

  for (const result of results) {
    const allFindings = result.findings
    const high = allFindings.filter((f) => f.severity === 'HIGH')
    const medium = allFindings.filter((f) => f.severity === 'MEDIUM')

    lines.push(`## ${result.package}`)
    lines.push('')
    lines.push(`Total fields scanned: ${allFindings.length}`)
    lines.push(
      `HIGH: ${high.length} (zero refs)  ` +
        `MEDIUM: ${medium.length} (1-2 refs)  ` +
        `LOW+OK: ${allFindings.length - high.length - medium.length}`,
    )
    lines.push('')

    if (high.length > 0) {
      lines.push('### HIGH — fields with ZERO non-type references')
      lines.push('')
      lines.push('| Interface | Field | Declared in | Refs |')
      lines.push('|---|---|---|---|')
      for (const f of high.sort(byInterfaceField)) {
        lines.push(`| \`${f.interface}\` | \`${f.field}\` | ${f.declaredIn}:${f.declaredLine} | ${f.refCount} |`)
      }
      lines.push('')
    }

    if (medium.length > 0) {
      lines.push('### MEDIUM — fields with 1-2 references (worth investigating)')
      lines.push('')
      lines.push('| Interface | Field | Declared in | Refs |')
      lines.push('|---|---|---|---|')
      for (const f of medium.sort(byInterfaceField)) {
        lines.push(`| \`${f.interface}\` | \`${f.field}\` | ${f.declaredIn}:${f.declaredLine} | ${f.refCount} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function byInterfaceField(a: FieldFinding, b: FieldFinding): number {
  if (a.interface !== b.interface) return a.interface.localeCompare(b.interface)
  return a.field.localeCompare(b.field)
}

// ─── CLI ────────────────────────────────────────────────────────────────────

interface CliArgs {
  packages: string[]
  strict: boolean
  json: boolean
  all: boolean
}

// Curated set of "high-risk" packages — those whose surface includes
// config-shaped types that historically harbor typed-but-unimplemented
// bugs (modes, adapters, middleware config, route metadata, etc.).
//
// Run with `--all` to audit the full set. Not exhaustive — the
// framework has 50+ packages and most have small enough surfaces that
// a per-PR audit would just be noise. Add packages here when a new
// typed-but-unimplemented bug surfaces in one (the catalog grows from
// failures, not from speculation).
const HIGH_RISK_PACKAGES = [
  '@pyreon/zero',
  '@pyreon/router',
  '@pyreon/core',
  '@pyreon/server',
  '@pyreon/runtime-server',
  '@pyreon/vite-plugin',
]

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { packages: [], strict: false, json: false, all: false }
  for (const a of argv) {
    if (a === '--strict') out.strict = true
    else if (a === '--json') out.json = true
    else if (a === '--all') out.all = true
    else if (!a.startsWith('--')) out.packages.push(a)
  }
  if (out.all) out.packages = [...HIGH_RISK_PACKAGES]
  if (out.packages.length === 0) out.packages = ['@pyreon/zero']
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const results: AuditResult[] = []
  for (const pkg of args.packages) {
    process.stderr.write(`[audit-types] scanning ${pkg}\n`)
    results.push(auditPackage(pkg))
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(results, null, 2))
    process.stdout.write('\n')
  } else {
    process.stdout.write(formatReport(results))
  }

  if (args.strict) {
    const totalHigh = results.reduce((acc, r) => acc + r.findings.filter((f) => f.severity === 'HIGH').length, 0)
    if (totalHigh > 0) {
      process.stderr.write(`\n[audit-types] STRICT FAIL: ${totalHigh} HIGH finding(s)\n`)
      process.exit(1)
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[audit-types] crashed: ${err}\n`)
  process.exit(2)
})
