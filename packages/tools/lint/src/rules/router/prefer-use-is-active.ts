import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan } from "../../utils/ast"

export const preferUseIsActive: Rule = {
  meta: {
    id: "pyreon/prefer-use-is-active",
    category: "router",
    description:
      'Suggest useIsActive() instead of `location.pathname === "/foo"` or `route.path === "/foo"` patterns.',
    severity: "info",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      BinaryExpression(node: any) {
        if (node.operator !== "===" && node.operator !== "==") return

        // Check both sides for location.pathname or route.path
        if (isPathComparison(node.left) || isPathComparison(node.right)) {
          context.report({
            message:
              "Manual path comparison — use `useIsActive()` for reactive route matching with segment-aware prefix matching.",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}

function isPathComparison(node: any): boolean {
  if (!node || node.type !== "MemberExpression") return false
  const obj = node.object
  const prop = node.property
  if (!obj || !prop || prop.type !== "Identifier") return false

  // location.pathname
  if (obj.type === "Identifier" && obj.name === "location" && prop.name === "pathname") return true

  // route.path
  if (obj.type === "Identifier" && obj.name === "route" && prop.name === "path") return true

  return false
}
