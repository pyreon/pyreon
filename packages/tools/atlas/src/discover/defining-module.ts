/**
 * The file a component is DEFINED in, following re-exports.
 *
 * A component is recorded against the file it was discovered in — for a
 * rocketstyle library that is usually the package barrel, because the
 * component's own module exports it as `default` and only the barrel names it
 * (`export { default as Stack } from './components/Stack'`). That record is
 * right for importing and grouping, and wrong for "show me the source": the
 * Docs view printed forty lines of `export { default as … }` under Stack's
 * heading.
 *
 * Syntactic, relative-only, depth-bounded and cycle-guarded — the same
 * boundaries as `./resolve-types`. When a hop cannot be followed the answer is
 * the last file reached, never a guess.
 */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { resolveSpecifier } from './resolve-types'

const MAX_DEPTH = 6

interface Options {
  read?: (file: string) => string
  resolveFile?: (specifier: string, fromFile: string) => string | undefined
}

/** Does `sf` DECLARE `name` itself (not re-export it from elsewhere)? */
function declaresLocally(sf: ts.SourceFile, name: string): boolean {
  let found = false
  const has = (n: ts.Node, kind: ts.SyntaxKind) =>
    ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === kind) === true
  const isExported = (n: ts.Node) => has(n, ts.SyntaxKind.ExportKeyword)
  const isDefault = (n: ts.Node) => has(n, ts.SyntaxKind.DefaultKeyword)
  sf.forEachChild((node) => {
    if (found) return
    if (name === 'default') {
      if (ts.isExportAssignment(node) && !node.isExportEquals) found = true
      else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && isDefault(node))
        found = true
      return
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      isExported(node) &&
      node.name?.text === name
    ) {
      found = true
    } else if (ts.isVariableStatement(node) && isExported(node)) {
      found = node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === name,
      )
    } else if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      // `const Stack = …; export { Stack }` — a local binding exported by name.
      found = node.exportClause.elements.some((e) => e.name.text === name)
    }
  })
  return found
}

/**
 * Resolve the module that defines `name` as exported from `file`.
 * Returns `file` itself when it declares it, or when nothing can be followed.
 */
export function definingModule(file: string, name: string, options: Options = {}): string {
  const read = options.read ?? ((f: string) => readFileSync(f, 'utf8'))
  const resolveFile = options.resolveFile ?? resolveSpecifier
  const seen = new Set<string>()

  const visit = (current: string, exported: string, depth: number): string | undefined => {
    const key = `${current}#${exported}`
    if (depth > MAX_DEPTH || seen.has(key)) return undefined
    seen.add(key)
    let sf: ts.SourceFile
    try {
      const kind = /\.[jt]sx$/.test(current) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      sf = ts.createSourceFile(current, read(current), ts.ScriptTarget.Latest, true, kind)
    } catch {
      return undefined
    }
    if (declaresLocally(sf, exported)) return current

    const starTargets: string[] = []
    let named: { file: string; name: string } | undefined
    sf.forEachChild((node) => {
      if (named || !ts.isExportDeclaration(node) || !node.moduleSpecifier) return
      // A module specifier is always a string literal in valid source.
      const next = resolveFile((node.moduleSpecifier as ts.StringLiteral).text, current)
      if (!next) return
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const hit = node.exportClause.elements.find((e) => e.name.text === exported)
        if (hit) named = { file: next, name: (hit.propertyName ?? hit.name).text }
      } else if (!node.exportClause) {
        starTargets.push(next)
      }
    })
    if (named) return visit(named.file, named.name, depth + 1) ?? named.file
    // `export * from` — the name is in whichever target actually has it.
    for (const target of starTargets) {
      const hit = visit(target, exported, depth + 1)
      if (hit) return hit
    }
    return undefined
  }

  return visit(file, name, 0) ?? file
}
