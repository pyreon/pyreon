import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { createComponentContextTracker } from '../../utils/component-context'

export const noMutateStoreState: Rule = {
  meta: {
    id: 'pyreon/no-mutate-store-state',
    category: 'store',
    description:
      'Warn when calling .set() on store signals from a component or hook — use store actions instead.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // The wrong pattern is mutating store state from a component / event
    // handler / hook. Inside the store's own setup or in tests asserting
    // reactivity, `.set()` is fine. Component-context detection naturally
    // skips both cases without a path-based heuristic.
    const ctx = createComponentContextTracker()

    const callbacks: VisitorCallbacks = {
      ...ctx.callbacks,
      CallExpression(node: any) {
        if (!ctx.isInComponentOrHook()) return
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'set') return

        // Check for store.signal.set() pattern — member.member.set()
        const obj = callee.object
        if (!obj || obj.type !== 'MemberExpression') return
        const outerObj = obj.object
        if (!outerObj || outerObj.type !== 'Identifier') return

        const name: string = outerObj.name
        // Heuristic: if the outer object name contains "store" (case-insensitive)
        if (name.toLowerCase().includes('store')) {
          context.report({
            message: `Direct \`.set()\` on store state \`${name}\` — use store actions to mutate state for better traceability.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
