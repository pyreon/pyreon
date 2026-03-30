import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const noClassName: Rule = {
  meta: {
    id: 'pyreon/no-classname',
    category: 'jsx',
    description: 'Use `class` instead of `className` — Pyreon uses standard HTML attributes.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier') return
        if (node.name.name !== 'className') return
        const nameSpan = getSpan(node.name)
        context.report({
          message: 'Use `class` instead of `className` — Pyreon uses standard HTML attributes.',
          span: getSpan(node),
          fix: { span: nameSpan, replacement: 'class' },
        })
      },
    }
    return callbacks
  },
}
