import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isDestructuring } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

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

/**
 * Names of HOC / factory call expressions whose first-argument render
 * function takes Pyreon component props. Destructuring inside these IS
 * a real reactivity bug — same as destructuring at the component
 * signature directly. Do NOT add this exemption for these.
 *
 * The `callArgFns` exemption is intentionally narrow: it only fires for
 * generic call arguments where the parent call is NOT one of these
 * known component-shaped factories.
 */
const COMPONENT_FACTORY_NAMES = new Set([
  'createComponent',
  'defineComponent',
  'lazy',
  'memo',
  'observer',
  'forwardRef',
  'rocketstyle',
  'styled',
  'attrs',
  'kinetic',
])

function isComponentFactoryCall(call: any): boolean {
  if (!call || call.type !== 'CallExpression') return false
  const callee = call.callee
  if (!callee) return false
  if (callee.type === 'Identifier' && COMPONENT_FACTORY_NAMES.has(callee.name)) return true
  // `styled.div\`...\`` template tag falls back to a CallExpression on
  // styled members in some compilers — be conservative and don't try to
  // detect template literal forms here.
  return false
}

export const noPropsDestructure: Rule = {
  meta: {
    id: 'pyreon/no-props-destructure',
    category: 'jsx',
    description:
      'Disallow destructuring props in component functions — breaks reactive prop tracking. Use props.x or splitProps().',
    severity: 'error',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    let functionDepth = 0
    // oxc visitor doesn't pass `parent` to callbacks — previous
    // `parent?.type === 'CallExpression'` check was silently inert. Pre-mark
    // function nodes that appear as CallExpression arguments on the way in.
    // Track BOTH the function and its parent call so we can later refuse
    // the exemption when the parent is a known component factory.
    const callArgFns = new WeakMap<any, any>()

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        for (const arg of node.arguments ?? []) {
          if (
            arg?.type === 'ArrowFunctionExpression' ||
            arg?.type === 'FunctionExpression' ||
            arg?.type === 'FunctionDeclaration'
          ) {
            callArgFns.set(arg, node)
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

function checkFunction(node: any, context: any, depth: number, callArgFns: WeakMap<any, any>) {
  const params = node.params
  if (!params || params.length === 0) return

  const firstParam = params[0]
  if (!isDestructuring(firstParam)) return

  // Skip nested functions (depth > 1). This protects render-prop
  // callbacks whose first param is NOT a Pyreon component prop bag —
  // e.g. `<For>{(item) => <li>{item}</li>}</For>` passes raw array
  // items, so destructuring is a non-issue there. The tradeoff is that
  // genuinely-nested component declarations slip past this rule;
  // they're rare enough in practice that the false-negative is
  // acceptable.
  if (depth > 1) return

  // Skip functions passed as call arguments (HOC / render-prop
  // pattern), UNLESS the parent call is a known component factory.
  // Component factories receive Pyreon props via the inner function,
  // so destructuring there breaks reactivity exactly like it does at
  // the component signature.
  const parentCall = callArgFns.get(node)
  if (parentCall && !isComponentFactoryCall(parentCall)) return

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
