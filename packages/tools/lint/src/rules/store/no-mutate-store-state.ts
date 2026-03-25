import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Warn against directly mutating store signals outside actions.
 *
 * Bad:  `store.count.set(5)` from outside the store definition
 * Good: `store.increment()` — use store actions
 *
 * Direct mutation bypasses action middleware and devtools tracking.
 */
export const noMutateStoreState: Rule = {
  meta: {
    id: "pyreon/no-mutate-store-state",
    description: "Warn against direct .set() on store signals outside actions",
    category: "store",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-mutate-store-state",
  },

  create(context) {
    // Track variables assigned from store hooks
    const storeVars = new Set<string>()

    return {
      VariableDeclarator(node: any) {
        // const store = useMyStore()
        if (
          node.id?.type === "Identifier" &&
          node.init?.type === "CallExpression" &&
          node.init.callee?.type === "Identifier" &&
          node.init.callee.name.startsWith("use") &&
          node.init.callee.name.endsWith("Store")
        ) {
          storeVars.add(node.id.name)
        }

        // const { store } = useMyStore()
        if (
          node.id?.type === "ObjectPattern" &&
          node.init?.type === "CallExpression" &&
          node.init.callee?.type === "Identifier" &&
          node.init.callee.name.startsWith("use")
        ) {
          for (const prop of node.id.properties ?? []) {
            if (prop.key?.name === "store" && prop.value?.type === "Identifier") {
              storeVars.add(prop.value.name)
            }
          }
        }
      },

      CallExpression(node: any) {
        // store.someSignal.set(value)
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "set" &&
          node.callee.object?.type === "MemberExpression" &&
          node.callee.object.object?.type === "Identifier" &&
          storeVars.has(node.callee.object.object.name)
        ) {
          const span = getSpan(node)
          context.report({
            message:
              "Direct `.set()` on a store signal bypasses action middleware and devtools. Use a store action instead.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
