import type { Rule } from "../../types"
import { getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Require accessible label on dialog elements.
 *
 * Bad:  `<dialog>...</dialog>`
 * Good: `<dialog aria-label="Confirm action">...</dialog>`
 *       or `<dialog aria-labelledby="dialog-title">...</dialog>`
 */
export const dialogA11y: Rule = {
  meta: {
    id: "pyreon/dialog-a11y",
    description: "Require aria-label or aria-labelledby on <dialog> elements",
    category: "accessibility",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/dialog-a11y",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const opening = node.openingElement
        if (!opening?.name || opening.name.type !== "JSXIdentifier") return
        if (opening.name.name !== "dialog") return

        if (
          !hasJSXAttribute(node, "aria-label") &&
          !hasJSXAttribute(node, "aria-labelledby")
        ) {
          const span = getSpan(opening)
          context.report({
            message:
              "`<dialog>` needs `aria-label` or `aria-labelledby` for screen reader accessibility.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
