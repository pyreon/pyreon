import type { ExprIR } from './types'

/**
 * Pre-order walk over every ExprIR node reachable from `e` (descending
 * into JSX attrs + children, arrow bodies, call args, object fields,
 * etc.). `visit` runs on each node before its children, so a nested
 * reduce inside a reducer body is still reached. Exhaustive over the
 * ExprIR union.
 */
export function forEachExpr(e: ExprIR, visit: (n: ExprIR) => void): void {
  visit(e)
  switch (e.kind) {
    case 'literal':
    case 'identifier':
      return
    case 'call':
      forEachExpr(e.callee, visit)
      for (const a of e.args) forEachExpr(a, visit)
      return
    case 'member':
      forEachExpr(e.object, visit)
      return
    case 'index':
      forEachExpr(e.object, visit)
      forEachExpr(e.index, visit)
      return
    case 'binary':
    case 'comparison':
    case 'logical':
      forEachExpr(e.left, visit)
      forEachExpr(e.right, visit)
      return
    case 'unary':
    case 'update':
      forEachExpr(e.argument, visit)
      return
    case 'ternary':
      forEachExpr(e.cond, visit)
      forEachExpr(e.then, visit)
      forEachExpr(e.otherwise, visit)
      return
    case 'arrow':
      forEachExpr(e.body, visit)
      return
    // A plugin's own expression: its argument slots are ordinary expressions (a reducer's arrow, a source read).
    case 'ext-expr':
      for (const a of e.args) forEachExpr(a, visit)
      return
    case 'jsx-element':
      for (const a of e.attrs) {
        if (a.kind === 'attr') forEachExpr(a.value, visit)
        else if (a.kind === 'event') forEachExpr(a.handler, visit)
        else forEachExpr(a.argument, visit)
      }
      for (const ch of e.children) if (ch.kind === 'expr') forEachExpr(ch.expr, visit)
      return
    case 'jsx-fragment':
      for (const ch of e.children) if (ch.kind === 'expr') forEachExpr(ch.expr, visit)
      return
    case 'array':
      for (const el of e.elements) forEachExpr(el, visit)
      return
    case 'object':
      for (const f of e.fields) forEachExpr(f.value, visit)
      if (e.spreads) for (const s of e.spreads) forEachExpr(s, visit)
      return
    case 'paren':
      forEachExpr(e.inner, visit)
      return
    case 'spread':
      forEachExpr(e.argument, visit)
      return
  }
}
