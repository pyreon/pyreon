import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isTestFile } from '../../utils/file-roles'

export const noDuplicateStoreId: Rule = {
  meta: {
    id: 'pyreon/no-duplicate-store-id',
    category: 'store',
    description: 'Disallow duplicate defineStore() IDs in the same file.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    // Heuristic: skip test files. The rule catches a real bug (two
    // `defineStore('foo', ...)` calls in production code clobber each
    // other), but store tests deliberately duplicate IDs to assert
    // collision-handling behavior. A truly precise check would need to
    // detect "this duplicate is wrapped in `expect(...).toThrow`" or
    // similar — impractical at lint level. For prod code that intentionally
    // (re)defines a store ID, use `// pyreon-lint-disable-next-line` at
    // the second declaration.
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
