import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isTestFile } from '../../utils/package-classification'

export const noDuplicateStoreId: Rule = {
  meta: {
    id: 'pyreon/no-duplicate-store-id',
    category: 'store',
    description: 'Disallow duplicate defineStore() IDs in the same file.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    // Store tests intentionally duplicate IDs to assert collision handling.
    if (isTestFile(context.getFilePath())) return {}

    const storeIds = new Map<string, { start: number; end: number }>()

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, 'defineStore')) return
        const args = node.arguments
        if (!args || args.length === 0) return

        const firstArg = args[0]
        if (!firstArg) return

        let id: string | null = null
        if (firstArg.type === 'Literal' || firstArg.type === 'StringLiteral') {
          id = firstArg.value as string
        }

        if (typeof id !== 'string') return

        if (storeIds.has(id)) {
          context.report({
            message: `Duplicate store ID \`"${id}"\` — each \`defineStore()\` must have a unique ID.`,
            span: getSpan(node),
          })
        } else {
          storeIds.set(id, getSpan(node))
        }
      },
    }
    return callbacks
  },
}
