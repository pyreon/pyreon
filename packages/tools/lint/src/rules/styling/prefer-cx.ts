import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Prefer cx() over string concatenation for class names.
 *
 * Bad:  `class={"btn " + (active ? "btn-active" : "")}`
 * Good: `class={cx("btn", active && "btn-active")}`
 */
export const preferCx: Rule = {
  meta: {
    id: "pyreon/prefer-cx",
    description: "Prefer cx() over string concatenation for class names",
    category: "styling",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/prefer-cx",
  },

  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.name !== "class") return

        const value = node.value
        if (!value || value.type !== "JSXExpressionContainer") return

        const expr = value.expression

        // Detect string concatenation: "foo " + bar
        if (expr?.type === "BinaryExpression" && expr.operator === "+") {
          if (hasStringPart(expr)) {
            const span = getSpan(expr)
            context.report({
              message:
                "Use `cx()` instead of string concatenation for class names. It handles falsy values, arrays, and objects.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }

        // Detect template literal: `foo ${bar}`
        if (expr?.type === "TemplateLiteral" && (expr.expressions?.length ?? 0) > 0) {
          const span = getSpan(expr)
          context.report({
            message:
              "Use `cx()` instead of template literals for class names. It handles falsy values, arrays, and objects.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}

function hasStringPart(node: any): boolean {
  if (node.type === "Literal" && typeof node.value === "string") return true
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return hasStringPart(node.left) || hasStringPart(node.right)
  }
  return false
}
