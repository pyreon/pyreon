import { loadTs } from './load-ts'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node
type Identifier = import('typescript').Identifier

const MODULE = '@pyreon/runtime-dom'

/** Is `id` a binding NAME at a declaration site (not a reference)? */
function isDeclarationName(ts: TS, id: Identifier): boolean {
  const p = id.parent
  return (
    (ts.isVariableDeclaration(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p) ||
      ts.isImportSpecifier(p) ||
      ts.isImportClause(p) ||
      ts.isNamespaceImport(p) ||
      ts.isImportEqualsDeclaration(p) ||
      ts.isEnumDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isInterfaceDeclaration(p)) &&
    p.name === id
  )
}

/** Is `id` a property / member NAME rather than a variable reference? */
function isMemberName(ts: TS, id: Identifier): boolean {
  const p = id.parent
  if (ts.isPropertyAccessExpression(p) && p.name === id) return true
  if (ts.isQualifiedName(p) && p.right === id) return true
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isJsxAttribute(p) ||
      ts.isEnumMember(p)) &&
    p.name === id
  ) {
    return true
  }
  if ((ts.isBindingElement(p) || ts.isImportSpecifier(p)) && p.propertyName === id) return true
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return true

  return false
}

interface Ctx {
  ts: TS
  sf: import('typescript').SourceFile
  source: string
  edits: { start: number; end: number; text: string }[]
}

interface ImportScan {
  plainRender: import('typescript').ImportSpecifier | undefined
  mountImported: boolean
  namespaces: Set<string>
}

const replace = (ctx: Ctx, n: Node, text: string): void => {
  ctx.edits.push({ start: n.getStart(ctx.sf), end: n.getEnd(), text })
}

const fromModule = (ts: TS, spec: import('typescript').Expression | undefined): boolean =>
  spec !== undefined && ts.isStringLiteral(spec) && spec.text === MODULE

/** `render` specifiers of imports from the module. Aliased ones are rewritten here. */
function scanImport(ctx: Ctx, named: import('typescript').NamedImportBindings, scan: ImportScan): void {
  const { ts } = ctx
  if (ts.isNamespaceImport(named)) {
    scan.namespaces.add(named.name.text)
    return
  }
  for (const el of named.elements) {
    const imported = (el.propertyName ?? el.name).text
    if (imported === 'mount' && el.name.text === 'mount') scan.mountImported = true
    if (imported !== 'render') continue
    // `render as r` keeps its local name: only the imported name changes.
    if (el.propertyName !== undefined) replace(ctx, el.propertyName, 'mount')
    else scan.plainRender = el
  }
}

/** `export { render } from '@pyreon/runtime-dom'` keeps its public name. */
function rewriteReExport(ctx: Ctx, clause: import('typescript').NamedExports): void {
  for (const el of clause.elements) {
    if ((el.propertyName ?? el.name).text !== 'render') continue
    if (el.propertyName !== undefined) replace(ctx, el.propertyName, 'mount')
    else replace(ctx, el, 'mount as render')
  }
}

function scanModuleStatements(ctx: Ctx): ImportScan {
  const { ts } = ctx
  const scan: ImportScan = { plainRender: undefined, mountImported: false, namespaces: new Set() }
  for (const st of ctx.sf.statements) {
    if (ts.isImportDeclaration(st) && fromModule(ts, st.moduleSpecifier)) {
      const named = st.importClause?.namedBindings
      if (named !== undefined) scanImport(ctx, named, scan)
    } else if (ts.isExportDeclaration(st) && fromModule(ts, st.moduleSpecifier)) {
      const clause = st.exportClause
      if (clause !== undefined && ts.isNamedExports(clause)) rewriteReExport(ctx, clause)
    }
  }

  return scan
}

/** What an identifier named `render` / `mount` (not a member name) means for the rename. */
function classify(ts: TS, node: Identifier, mountImported: boolean): 'conflict' | 'ref' | 'ignore' {
  const p = node.parent
  const name = node.text
  if (ts.isExportSpecifier(p)) {
    // `export { render }` of the local binding: keep that public name.
    return p.parent.parent.moduleSpecifier === undefined ? 'conflict' : 'ignore'
  }
  if (isDeclarationName(ts, node)) {
    const ourImport = ts.isImportSpecifier(p) && fromModule(ts, p.parent.parent.parent.moduleSpecifier)
    return ourImport ? 'ignore' : 'conflict'
  }
  // `{ mount }` would capture the renamed binding — leave the body alone.
  if (ts.isShorthandPropertyAssignment(p) && name === 'mount') return 'conflict'
  if (name === 'render') return 'ref'
  // A `mount` reference with no `mount` import is some other binding.
  return mountImported ? 'ignore' : 'conflict'
}

/** Collect `render` references, rewrite `ns.render`, and detect an unsafe rename. */
function scanBody(ctx: Ctx, scan: ImportScan): { refs: Identifier[]; conflict: boolean } {
  const { ts } = ctx
  const refs: Identifier[] = []
  let conflict = false
  const visit = (node: Node): void => {
    if (ts.isIdentifier(node)) {
      if ((node.text === 'render' || node.text === 'mount') && !isMemberName(ts, node)) {
        const kind = classify(ts, node, scan.mountImported)
        if (kind === 'conflict') conflict = true
        else if (kind === 'ref') refs.push(node)
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      scan.namespaces.has(node.expression.text) &&
      node.name.text === 'render'
    ) {
      replace(ctx, node.name, 'mount')
    }
    ts.forEachChild(node, visit)
  }
  visit(ctx.sf)

  return { refs, conflict }
}

/** Turn `import { render }` into `mount`, or drop it when `mount` is already imported. */
function rewritePlainImport(ctx: Ctx, spec: import('typescript').ImportSpecifier, mountImported: boolean): void {
  if (!mountImported) {
    replace(ctx, spec, 'mount')
    return
  }
  const list = spec.parent.elements
  if (list.length === 1) {
    // `import { render } from …` next to a separate `mount` import: drop the declaration.
    const decl = spec.parent.parent.parent
    const end = ctx.source[decl.getEnd()] === '\n' ? decl.getEnd() + 1 : decl.getEnd()
    ctx.edits.push({ start: decl.getStart(ctx.sf), end, text: '' })

    return
  }
  // Drop the specifier together with one adjacent comma.
  const i = list.indexOf(spec)
  const start = i > 0 ? (list[i - 1] as Node).getEnd() : spec.getStart(ctx.sf)
  const end = i > 0 ? spec.getEnd() : (list[i + 1] as Node).getStart(ctx.sf)
  ctx.edits.push({ start, end, text: '' })
}

/**
 * `@pyreon/runtime-dom` 0.54 removed `render`, which was `export const render
 * = mount` — the same function under a second name. Switching an import to
 * `mount` is therefore semantics-preserving.
 *
 * - `import { render } from '@pyreon/runtime-dom'` becomes `import { mount }`
 *   and every reference to that binding is renamed (`{ render }` shorthand
 *   becomes `{ render: mount }`). When the file already imports `mount` from
 *   the same module, the `render` specifier is dropped.
 * - When renaming is not provably safe (the file declares another `render` or
 *   `mount`), the specifier becomes `mount as render` and the body is left
 *   as it is. Same for an aliased import (`render as r` → `mount as r`) and a
 *   re-export (`export { render } from …` → `export { mount as render } from …`).
 * - A namespace import's `ns.render` becomes `ns.mount`.
 */
export const runtimeDomRenderToMount: Codemod = {
  id: 'runtime-dom-render-to-mount',
  package: '@pyreon/runtime-dom',
  introducedIn: '0.54.0',
  description: "Switch the removed `render` (an alias of `mount`) to `mount` in imports from '@pyreon/runtime-dom'.",
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!source.includes(MODULE) || !/\brender\b/.test(source)) return null
    const ts = loadTs('runtime-dom-render-to-mount')
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const ctx: Ctx = { ts, sf, source, edits: [] }
    const scan = scanModuleStatements(ctx)
    const { refs, conflict } = scanBody(ctx, scan)
    if (scan.plainRender !== undefined && conflict) {
      replace(ctx, scan.plainRender, 'mount as render')
    } else if (scan.plainRender !== undefined) {
      rewritePlainImport(ctx, scan.plainRender, scan.mountImported)
      for (const ref of refs) replace(ctx, ref, ts.isShorthandPropertyAssignment(ref.parent) ? 'render: mount' : 'mount')
    }
    if (ctx.edits.length === 0) return null
    let out = source
    for (const e of ctx.edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    return out
  },
}
