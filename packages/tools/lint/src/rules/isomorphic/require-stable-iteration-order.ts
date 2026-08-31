import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Iterating an unordered collection to produce rendered output.
 *
 * `Object.keys()` follows insertion order for string keys — which is stable
 * *within one process* and says nothing about two processes agreeing. A server
 * that builds an object from a database row, a cache, or a merged config can
 * easily insert in a different order than the client rebuilding it from
 * serialized JSON, and the rendered list then differs between the two passes.
 * `Set` and `Map` have the same property.
 *
 * The failure is nastier than a normal mismatch because it is DATA-dependent:
 * it passes in every test with a hand-written fixture and appears once against
 * real data whose key order happens to differ.
 *
 * Sort explicitly before rendering. A comparator makes the order a property of
 * the code rather than of how the object happened to be built.
 *
 * Scope: only iteration that feeds rendered output — a `.map()` in JSX, or a
 * `<For each={…}>`. Iterating keys to compute a total, validate, or build a
 * lookup is order-independent and untouched.
 */
const UNORDERED_SOURCES = new Set(['keys', 'values', 'entries'])

/** `Object.keys(x)` / `Object.entries(x)` / `set.values()` — order not guaranteed across processes. */
function unorderedSourceName(node: any): string | null {
  const callee = node?.callee
  if (callee?.type !== 'MemberExpression' || callee.computed === true) return null
  const prop = callee.property?.type === 'Identifier' ? String(callee.property.name) : null
  if (prop === null || !UNORDERED_SOURCES.has(prop)) return null
  if (callee.object?.type === 'Identifier' && String(callee.object.name) === 'Object') {
    return `Object.${prop}()`
  }
  return null
}

/** Is this `<something>.map(...)`, and if so what is being mapped? */
function mapReceiver(node: any): any {
  const callee = node?.callee
  if (callee?.type !== 'MemberExpression' || callee.computed === true) return null
  if (callee.property?.type !== 'Identifier' || String(callee.property.name) !== 'map') return null
  return callee.object
}

/** Does this subtree already sort? */
function hasSort(node: any, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 5) return false
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.property?.type === 'Identifier' &&
    String(node.callee.property.name) === 'sort'
  ) {
    return true
  }
  return hasSort(node.callee?.object, depth + 1)
}

export const requireStableIterationOrder: Rule = {
  meta: {
    id: 'pyreon/require-stable-iteration-order',
    category: 'isomorphic',
    description:
      'Rendering from `Object.keys()` / a `Set` relies on insertion order, which is stable within one process and not between two — the server and client can order the same data differently.',
    severity: 'warn',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    /** Report a `.map()` over an unordered source that is inside JSX. */
    let jsxDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer() {
        jsxDepth++
      },
      'JSXExpressionContainer:exit'() {
        jsxDepth--
      },
      CallExpression(node: any) {
        if (jsxDepth === 0) return
        const recv = mapReceiver(node)
        if (!recv) return
        if (hasSort(recv)) return
        const name = unorderedSourceName(recv)
        if (name === null) return
        context.report({
          message: `Rendering from \`${name}\` relies on insertion order. That is stable within one process and guarantees nothing BETWEEN two — a server building this object from a query and a client rebuilding it from JSON can order it differently, and the rendered list then differs at hydration. Worse, it is data-dependent: fixtures agree, real data may not. Add an explicit \`.sort(...)\` so the order is a property of the code.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
