import type { Rule } from "../../types"
import { getJSXTagName, getSpan } from "../../utils/ast"

/**
 * Disallow using array index as the `by` key in `<For>`.
 *
 * Bad:  `<For each={items} by={(_, i) => i}>`
 * Good: `<For each={items} by={item => item.id}>`
 *
 * Index keys cause reconciliation bugs when items are reordered or removed.
 */
export const noIndexAsBy: Rule = {
  meta: {
    id: "pyreon/no-index-as-by",
    description: "Disallow index as `by` key in <For> — causes reconciliation bugs",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-index-as-by",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName !== "For") return

        const byAttr = node.openingElement?.attributes?.find(
          (attr: any) => attr.type === "JSXAttribute" && attr.name?.name === "by",
        )
        if (!byAttr?.value) return

        // Check for by={(_, i) => i} pattern
        const expr =
          byAttr.value.type === "JSXExpressionContainer"
            ? byAttr.value.expression
            : byAttr.value

        if (
          expr?.type === "ArrowFunctionExpression" &&
          expr.params?.length === 2
        ) {
          const body = expr.body
          const secondParam = expr.params[1]

          // Check if body simply returns the second param (index)
          if (
            body?.type === "Identifier" &&
            secondParam?.type === "Identifier" &&
            body.name === secondParam.name
          ) {
            const span = getSpan(byAttr)
            context.report({
              message:
                "Using array index as `by` key causes reconciliation bugs when items are reordered. Use a stable unique identifier.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
