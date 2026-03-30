import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan, hasJSXAttribute } from '../../utils/ast'

export const useByNotKey: Rule = {
  meta: {
    id: 'pyreon/use-by-not-key',
    category: 'jsx',
    description:
      'Use `by` prop on <For> instead of `key` — JSX reserves `key` for VNode reconciliation.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const tagName = node.name?.type === 'JSXIdentifier' ? node.name.name : null
        if (tagName !== 'For') return
        const keyAttr = getJSXAttribute(node, 'key')
        if (!keyAttr) return
        if (hasJSXAttribute(node, 'by')) return // already has by

        const attrSpan = getSpan(keyAttr.name)
        context.report({
          message:
            'Use `by` prop on `<For>` instead of `key` — JSX reserves `key` for VNode reconciliation.',
          span: getSpan(keyAttr),
          fix: { span: attrSpan, replacement: 'by' },
        })
      },
    }
    return callbacks
  },
}
