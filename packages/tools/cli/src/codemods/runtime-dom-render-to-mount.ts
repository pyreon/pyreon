import { createRequire } from 'node:module'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node
type Identifier = import('typescript').Identifier

/** TypeScript, loaded only when the codemod actually has a candidate file. */
function loadTs(): TS {
  try {
    return createRequire(import.meta.url)('typescript') as TS
  } catch {
    throw new Error(
      '[Pyreon] codemod runtime-dom-render-to-mount needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  }
}

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
    const ts = loadTs()
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const edits: { start: number; end: number; text: string }[] = []
    const replace = (n: Node, text: string): void => {
      edits.push({ start: n.getStart(sf), end: n.getEnd(), text })
    }

    const fromModule = (spec: import('typescript').Expression | undefined): boolean =>
      spec !== undefined && ts.isStringLiteral(spec) && spec.text === MODULE

    let plainRender: import('typescript').ImportSpecifier | undefined
    let mountImported = false
    const namespaces = new Set<string>()
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && fromModule(st.moduleSpecifier)) {
        const named = st.importClause?.namedBindings
        if (named === undefined) continue
        if (ts.isNamespaceImport(named)) {
          namespaces.add(named.name.text)
          continue
        }
        for (const el of named.elements) {
          const imported = (el.propertyName ?? el.name).text
          if (imported === 'mount' && el.name.text === 'mount') mountImported = true
          if (imported !== 'render') continue
          // `render as r` keeps its local name: only the imported name changes.
          if (el.propertyName !== undefined) replace(el.propertyName, 'mount')
          else plainRender = el
        }
      } else if (ts.isExportDeclaration(st) && fromModule(st.moduleSpecifier)) {
        const clause = st.exportClause
        if (clause === undefined || !ts.isNamedExports(clause)) continue
        for (const el of clause.elements) {
          if ((el.propertyName ?? el.name).text !== 'render') continue
          if (el.propertyName !== undefined) replace(el.propertyName, 'mount')
          else replace(el, 'mount as render')
        }
      }
    }

    // Every identifier named `render` / `mount`, to rename references and to
    // find a declaration that would make renaming unsafe.
    const renderRefs: Identifier[] = []
    let conflict = false
    const visit = (node: Node): void => {
      if (ts.isIdentifier(node)) {
        const name = node.text
        if ((name === 'render' || name === 'mount') && !isMemberName(ts, node)) {
          const p = node.parent
          const ourImport = ts.isImportSpecifier(p) && fromModule(p.parent.parent.parent.moduleSpecifier)
          if (ts.isExportSpecifier(p)) {
            // `export { render }` of the local binding: keep that public name.
            if (p.parent.parent.moduleSpecifier === undefined) conflict = true
          } else if (isDeclarationName(ts, node)) {
            if (!ourImport) conflict = true
          } else if (ts.isShorthandPropertyAssignment(p) && name === 'mount') {
            // `{ mount }` would capture the renamed binding — leave the body alone.
            conflict = true
          } else if (name === 'render') {
            renderRefs.push(node)
          } else if (!mountImported) {
            // A `mount` reference with no `mount` import is some other binding.
            conflict = true
          }
        }
      } else if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        namespaces.has(node.expression.text) &&
        node.name.text === 'render'
      ) {
        replace(node.name, 'mount')
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)

    if (plainRender !== undefined) {
      if (conflict) {
        replace(plainRender, 'mount as render')
      } else {
        const list = plainRender.parent.elements
        if (mountImported && list.length === 1) {
          // `import { render } from …` next to a separate `mount` import: drop the declaration.
          const decl = plainRender.parent.parent.parent
          const end = source[decl.getEnd()] === '\n' ? decl.getEnd() + 1 : decl.getEnd()
          edits.push({ start: decl.getStart(sf), end, text: '' })
        } else if (mountImported) {
          // Drop the specifier together with one adjacent comma.
          const i = list.indexOf(plainRender)
          const start = i > 0 ? (list[i - 1] as Node).getEnd() : plainRender.getStart(sf)
          const end = i > 0 ? plainRender.getEnd() : (list[i + 1] as Node).getStart(sf)
          edits.push({ start, end, text: '' })
        } else {
          replace(plainRender, 'mount')
        }
        for (const ref of renderRefs) {
          replace(ref, ts.isShorthandPropertyAssignment(ref.parent) ? 'render: mount' : 'mount')
        }
      }
    }

    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    return out
  },
}
