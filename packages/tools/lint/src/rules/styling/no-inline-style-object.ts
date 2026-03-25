import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Warn about inline style objects in JSX — creates new object each render.
 *
 * Bad:  `<div style={{ color: 'red', fontSize: '14px' }}>`
 * Good: `const styles = { color: 'red', fontSize: '14px' }; <div style={styles}>`
 *       or `<div style="color: red; font-size: 14px">`
 */
export const noInlineStyleObject: Rule = {
  meta: {
    id: "pyreon/no-inline-style-object",
    description: "Warn about inline style objects — creates new object each render",
    category: "styling",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-inline-style-object",
  },

  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.name !== "style") return

        const value = node.value
        if (!value || value.type !== "JSXExpressionContainer") return

        const expr = value.expression
        if (expr?.type === "ObjectExpression") {
          const span = getSpan(expr)
          context.report({
            message:
              "Inline style object creates a new object on every render. Extract to a const or use a string for static styles.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
