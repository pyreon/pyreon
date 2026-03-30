import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const preferShowOverDisplay: Rule = {
  meta: {
    id: 'pyreon/prefer-show-over-display',
    category: 'performance',
    description: 'Suggest <Show> over conditional `display` style property in JSX.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return
        const value = node.value
        if (!value || value.type !== 'JSXExpressionContainer') return
        const expr = value.expression
        if (!expr || expr.type !== 'ObjectExpression') return

        for (const prop of expr.properties ?? []) {
          if (prop.type !== 'Property') continue
          const key = prop.key
          if (!key) continue
          const propName =
            key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
          if (propName === 'display') {
            // Check if the value is conditional
            const val = prop.value
            if (
              val?.type === 'ConditionalExpression' ||
              val?.type === 'LogicalExpression' ||
              val?.type === 'CallExpression'
            ) {
              context.report({
                message:
                  'Conditional `display` style — consider using `<Show>` for conditional rendering instead of toggling CSS display.',
                span: getSpan(prop),
              })
            }
          }
        }
      },
    }
    return callbacks
  },
}
