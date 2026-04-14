import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isCleanupWrapperFoundation } from '../../utils/package-classification'

export const noRawAddEventListener: Rule = {
  meta: {
    id: 'pyreon/no-raw-addeventlistener',
    category: 'hooks',
    description: 'Suggest useEventListener() instead of raw .addEventListener() calls.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    // `runtime-dom` + `@pyreon/hooks` IMPLEMENT the auto-cleanup wrappers this
    // rule steers consumers toward. `useEventListener`, `useClickOutside`,
    // `useKeyboard`, `useMediaQuery`, `useOnline`, etc. each must call raw
    // `addEventListener` internally. Same for `runtime-dom`'s event delegation.
    if (isCleanupWrapperFoundation(context.getFilePath())) return {}

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
