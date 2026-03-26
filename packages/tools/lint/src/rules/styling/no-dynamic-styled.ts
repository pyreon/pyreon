import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

export const noDynamicStyled: Rule = {
  meta: {
    id: "pyreon/no-dynamic-styled",
    category: "styling",
    description:
      "Warn when styled() is called inside a function — it creates new CSS on every render.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let functionDepth = 0
    const callbacks: VisitorCallbacks = {
      FunctionDeclaration() {
        functionDepth++
      },
      "FunctionDeclaration:exit"() {
        functionDepth--
      },
      FunctionExpression() {
        functionDepth++
      },
      "FunctionExpression:exit"() {
        functionDepth--
      },
      ArrowFunctionExpression() {
        functionDepth++
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth--
      },
      CallExpression(node: any) {
        if (functionDepth === 0) return
        if (isCallTo(node, "styled")) {
          context.report({
            message:
              "`styled()` inside a function — this creates new CSS rules on every render. Move `styled()` to module scope.",
            span: getSpan(node),
          })
        }
      },
      TaggedTemplateExpression(node: any) {
        if (functionDepth === 0) return
        const tag = node.tag
        if (!tag) return
        // styled('div')`...` — tag is a CallExpression of styled
        if (tag.type === "CallExpression" && isCallTo(tag, "styled")) {
          context.report({
            message:
              "`styled()` tagged template inside a function — this creates new CSS rules on every render. Move to module scope.",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
