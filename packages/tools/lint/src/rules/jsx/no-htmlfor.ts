import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const noHtmlFor: Rule = {
  meta: {
    id: 'pyreon/no-htmlfor',
    category: 'jsx',
    description: 'Use `for` instead of `htmlFor` — Pyreon uses standard HTML attributes.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier') return
        if (node.name.name !== 'htmlFor') return
        const nameSpan = getSpan(node.name)
        context.report({
          message: 'Use `for` instead of `htmlFor` — Pyreon uses standard HTML attributes.',
          span: getSpan(node),
          fix: { span: nameSpan, replacement: 'for' },
        })
      },
    }
    return callbacks
  },
}
