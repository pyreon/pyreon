import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isDestructuring } from '../../utils/ast'

function containsJSXReturn(node: any): boolean {
  if (!node) return false
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  if (node.type === 'ParenthesizedExpression') return containsJSXReturn(node.expression)

  if (node.type === 'BlockStatement') {
    for (const stmt of node.body ?? []) {
      if (stmt.type === 'ReturnStatement' && containsJSXReturn(stmt.argument)) {
        return true
      }
    }
  }
  return false
}

export const noPropsDestructure: Rule = {
  meta: {
    id: 'pyreon/no-props-destructure',
    category: 'jsx',
    description:
      'Disallow destructuring props in component functions — it breaks signal reactivity.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    // Track function nesting depth to detect HOC patterns.
    // A function returned from another function is likely an HOC inner —
    // destructuring there is intentional (stripping/forwarding props).
    let functionDepth = 0

    const callbacks: VisitorCallbacks = {
      ArrowFunctionExpression(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth)
      },
      'ArrowFunctionExpression:exit'() {
        functionDepth--
      },
      FunctionDeclaration(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth)
      },
      'FunctionDeclaration:exit'() {
        functionDepth--
      },
      FunctionExpression(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth)
      },
      'FunctionExpression:exit'() {
        functionDepth--
      },
    }
    return callbacks
  },
}

function checkFunction(node: any, context: any, depth: number) {
  const params = node.params
  if (!params || params.length === 0) return

  const firstParam = params[0]
  if (!isDestructuring(firstParam)) return

  // Skip if this is a nested function (HOC inner function).
  // HOC pattern: (WrappedComponent) => ({ prop1, ...rest }) => <JSX />
  // Depth 1 = top-level function, depth 2+ = nested (likely HOC inner)
  if (depth > 1) return

  const body = node.body
  if (!body) return

  if (containsJSXReturn(body)) {
    context.report({
      message:
        'Destructured props in a component function — this breaks signal reactivity. Use `props.x` or `splitProps()` instead.',
      span: getSpan(firstParam),
    })
  }
}
