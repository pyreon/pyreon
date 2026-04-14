import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

export const noRawAddEventListener: Rule = {
  meta: {
    id: 'pyreon/no-raw-addeventlistener',
    category: 'hooks',
    description: 'Suggest useEventListener() instead of raw .addEventListener() calls.',
    severity: 'info',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Configurable `exemptPaths` — for packages that IMPLEMENT the cleanup
    // wrapper this rule recommends (they can't use themselves). Configure
    // per-project; user apps typically leave empty.
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'addEventListener')
          return
        context.report({
          message:
            'Raw `.addEventListener()` — consider using `useEventListener()` from `@pyreon/hooks` for auto-cleanup on unmount.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
