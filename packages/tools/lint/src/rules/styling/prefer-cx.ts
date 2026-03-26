import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan } from "../../utils/ast"

export const preferCx: Rule = {
  meta: {
    id: "pyreon/prefer-cx",
    category: "styling",
    description:
      "Suggest cx() for class composition instead of string concatenation or template literals.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== "JSXIdentifier" || node.name.name !== "class") return
        const value = node.value
        if (!value || value.type !== "JSXExpressionContainer") return
        const expr = value.expression
        if (!expr) return

        // String concatenation: "foo " + bar
        if (expr.type === "BinaryExpression" && expr.operator === "+") {
          context.report({
            message:
              "String concatenation in `class` attribute — use `cx()` for cleaner class composition.",
            span: getSpan(expr),
          })
          return
        }

        // Template literal: `foo ${bar}`
        if (expr.type === "TemplateLiteral" && expr.expressions?.length > 0) {
          context.report({
            message:
              "Template literal in `class` attribute — use `cx()` for cleaner class composition.",
            span: getSpan(expr),
          })
        }
      },
    }
    return callbacks
  },
}
