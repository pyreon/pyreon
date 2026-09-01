import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `isServer` / `typeof window` deciding what gets RENDERED, in a file that
 * renders on both sides.
 *
 * Branching on the environment to change BEHAVIOUR is correct and common —
 * skip a listener on the server, read `localStorage` only on the client. What
 * breaks is branching to change OUTPUT: the server emits one tree, the client's
 * first render emits another, and hydration mismatches on markup that looks
 * perfectly ordinary in source.
 *
 * The distinction this rule draws is therefore POSITION, not the condition:
 * only a branch whose result is returned from, or interpolated into, rendered
 * output is reported. `if (isServer) return` guarding a side effect is
 * untouched, because that is the shape the framework itself recommends.
 *
 * The fix is almost always to render the same thing on both sides and let an
 * effect change it after mount — `onMount` never runs on the server, so the
 * server tree and the client's FIRST tree agree, and the divergence happens
 * after hydration has already matched.
 */
const ENV_IDENTIFIERS = new Set(['isServer', 'isClient', 'isBrowser', 'isSSR'])

/** `typeof window === 'undefined'` and friends. */
function isTypeofEnvCheck(node: any): boolean {
  if (node?.type !== 'BinaryExpression') return false
  for (const side of [node.left, node.right]) {
    if (
      side?.type === 'UnaryExpression' &&
      String(side.operator) === 'typeof' &&
      side.argument?.type === 'Identifier' &&
      ['window', 'document'].includes(String(side.argument.name))
    ) {
      return true
    }
  }
  return false
}

function isEnvCondition(node: any): boolean {
  if (!node) return false
  if (node.type === 'Identifier') return ENV_IDENTIFIERS.has(String(node.name))
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
    return ENV_IDENTIFIERS.has(String(node.callee.name))
  }
  if (node.type === 'UnaryExpression' && String(node.operator) === '!') {
    return isEnvCondition(node.argument)
  }
  if (isTypeofEnvCheck(node)) return true
  return false
}

export const noEnvBranchInRender: Rule = {
  meta: {
    id: 'pyreon/no-env-branch-in-render',
    category: 'isomorphic',
    description:
      'An environment branch that decides rendered OUTPUT (rather than behaviour) makes the server tree and the first client tree disagree — a guaranteed hydration mismatch.',
    severity: 'warn',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    const report = (node: unknown) =>
      context.report({
        message:
          'This environment branch decides what is RENDERED, so the server emits one tree and the first client render emits another — hydration mismatches on markup that looks fine in source. Render the SAME thing on both sides and change it in `onMount`, which never runs on the server, so the divergence happens after hydration has already matched.',
        span: getSpan(node),
      })

    /** A ternary in a JSX expression container is output by definition. */
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer(node: any) {
        const expr = node?.expression
        if (expr?.type === 'ConditionalExpression' && isEnvCondition(expr.test)) {
          report(expr)
          return
        }
        // `{isServer && <A/>}` — same class, different spelling.
        if (
          expr?.type === 'LogicalExpression' &&
          (String(expr.operator) === '&&' || String(expr.operator) === '||') &&
          isEnvCondition(expr.left)
        ) {
          report(expr)
        }
      },

      // NOTE: no JSXAttribute visitor. An attribute's value IS a
      // JSXExpressionContainer, so the handler above already covers
      // `class={isServer ? 'a' : 'b'}` — adding a second visitor reported the
      // same expression twice, which reads as two defects.
    }
    return callbacks
  },
}
