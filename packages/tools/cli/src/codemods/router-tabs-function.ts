import { loadTs } from './load-ts'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node
type SourceFile = import('typescript').SourceFile
type Edit = { start: number; end: number; text: string }

/** Local names bound to `name` imported from '@pyreon/router' (aliases included). */
function routerImportLocals(ts: TS, sf: SourceFile, name: string): Set<string> {
  const locals = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== '@pyreon/router' || st.importClause?.isTypeOnly) continue
    const named = st.importClause?.namedBindings
    if (named === undefined || !ts.isNamedImports(named)) continue
    for (const el of named.elements) {
      if (!el.isTypeOnly && (el.propertyName ?? el.name).text === name) locals.add(el.name.text)
    }
  }

  return locals
}

/** Add `routerTabs` to the first value import from '@pyreon/router' (one exists: `createRouter` came from it). */
function addRouterTabsImport(ts: TS, sf: SourceFile, out: string): string {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== '@pyreon/router' || st.importClause?.isTypeOnly) continue
    const named = st.importClause?.namedBindings
    if (named === undefined || !ts.isNamedImports(named) || named.elements.length === 0) continue
    const at = named.elements[named.elements.length - 1]!.getEnd()

    return `${out.slice(0, at)}, routerTabs${out.slice(at)}`
  }

  return out
}

/**
 * `@pyreon/router` 0.54 made per-tab back stacks a value the app imports:
 * `createRouter({ tabs: [...] })` becomes `createRouter({ tabs: routerTabs([...]) })`,
 * so the tab engine is bundled only by apps that use tabs. The old option only
 * ever took an array, so wrapping whatever expression it holds (a literal, a
 * variable, the `{ tabs }` shorthand) is exact. Only an options object passed
 * to `createRouter` imported from `@pyreon/router` (aliases included) is
 * touched; a value already wrapped in `routerTabs(...)` is left alone.
 */
export const routerTabsFunction: Codemod = {
  id: 'router-tabs-function',
  package: '@pyreon/router',
  introducedIn: '0.54.0',
  description: 'Wrap the `tabs` option of `createRouter` in `routerTabs(...)` (same tabs, now a tree-shakable value).',
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!source.includes('@pyreon/router') || !/\btabs\b/.test(source)) return null
    const ts = loadTs('router-tabs-function')
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const creators = routerImportLocals(ts, sf, 'createRouter')
    if (creators.size === 0) return null
    const wrappers = routerImportLocals(ts, sf, 'routerTabs')
    const wrapName = wrappers.values().next().value ?? 'routerTabs'
    const isWrapped = (e: Node): boolean =>
      ts.isCallExpression(e) && ts.isIdentifier(e.expression) && wrappers.has(e.expression.text)

    const edits: Edit[] = []
    const visit = (node: Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && creators.has(node.expression.text)) {
        const opts = node.arguments[0]
        if (opts !== undefined && ts.isObjectLiteralExpression(opts)) {
          for (const p of opts.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'tabs' && !isWrapped(p.initializer)) {
              const v = p.initializer
              edits.push({ start: v.getStart(sf), end: v.getEnd(), text: `${wrapName}(${source.slice(v.getStart(sf), v.getEnd())})` })
            } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'tabs') {
              edits.push({ start: p.getStart(sf), end: p.getEnd(), text: `tabs: ${wrapName}(tabs)` })
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
    if (wrappers.size > 0) return out

    return addRouterTabsImport(ts, ts.createSourceFile(relPath, out, ts.ScriptTarget.ESNext, true, kind), out)
  },
}
