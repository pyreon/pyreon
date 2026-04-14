import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { createComponentContextTracker } from '../../utils/component-context'

const STORAGE_OBJECTS = new Set(['localStorage', 'sessionStorage'])
const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem'])

export const noRawLocalStorage: Rule = {
  meta: {
    id: 'pyreon/no-raw-localstorage',
    category: 'hooks',
    description:
      'Suggest useStorage() instead of raw localStorage/sessionStorage inside a component or hook.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    // The rule's premise — "use the reactive, cross-tab synced wrapper" —
    // only applies inside a component / hook. Module-level config readers,
    // utility helpers, and storage-library internals legitimately use the
    // raw API. Foundation-package opt-out (e.g. `@pyreon/storage` itself)
    // belongs in the consuming project's lint config, not in rule source.
    const ctx = createComponentContextTracker()

    const callbacks: VisitorCallbacks = {
      ...ctx.callbacks,
      CallExpression(node: any) {
        if (!ctx.isInComponentOrHook()) return
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (
          callee.object?.type === 'Identifier' &&
          STORAGE_OBJECTS.has(callee.object.name) &&
          callee.property?.type === 'Identifier' &&
          STORAGE_METHODS.has(callee.property.name)
        ) {
          context.report({
            message: `Raw \`${callee.object.name}.${callee.property.name}()\` — consider using \`useStorage()\` from \`@pyreon/storage\` for reactive, cross-tab synced storage.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
