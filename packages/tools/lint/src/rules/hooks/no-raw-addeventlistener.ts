import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isDomRuntimeFile } from '../../utils/package-classification'

export const noRawAddEventListener: Rule = {
  meta: {
    id: 'pyreon/no-raw-addeventlistener',
    category: 'hooks',
    description: 'Suggest useEventListener() instead of raw .addEventListener() calls.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    // `runtime-dom` is the DOM renderer that wires real listeners — it can't
    // use `useEventListener` (a hook built on top of it).
    if (isDomRuntimeFile(context.getFilePath())) return {}

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
