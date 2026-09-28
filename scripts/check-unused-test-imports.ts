#!/usr/bin/env bun
/**
 * Catch unused imports in tests without enabling no-unused-vars for every test
 * callback and fixture parameter. Automated review catches these eventually,
 * but only after the full CI fan-out; this gate gives the same useful signal
 * during validate-fast and before expensive jobs start.
 */
import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export interface UnusedImport {
  file: string
  line: number
  column: number
  name: string
}

function importBindings(source: ts.SourceFile): ts.Identifier[] {
  const out: ts.Identifier[] = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const clause = statement.importClause
    if (!clause) continue
    if (clause.name) out.push(clause.name)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) out.push(bindings.name)
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) out.push(element.name)
    }
  }
  return out
}

/** Find import bindings with no symbol reference outside their declaration. */
export function findUnusedTestImports(files: readonly string[]): UnusedImport[] {
  if (files.length === 0) return []
  const program = ts.createProgram({
    rootNames: [...files],
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
    },
  })
  const checker = program.getTypeChecker()
  const findings: UnusedImport[] = []

  for (const file of files) {
    const source = program.getSourceFile(file)
    if (!source) continue
    const bindings = importBindings(source)
    if (bindings.length === 0) continue
    const wanted = new Map<ts.Symbol, ts.Identifier>()
    const wantedByName = new Map<string, ts.Symbol>()
    for (const binding of bindings) {
      const symbol = checker.getSymbolAtLocation(binding)
      if (symbol) {
        wanted.set(symbol, binding)
        wantedByName.set(binding.text, symbol)
      }
    }
    const used = new Set<ts.Symbol>()
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) return
      if (ts.isIdentifier(node)) {
        if (ts.isExportSpecifier(node.parent)) {
          const local = node.parent.propertyName ?? node.parent.name
          const imported = node === local ? wantedByName.get(node.text) : undefined
          if (imported) used.add(imported)
        }
        // A shorthand (`{ helper }`) is represented by its PROPERTY symbol;
        // ask the checker for the value symbol or every injected-dependency
        // object would look unused.
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node)
        if (symbol && wanted.has(symbol)) used.add(symbol)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const [symbol, binding] of wanted) {
      if (used.has(symbol)) continue
      const pos = source.getLineAndCharacterOfPosition(binding.getStart(source))
      findings.push({
        file,
        line: pos.line + 1,
        column: pos.character + 1,
        name: binding.text,
      })
    }
  }
  return findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  )
}

export function testFiles(root: string): string[] {
  const files: string[] = []
  const skip = new Set(['.git', '.cache', 'node_modules', 'lib', 'dist'])
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(resolve(directory, entry.name))
      } else if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(resolve(directory, entry.name))
      }
    }
  }
  walk(root)
  return files.sort()
}

async function main(): Promise<number> {
  const root = resolve(new URL('..', import.meta.url).pathname)
  const files = testFiles(root)
  const findings = findUnusedTestImports(files)
  const key = (finding: UnusedImport): string => `${relative(root, finding.file)}:${finding.name}`
  const baseline = new Set<string>(
    JSON.parse(
      readFileSync(new URL('./unused-test-imports-baseline.json', import.meta.url), 'utf8'),
    ) as string[],
  )
  const found = new Set(findings.map(key))
  const unexpected = findings.filter((finding) => !baseline.has(key(finding)))
  const stale = [...baseline].filter((entry) => !found.has(entry)).sort()
  if (unexpected.length === 0 && stale.length === 0) {
    console.log(
      `[unused-test-imports] ${files.length} test files checked — no new findings (${baseline.size} baseline)`,
    )
    return 0
  }
  if (stale.length > 0) {
    console.error('[unused-test-imports] stale baseline entries (remove them):')
    for (const entry of stale) console.error(`  ${entry}`)
  }
  if (unexpected.length > 0)
    console.error(`[unused-test-imports] ${unexpected.length} new unused import(s):`)
  for (const finding of unexpected) {
    const file = relative(root, finding.file)
    console.error(`${file}:${finding.line}:${finding.column}  ${finding.name}`)
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(
        `::error file=${file},line=${finding.line},col=${finding.column},title=Unused test import::${finding.name} is imported but never used`,
      )
    }
  }
  return 1
}

if (import.meta.main) process.exit(await main())
