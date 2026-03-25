import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Disallow `htmlFor` — use `for` instead (standard HTML attribute).
 *
 * Bad:  `<label htmlFor="input">`
 * Good: `<label for="input">`
 */
export const noHtmlFor: Rule = {
  meta: {
    id: "pyreon/no-htmlfor",
    description: "Use `for` instead of `htmlFor` — Pyreon uses standard HTML attributes",
    category: "jsx",
    defaultSeverity: "error",
    fixable: true,
    docs: "https://pyreon.dev/lint/no-htmlfor",
  },

  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.name !== "htmlFor") return

        const span = getSpan(node.name)
        context.report({
          message: "Use `for` instead of `htmlFor`. Pyreon uses standard HTML attributes.",
          loc: context.getLocation(span.start),
          span,
          fix: {
            span,
            replacement: "for",
          },
        })
      },
    }
  },
}
