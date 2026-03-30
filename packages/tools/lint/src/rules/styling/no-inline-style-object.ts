import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const noInlineStyleObject: Rule = {
  meta: {
    id: 'pyreon/no-inline-style-object',
    category: 'styling',
    description: 'Warn against inline style objects in JSX — prefer styled() or css``.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return
        const value = node.value
        if (!value || value.type !== 'JSXExpressionContainer') return
        const expr = value.expression
        if (expr?.type === 'ObjectExpression') {
          context.report({
            message:
              'Inline style object in JSX — consider using `styled()` or `css\\`...\\`` for better performance and caching.',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
