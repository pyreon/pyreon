import type { Rule } from "../../types"
import { getJSXTagName, getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Require accessibility considerations on Overlay components.
 *
 * Overlays should have role, aria-label, or be wrapped with focus trap logic.
 */
export const overlayA11y: Rule = {
  meta: {
    id: "pyreon/overlay-a11y",
    description: "Require role and aria attributes on <Overlay> components",
    category: "accessibility",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/overlay-a11y",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName !== "Overlay") return

        if (
          !hasJSXAttribute(node, "role") &&
          !hasJSXAttribute(node, "aria-label") &&
          !hasJSXAttribute(node, "aria-labelledby")
        ) {
          const span = getSpan(node.openingElement)
          context.report({
            message:
              "`<Overlay>` should have `role` and `aria-label`/`aria-labelledby` for accessibility. Consider adding focus trap behavior.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
