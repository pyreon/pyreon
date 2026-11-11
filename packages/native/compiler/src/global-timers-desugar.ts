/**
 * `window.setTimeout(…)` / `globalThis.setInterval(…)` (and `clear*`) are the bare timer functions: on the web the
 * global object's method IS the global function. PMTC lowers the bare spelling to the runtimes' `PyreonTimers` — a
 * body timer to one mount-time start — but the qualified spelling was reproduced verbatim (`window` has no native
 * counterpart, so the build failed, with a warning blaming `window`). Rewriting the callee to the bare identifier before
 * any recognizer reads the AST gives the qualified spelling every lowering the bare one has.
 *
 * Skipped when the file binds `window` / `globalThis` / `self` itself (a parameter, a local, an import): then the name is
 * not the global object.
 */

type AnyNode = Record<string, unknown> & { type?: string }

const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self'])
const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'])

function collectBoundNames(root: unknown): Set<string> {
  const bound = new Set<string>()
  const addPattern = (p: AnyNode | undefined): void => {
    if (p?.type === 'Identifier') bound.add(p.name as string)
  }
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x)
      return
    }
    if (n === null || typeof n !== 'object') return
    const node = n as AnyNode
    if (node.type === 'VariableDeclarator') addPattern(node.id as AnyNode)
    if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier')
      addPattern(node.local as AnyNode)
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      addPattern(node.id as AnyNode)
      for (const p of (node.params as AnyNode[] | undefined) ?? []) addPattern(p)
    }
    for (const v of Object.values(node)) if (v !== null && typeof v === 'object') walk(v)
  }
  walk(root)
  return bound
}

/** Rewrite `window.setTimeout(…)`-style callees (unshadowed global object, a timer function) to the bare identifier. */
export function desugarGlobalTimers(program: AnyNode): void {
  const bound = collectBoundNames(program)
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x)
      return
    }
    if (n === null || typeof n !== 'object') return
    const node = n as AnyNode
    if (node.type === 'CallExpression') {
      const callee = node.callee as AnyNode | undefined
      const object = callee?.object as AnyNode | undefined
      const property = callee?.property as AnyNode | undefined
      if (
        callee?.type === 'MemberExpression' &&
        callee.computed !== true &&
        callee.optional !== true &&
        object?.type === 'Identifier' &&
        GLOBAL_OBJECTS.has(object.name as string) &&
        !bound.has(object.name as string) &&
        property?.type === 'Identifier' &&
        TIMER_FUNCTIONS.has(property.name as string)
      ) {
        node.callee = { ...property }
      }
    }
    for (const v of Object.values(node)) if (v !== null && typeof v === 'object') walk(v)
  }
  walk(program)
}
