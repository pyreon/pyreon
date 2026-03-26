import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

export const noEffectInFor: Rule = {
  meta: {
    id: "pyreon/no-effect-in-for",
    category: "performance",
    description:
      "Warn when effect() is created inside <For> — creates effects per item on every reconciliation.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let forJsxDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (name?.type === "JSXIdentifier" && name.name === "For") {
          forJsxDepth++
        }
      },
      JSXClosingElement(node: any) {
        const name = node.name
        if (name?.type === "JSXIdentifier" && name.name === "For") {
          forJsxDepth--
        }
      },
      CallExpression(node: any) {
        if (forJsxDepth === 0) return
        if (isCallTo(node, "effect")) {
          context.report({
            message:
              "`effect()` inside `<For>` — this creates a new effect for every item on each reconciliation. Lift the effect outside.",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
