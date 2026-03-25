import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Prefer `<Show>` over `style={{ display: cond ? 'block' : 'none' }}`.
 *
 * CSS display toggling keeps the hidden DOM in memory and doesn't unmount.
 * `<Show>` removes the DOM entirely when hidden.
 */
export const preferShowOverDisplay: Rule = {
  meta: {
    id: "pyreon/prefer-show-over-display",
    description: "Prefer <Show> over style={{ display: condition }} for conditional visibility",
    category: "performance",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/prefer-show-over-display",
  },

  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.name !== "style") return

        const value = node.value
        if (!value || value.type !== "JSXExpressionContainer") return

        const expr = value.expression
        if (!expr || expr.type !== "ObjectExpression") return

        for (const prop of expr.properties ?? []) {
          if (
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "display" &&
            prop.value?.type === "ConditionalExpression"
          ) {
            const span = getSpan(prop)
            context.report({
              message:
                "Conditional `display` style keeps hidden DOM in memory. Use `<Show>` to unmount hidden content entirely.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
