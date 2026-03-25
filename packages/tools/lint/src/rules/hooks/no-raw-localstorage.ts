import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Suggest useStorage() over raw localStorage access.
 *
 * Bad:  `localStorage.getItem("key")`
 * Good: `const [value, setValue] = useStorage("key", defaultValue)`
 *
 * useStorage() is reactive, cross-tab synced, and SSR-safe.
 */
export const noRawLocalStorage: Rule = {
  meta: {
    id: "pyreon/no-raw-localstorage",
    description: "Suggest useStorage() over raw localStorage — reactive and SSR-safe",
    category: "hooks",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-raw-localstorage",
  },

  create(context) {
    return {
      MemberExpression(node: any) {
        if (
          node.object?.type === "Identifier" &&
          (node.object.name === "localStorage" || node.object.name === "sessionStorage") &&
          node.property?.type === "Identifier" &&
          (node.property.name === "getItem" ||
            node.property.name === "setItem" ||
            node.property.name === "removeItem")
        ) {
          const span = getSpan(node)
          context.report({
            message: `Use \`useStorage()\` from \`@pyreon/storage\` instead of raw \`${node.object.name}.${node.property.name}()\`. It's reactive, cross-tab synced, and SSR-safe.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
