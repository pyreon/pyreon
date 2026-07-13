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

/**
 * Unwrap TypeScript type-only layers + parens off an initializer, so
 * `const { a } = (props as P)` / `(props)!` / `(props)` all resolve to the
 * bare `props` identifier. Mirrors the compiler's `unwrapInitializer`.
 */
function unwrapInitializer(expr: any): any {
  let e = expr
  while (
    e &&
    (e.type === 'TSAsExpression' ||
      e.type === 'TSSatisfiesExpression' ||
      e.type === 'TSNonNullExpression' ||
      e.type === 'ParenthesizedExpression')
  ) {
    e = e.expression
  }
  return e
}

function reportDestructure(node: any, context: any, pattern: any) {
  const names = getDestructuredNames(pattern)
  const hasRest = (pattern.properties ?? []).some((p: any) => p.type === 'RestElement')

  let suggestion = 'Use `props.x` pattern for reactive prop access.'
  if (names.length > 0) {
    const propsAccess = names.map((n) => `props.${n}`).join(', ')
    suggestion = `Use \`props\` parameter and access as ${propsAccess}.`
    if (hasRest) {
      suggestion += ` For rest props, use \`splitProps(props, [${names.map((n) => `'${n}'`).join(', ')}])\`.`
    }
  }

  context.report({
    message: `Destructured props in component function — breaks reactive prop tracking. ${suggestion}`,
    span: getSpan(pattern),
  })
}

/**
 * LT-2: the BODY-scope form — `function C(props) { const { a } = props }`.
 * `const { a } = props` fires the getter-backed props at setup, capturing dead
 * snapshots (identical bug to the signature-destructure form the rule already
 * catches). Walk the component body's statements; flag any
 * `const { … } = <paramName>` (initializer unwrapped through `as`/`satisfies`/
 * `!`/parens). Do NOT descend into nested functions — a destructure inside a
 * handler / effect / returned accessor re-reads per invocation and is
 * reactivity-correct. Conservative by construction (zero false positives): only
 * a bare `= <first-param-identifier>` matches; `= props.nested` / `= other`
 * are ignored. Ports the compiler's `detectPropsDestructuredBody`.
 */
function checkBodyDestructure(paramName: string, body: any, context: any) {
  function walk(n: any): void {
    if (!n || typeof n.type !== 'string') return
    // Stop at nested-function boundaries.
    if (
      n.type === 'ArrowFunctionExpression' ||
      n.type === 'FunctionExpression' ||
      n.type === 'FunctionDeclaration'
    ) {
      return
    }
    if (
      n.type === 'VariableDeclarator' &&
      n.id?.type === 'ObjectPattern' &&
      (n.id.properties?.length ?? 0) > 0 &&
      n.init
    ) {
      const base = unwrapInitializer(n.init)
      if (base?.type === 'Identifier' && base.name === paramName) {
        reportDestructure(n, context, n.id)
      }
    }
    // Recurse into every child except the nested functions returned above.
    for (const key in n) {
      if (key === 'parent') continue
      const val = n[key]
      if (Array.isArray(val)) {
        for (const c of val) if (c && typeof c.type === 'string') walk(c)
      } else if (val && typeof val.type === 'string') {
        walk(val)
      }
    }
  }
  for (const stmt of body.body ?? []) walk(stmt)
}

function checkFunction(node: any, context: any, depth: number, callArgFns: WeakMap<any, any>) {
  const params = node.params
  if (!params || params.length === 0) return

  const firstParam = params[0]

  // Skip nested functions (depth > 1). This protects render-prop
  // callbacks whose first param is NOT a Pyreon component prop bag —
  // e.g. `<For>{(item) => <li>{item}</li>}</For>` passes raw array
  // items, so destructuring is a non-issue there. The tradeoff is that
  // genuinely-nested component declarations slip past this rule;
  // they're rare enough in practice that the false-negative is
  // acceptable. Applies to BOTH the signature and body forms.
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
  if (!containsJSXReturn(body)) return

  // Signature form: `function C({ a }) { … }`.
  if (isDestructuring(firstParam)) {
    reportDestructure(firstParam, context, firstParam)
    return
  }

  // LT-2 body form: `function C(props) { const { a } = props; … }`. Only when
  // the first param is a plain identifier (the destructured-param shape is the
  // signature form above) and the body is a block.
  if (firstParam?.type === 'Identifier' && body.type === 'BlockStatement') {
    checkBodyDestructure(firstParam.name, body, context)
  }
}
