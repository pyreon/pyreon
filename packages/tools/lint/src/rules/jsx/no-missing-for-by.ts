import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'

export const noMissingForBy: Rule = {
  meta: {
    id: 'pyreon/no-missing-for-by',
    category: 'jsx',
    description: 'Warn when <For> is used without a `by` prop.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'For') return
        if (hasJSXAttribute(node, 'by')) return
        context.report({
          message:
            '`<For>` without `by` prop — provide a key function for efficient reconciliation.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
