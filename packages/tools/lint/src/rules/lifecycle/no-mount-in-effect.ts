import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

export const noMountInEffect: Rule = {
  meta: {
    id: "pyreon/no-mount-in-effect",
    category: "lifecycle",
    description: "Warn when onMount is called inside effect().",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let effectDepth = 0
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth++
        }
        if (effectDepth > 0 && isCallTo(node, "onMount")) {
          context.report({
            message:
              "`onMount` inside `effect()` — `onMount` runs once on mount, not on every effect re-run.",
            span: getSpan(node),
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth--
        }
      },
    }
    return callbacks
  },
}
