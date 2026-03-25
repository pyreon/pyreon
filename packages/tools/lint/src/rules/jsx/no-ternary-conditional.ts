import type { Rule } from "../../types"
import { getSpan, isTernaryWithJSX } from "../../utils/ast"

/**
 * Prefer `<Show>` over ternary expressions for conditional rendering.
 *
 * Bad:  `{isOpen() ? <Modal/> : null}`
 * Good: `<Show when={isOpen}><Modal/></Show>`
 *
 * `<Show>` is more efficient for signal-driven conditions because it
 * only re-evaluates the branch that changed.
 */
export const noTernaryConditional: Rule = {
  meta: {
    id: "pyreon/no-ternary-conditional",
    description: "Prefer <Show> over ternary for conditional JSX rendering",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-ternary-conditional",
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

      ConditionalExpression(node: any) {
        if (jsxDepth === 0) return
        if (!isTernaryWithJSX(node)) return

        const span = getSpan(node)
        context.report({
          message:
            "Use `<Show when={condition}>` instead of ternary for conditional JSX. `<Show>` provides more efficient reactive updates.",
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
