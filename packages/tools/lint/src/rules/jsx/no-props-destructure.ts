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

/**
 * Extract destructured property names from an ObjectPattern.
 * Returns names for the fix suggestion.
 */
function getDestructuredNames(pattern: any): string[] {
  if (pattern.type !== 'ObjectPattern') return []
  const names: string[] = []
  for (const prop of pattern.properties ?? []) {
    if (prop.type === 'ObjectProperty' && prop.key?.type === 'Identifier') {
      names.push(prop.key.name)
    }
  }
  return names
}

export const noPropsDestructure: Rule = {
  meta: {
    id: 'pyreon/no-props-destructure',
    category: 'jsx',
    description:
      'Disallow destructuring props in component functions — breaks reactive prop tracking. Use props.x or splitProps().',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    let functionDepth = 0
    // oxc visitor doesn't pass `parent` to callbacks — previous
    // `parent?.type === 'CallExpression'` check was silently inert. Pre-mark
    // function nodes that appear as CallExpression arguments on the way in.
    const callArgFns = new WeakSet<any>()

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        for (const arg of node.arguments ?? []) {
          if (
            arg?.type === 'ArrowFunctionExpression' ||
            arg?.type === 'FunctionExpression' ||
            arg?.type === 'FunctionDeclaration'
          ) {
            callArgFns.add(arg)
          }
        }
      },
      ArrowFunctionExpression(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth, callArgFns)
      },
      'ArrowFunctionExpression:exit'() {
        functionDepth--
      },
      FunctionDeclaration(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth, callArgFns)
      },
      'FunctionDeclaration:exit'() {
        functionDepth--
      },
      FunctionExpression(node: any) {
        functionDepth++
        checkFunction(node, context, functionDepth, callArgFns)
      },
      'FunctionExpression:exit'() {
        functionDepth--
      },
    }
    return callbacks
  },
}

function checkFunction(node: any, context: any, depth: number, callArgFns: WeakSet<any>) {
  const params = node.params
  if (!params || params.length === 0) return

  const firstParam = params[0]
  if (!isDestructuring(firstParam)) return

  // Skip HOC inner functions (depth > 1)
  if (depth > 1) return

  // Skip functions passed as arguments to HOC factories
  // e.g. createLink(({ href, ...rest }) => <a {...rest} />)
  if (callArgFns.has(node)) return

  const body = node.body
  if (!body) return

  if (containsJSXReturn(body)) {
    const names = getDestructuredNames(firstParam)
    const hasRest = (firstParam.properties ?? []).some((p: any) => p.type === 'RestElement')

    let suggestion = 'Use `props.x` pattern for reactive prop access.'
    if (names.length > 0) {
      const propsAccess = names.map((n) => `props.${n}`).join(', ')
      suggestion = `Use \`props\` parameter and access as ${propsAccess}.`
      if (hasRest) {
        suggestion += ` For rest props, use \`splitProps(props, [${names.map((n) => `'${n}'`).join(', ')}])\`.`
      }
    }

    context.report({
      message:
        `Destructured props in component function — breaks reactive prop tracking. ${suggestion}`,
      span: getSpan(firstParam),
    })
  }
}
