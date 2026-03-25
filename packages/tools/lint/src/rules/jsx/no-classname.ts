import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Disallow `className` — use `class` instead (standard HTML attribute).
 *
 * Bad:  `<div className="foo">`
 * Good: `<div class="foo">`
 *
 * Pyreon uses standard HTML attributes, not React-isms.
 */
export const noClassname: Rule = {
  meta: {
    id: "pyreon/no-classname",
    description: "Use `class` instead of `className` — Pyreon uses standard HTML attributes",
    category: "jsx",
    defaultSeverity: "error",
    fixable: true,
    docs: "https://pyreon.dev/lint/no-classname",
  },

  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.name !== "className") return

        const span = getSpan(node.name)
        context.report({
          message: "Use `class` instead of `className`. Pyreon uses standard HTML attributes.",
          loc: context.getLocation(span.start),
          span,
          fix: {
            span,
            replacement: "class",
          },
        })
      },
    }
  },
}
