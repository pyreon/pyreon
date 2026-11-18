import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { findImperativePattern } from './no-imperative-effect-on-create'

/**
 * The effect callback's body, when it is an inline function.
 */
function effectBody(node: any): any {
  const fn = node.arguments?.[0]
  if (fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression') return fn.body
  return null
}

export const noEffectInMount: Rule = {
  meta: {
    id: 'pyreon/no-effect-in-mount',
    category: 'lifecycle',
    description:
      'Inform when a pure reactive effect() is created inside onMount — it belongs at setup time. An effect doing imperative work is where `no-imperative-effect-on-create` sends it, so it is accepted.',
    severity: 'info',
    fixable: false,
    // An effect that READS a post-mount ref must be created inside `onMount`.
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {

    let mountDepth = 0
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, 'onMount')) {
          mountDepth++
        }
        // An effect whose body does DOM / browser-global / IO / scheduling work
        // is exactly the shape `no-imperative-effect-on-create` moves INTO
        // `onMount` (#4397). Judge it by the same detector so the two rules
        // accept every effect in exactly one placement.
        if (mountDepth > 0 && isCallTo(node, 'effect') && !findImperativePattern(effectBody(node))) {
          context.report({
            message:
              '`effect()` inside `onMount` does only reactive work — create it at component setup time instead. (An effect that touches the DOM, browser globals, IO or timers belongs inside `onMount` and is not reported.)',
            span: getSpan(node),
          })
        }
      },
      'CallExpression:exit'(node: any) {
        if (isCallTo(node, 'onMount')) {
          mountDepth--
        }
      },
    }
    return callbacks
  },
}
