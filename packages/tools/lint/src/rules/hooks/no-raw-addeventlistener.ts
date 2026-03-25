import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Suggest useEventListener() over raw addEventListener.
 *
 * Bad:  `element.addEventListener("click", handler)`
 * Good: `useEventListener(element, "click", handler)`
 *
 * useEventListener() auto-cleans up on component unmount.
 */
export const noRawAddEventListener: Rule = {
  meta: {
    id: "pyreon/no-raw-addeventlistener",
    description: "Suggest useEventListener() over raw addEventListener — auto-cleanup on unmount",
    category: "hooks",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-raw-addeventlistener",
  },

  create(context) {
    let hasHooksImport = false

    return {
      ImportDeclaration(node: any) {
        if (node.source?.value === "@pyreon/hooks") {
          hasHooksImport = true
        }
      },

      CallExpression(node: any) {
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "addEventListener"
        ) {
          const span = getSpan(node)
          context.report({
            message: `Use \`useEventListener()\` from \`@pyreon/hooks\` instead of raw \`addEventListener()\`. It auto-cleans up on component unmount.${hasHooksImport ? "" : " Import it with: import { useEventListener } from \"@pyreon/hooks\""}`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
