import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isArrayMapCall, walkSubtree } from '../../utils/ast'

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

function unwrap(n: any): any {
  let x = n
  while (x && (x.type === 'ParenthesizedExpression' || x.type === 'TSAsExpression' || x.type === 'TSNonNullExpression')) {
    x = x.expression
  }
  return x
}

function isJsxish(expr: any): boolean {
  const n = unwrap(expr)
  if (!n) return false
  if (n.type === 'JSXElement' || n.type === 'JSXFragment') return true
  if (n.type === 'ConditionalExpression') return isJsxish(n.consequent) || isJsxish(n.alternate)
  if (n.type === 'LogicalExpression') return isJsxish(n.left) || isJsxish(n.right)
  return false
}

/**
 * Does the map callback return JSX? A callback that is not an inline function
 * (`items.map(renderRow)`) cannot be inspected here, so it is assumed to
 * render, as before.
 */
function callbackProducesJsx(callback: any): boolean {
  const fn = unwrap(callback)
  if (!fn || !FUNCTION_TYPES.has(fn.type)) return true
  if (fn.body?.type !== 'BlockStatement') return isJsxish(fn.body)
  let found = false
  walkSubtree(fn.body, (n: any) => {
    if (found) return false
    if (n !== fn.body && FUNCTION_TYPES.has(n.type)) return false
    if (n.type === 'ReturnStatement' && isJsxish(n.argument)) found = true
    return undefined
  })
  return found
}

export const noMapInJsx: Rule = {
  meta: {
    id: 'pyreon/no-map-in-jsx',
    category: 'jsx',
    description: 'Prefer <For> over .map() inside JSX for reactive list rendering.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let jsxDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXElement() {
        jsxDepth++
      },
      'JSXElement:exit'() {
        jsxDepth--
      },
      JSXFragment() {
        jsxDepth++
      },
      'JSXFragment:exit'() {
        jsxDepth--
      },
      CallExpression(node: any) {
        if (jsxDepth === 0) return
        if (!isArrayMapCall(node)) return
        // Check callback contains JSX
        const args = node.arguments
        if (!args || args.length === 0) return
        const callback = args[0]
        if (!callback) return
        // Only a map that RENDERS a list is a `<For>` candidate. A map that
        // builds data inside JSX — `rows={[...items.map((it) => [it.a, it.b])]}`
        // for a table, `class={xs.map(f).join(' ')}` — renders nothing, and
        // `<For>` cannot replace it.
        if (!callbackProducesJsx(callback)) return
        context.report({
          message: '`.map()` in JSX — use `<For>` for reactive list rendering instead.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
