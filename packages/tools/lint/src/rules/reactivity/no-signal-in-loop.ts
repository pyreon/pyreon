import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const noSignalInLoop: Rule = {
  meta: {
    id: 'pyreon/no-signal-in-loop',
    category: 'reactivity',
    description: 'Disallow creating signals or computeds inside loops.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    let loopDepth = 0
    const callbacks: VisitorCallbacks = {
      ForStatement() {
        loopDepth++
      },
      'ForStatement:exit'() {
        loopDepth--
      },
      ForInStatement() {
        loopDepth++
      },
      'ForInStatement:exit'() {
        loopDepth--
      },
      ForOfStatement() {
        loopDepth++
      },
      'ForOfStatement:exit'() {
        loopDepth--
      },
      WhileStatement() {
        loopDepth++
      },
      'WhileStatement:exit'() {
        loopDepth--
      },
      DoWhileStatement() {
        loopDepth++
      },
      'DoWhileStatement:exit'() {
        loopDepth--
      },
      CallExpression(node: any) {
        if (loopDepth === 0) return
        const callee = node.callee
        if (!callee || callee.type !== 'Identifier') return
        if (callee.name === 'signal' || callee.name === 'computed') {
          context.report({
            message: `\`${callee.name}()\` inside a loop — signals should be created once at component setup, not on every iteration.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
