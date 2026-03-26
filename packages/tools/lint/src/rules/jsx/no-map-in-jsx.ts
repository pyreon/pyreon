import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isArrayMapCall } from "../../utils/ast"

export const noMapInJsx: Rule = {
  meta: {
    id: "pyreon/no-map-in-jsx",
    category: "jsx",
    description: "Prefer <For> over .map() inside JSX for reactive list rendering.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let jsxDepth = 0
    const callbacks: VisitorCallbacks = {
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
        // Check callback contains JSX
        const args = node.arguments
        if (!args || args.length === 0) return
        const callback = args[0]
        if (!callback) return
        context.report({
          message: "`.map()` in JSX — use `<For>` for reactive list rendering instead.",
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
