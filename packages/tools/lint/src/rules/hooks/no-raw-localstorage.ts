import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isTestFile } from '../../utils/package-classification'

const STORAGE_OBJECTS = new Set(['localStorage', 'sessionStorage'])
const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem'])

export const noRawLocalStorage: Rule = {
  meta: {
    id: 'pyreon/no-raw-localstorage',
    category: 'hooks',
    description: 'Suggest useStorage() instead of raw localStorage/sessionStorage access.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    // `@pyreon/storage` IS the package implementing `useStorage`/`useSessionStorage` —
    // its source legitimately accesses raw `localStorage`/`sessionStorage`.
    if (filePath.includes('packages/fundamentals/storage/')) return {}
    // Tests directly probe storage APIs to assert behavior.
    if (isTestFile(filePath)) return {}

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
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
