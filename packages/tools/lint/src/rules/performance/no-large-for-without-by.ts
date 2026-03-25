import type { Rule } from "../../types"
import { getJSXTagName, getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Error when `<For>` iterates a large collection without a `by` prop.
 * This is stricter than no-missing-for-by — it's an error, not a warning.
 *
 * Without `by`, large lists use O(n) index-based reconciliation.
 */
export const noLargeForWithoutBy: Rule = {
  meta: {
    id: "pyreon/no-large-for-without-by",
    description: "Require `by` on <For> for large collections — O(n) reconciliation without it",
    category: "performance",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-large-for-without-by",
  },

  create(context) {
    // This is the same check as no-missing-for-by but at error severity.
    // It exists as a separate rule so users can enable strict mode for
    // performance-critical code without changing the warn-level JSX rule.
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName !== "For") return
        if (hasJSXAttribute(node, "by")) return

        const span = getSpan(node.openingElement)
        context.report({
          message:
            "`<For>` without `by` uses O(n) index-based reconciliation. Add a `by` prop with a stable key function.",
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
