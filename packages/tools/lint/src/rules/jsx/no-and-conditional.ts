import type { Rule } from "../../types"
import { getSpan, isLogicalAndWithJSX } from "../../utils/ast"

/**
 * Prefer `<Show>` over `&&` for conditional rendering.
 *
 * Bad:  `{isOpen() && <Modal/>}`
 * Good: `<Show when={isOpen}><Modal/></Show>`
 */
export const noAndConditional: Rule = {
  meta: {
    id: "pyreon/no-and-conditional",
    description: "Prefer <Show> over `&&` for conditional JSX rendering",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-and-conditional",
  },

  create(context) {
    let jsxDepth = 0

    return {
      JSXExpressionContainer() {
        jsxDepth++
      },
      "JSXExpressionContainer:exit"() {
        jsxDepth--
      },

      LogicalExpression(node: any) {
        if (jsxDepth === 0) return
        if (!isLogicalAndWithJSX(node)) return

        const span = getSpan(node)
        context.report({
          message:
            "Use `<Show when={condition}>` instead of `&&` for conditional JSX. Avoids rendering `false`/`0` as text.",
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
