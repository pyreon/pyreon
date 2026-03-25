import type { Rule } from "../../types"
import { getJSXTagName, getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Require accessibility attributes on toast containers.
 *
 * Toast elements should have `role="alert"` or `aria-live` for screen readers.
 */
export const toastA11y: Rule = {
  meta: {
    id: "pyreon/toast-a11y",
    description: "Require role=\"alert\" or aria-live on toast elements",
    category: "accessibility",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/toast-a11y",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (!tagName) return

        // Check custom toast components
        if (tagName.toLowerCase().includes("toast") && tagName[0] === tagName[0].toUpperCase()) {
          // Skip Toaster (the container) — it's the individual toasts that need a11y
          if (tagName === "Toaster") return

          if (!hasJSXAttribute(node, "role") && !hasJSXAttribute(node, "aria-live")) {
            const span = getSpan(node.openingElement)
            context.report({
              message:
                "Toast component should have `role=\"alert\"` or `aria-live` for screen reader accessibility.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
