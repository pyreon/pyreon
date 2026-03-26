import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

const TIMER_FNS = new Set(["setInterval", "setTimeout"])

export const noRawSetInterval: Rule = {
  meta: {
    id: "pyreon/no-raw-setinterval",
    category: "hooks",
    description: "Suggest wrapping setInterval/setTimeout in onMount for automatic cleanup.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    let mountDepth = 0
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth++
        }

        if (mountDepth > 0) return

        const callee = node.callee
        if (!callee || callee.type !== "Identifier") return
        if (TIMER_FNS.has(callee.name)) {
          context.report({
            message: `\`${callee.name}()\` outside \`onMount\` — wrap in \`onMount(() => { ... return () => clear... })\` for automatic cleanup.`,
            span: getSpan(node),
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth--
        }
      },
    }
    return callbacks
  },
}
