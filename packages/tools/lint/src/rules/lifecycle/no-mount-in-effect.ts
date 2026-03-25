import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow onMount inside effect() — runs on every re-execution.
 *
 * Bad:  `effect(() => { onMount(() => { ... }) })`
 * Good: `onMount(() => { ... })` at component level
 */
export const noMountInEffect: Rule = {
  meta: {
    id: "pyreon/no-mount-in-effect",
    description: "Disallow onMount inside effect() — it runs on every re-execution",
    category: "lifecycle",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-mount-in-effect",
  },

  create(context) {
    let effectDepth = 0

    return {
      CallExpression(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth++
        }

        if (effectDepth > 0 && isCallTo(node, "onMount")) {
          const span = getSpan(node)
          context.report({
            message:
              "`onMount()` inside `effect()` runs on every effect re-execution, not just once. Move it to the component level.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth--
        }
      },
    }
  },
}
