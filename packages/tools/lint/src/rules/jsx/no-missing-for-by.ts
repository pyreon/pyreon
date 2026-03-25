import type { Rule } from "../../types"
import { getJSXTagName, getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Warn when `<For>` is used without a `by` prop.
 *
 * Bad:  `<For each={items}>{item => <li>{item}</li>}</For>`
 * Good: `<For each={items} by={item => item.id}>{item => <li>{item}</li>}</For>`
 *
 * Without `by`, the reconciler falls back to index-based diffing.
 */
export const noMissingForBy: Rule = {
  meta: {
    id: "pyreon/no-missing-for-by",
    description: "Require `by` prop on <For> for efficient keyed reconciliation",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-missing-for-by",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName !== "For") return

        if (!hasJSXAttribute(node, "by")) {
          const span = getSpan(node.openingElement)
          context.report({
            message:
              "Add a `by` prop to `<For>` for keyed reconciliation. Without it, the reconciler uses index-based diffing which is slower and can cause bugs.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
