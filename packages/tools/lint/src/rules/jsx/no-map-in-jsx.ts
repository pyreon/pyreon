import type { Rule } from "../../types"
import { getSpan, isArrayMapCall } from "../../utils/ast"

/**
 * Prefer `<For>` over `.map()` in JSX for reactive list rendering.
 *
 * Bad:  `{items().map(item => <li>{item}</li>)}`
 * Good: `<For each={items} by={r => r.id}>{r => <li>{r}</li>}</For>`
 *
 * `.map()` recreates all children on every change. `<For>` uses keyed
 * reconciliation for O(1) updates.
 */
export const noMapInJsx: Rule = {
  meta: {
    id: "pyreon/no-map-in-jsx",
    description: "Prefer <For> over .map() in JSX for reactive list rendering",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-map-in-jsx",
  },

  create(context) {
    let jsxDepth = 0

    return {
      JSXElement() {
        jsxDepth++
      },
      "JSXElement:exit"() {
        jsxDepth--
      },
      JSXFragment() {
        jsxDepth++
      },
      "JSXFragment:exit"() {
        jsxDepth--
      },

      CallExpression(node: any) {
        if (jsxDepth === 0) return
        if (!isArrayMapCall(node)) return

        // Check if the callback returns JSX
        const callback = node.arguments?.[0]
        if (!callback) return
        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return
        }

        const span = getSpan(node)
        context.report({
          message:
            "Use `<For each={items} by={...}>` instead of `.map()` in JSX. `<For>` provides keyed reconciliation for efficient reactive updates.",
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
