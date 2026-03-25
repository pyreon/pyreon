import type { Rule } from "../../types"
import { getSpan, isCallTo, isInsideOnMount } from "../../utils/ast"

/**
 * Suggest using onMount with cleanup over raw setInterval/setTimeout.
 *
 * Bad:  `setInterval(fn, 1000)` without cleanup
 * Good: `onMount(() => { const id = setInterval(fn, 1000); return () => clearInterval(id) })`
 */
export const noRawSetInterval: Rule = {
  meta: {
    id: "pyreon/no-raw-setinterval",
    description: "Suggest managed timers with cleanup over raw setInterval/setTimeout",
    category: "hooks",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-raw-setinterval",
  },

  create(context) {
    const ancestors: any[] = []

    return {
      CallExpression(node: any) {
        ancestors.push(node)

        if (
          node.callee?.type === "Identifier" &&
          (node.callee.name === "setInterval" || node.callee.name === "setTimeout")
        ) {
          // Skip if already inside onMount (the cleanup rule handles that)
          if (isInsideOnMount(ancestors)) return

          const span = getSpan(node)
          context.report({
            message: `\`${node.callee.name}()\` without lifecycle management. Use \`onMount()\` with a cleanup return, or \`useEventListener()\` patterns.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
      "CallExpression:exit"() {
        ancestors.pop()
      },
    }
  },
}
