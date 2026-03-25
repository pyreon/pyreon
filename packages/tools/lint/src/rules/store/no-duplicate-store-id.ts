import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow duplicate defineStore() IDs in the same file.
 *
 * Bad:  Two `defineStore("auth", ...)` in the same file
 * Good: Unique store IDs
 */
export const noDuplicateStoreId: Rule = {
  meta: {
    id: "pyreon/no-duplicate-store-id",
    description: "Disallow duplicate defineStore() IDs in the same file",
    category: "store",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-duplicate-store-id",
  },

  create(context) {
    const storeIds = new Map<string, any>()

    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "defineStore")) return

        const firstArg = node.arguments?.[0]
        if (!firstArg || firstArg.type !== "Literal" || typeof firstArg.value !== "string") return

        const id = firstArg.value
        if (storeIds.has(id)) {
          const span = getSpan(node)
          context.report({
            message: `Duplicate store ID "${id}". Each \`defineStore()\` must have a unique ID.`,
            loc: context.getLocation(span.start),
            span,
          })
        } else {
          storeIds.set(id, node)
        }
      },
    }
  },
}
