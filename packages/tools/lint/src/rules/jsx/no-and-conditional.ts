import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isLogicalAndWithJSX } from '../../utils/ast'

export const noAndConditional: Rule = {
  meta: {
    id: 'pyreon/no-and-conditional',
    category: 'jsx',
    description: 'Prefer <Show> over `&&` with JSX in expression containers.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let jsxExpressionDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer() {
        jsxExpressionDepth++
      },
      'JSXExpressionContainer:exit'() {
        jsxExpressionDepth--
      },
      LogicalExpression(node: any) {
        if (jsxExpressionDepth === 0) return
        if (!isLogicalAndWithJSX(node)) return
        context.report({
          message: '`&&` with JSX — use `<Show>` for conditional rendering.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
