import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow effect() inside effect().
 *
 * Bad:  `effect(() => { effect(() => { ... }) })`
 * Good: Use `computed()` for derived values, or separate effects.
 *
 * Nested effects create a new subscription tree on every outer re-execution,
 * leading to exponential subscription growth.
 */
export const noNestedEffect: Rule = {
  meta: {
    id: "pyreon/no-nested-effect",
    description: "Disallow effect() inside effect() — use computed() for derived values",
    category: "reactivity",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-nested-effect",
  },

  create(context) {
    let effectDepth = 0

    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return

        if (effectDepth > 0) {
          const span = getSpan(node)
          context.report({
            message:
              "Nested `effect()` creates a new subscription tree on every outer re-execution. Use `computed()` for derived values or separate the effects.",
            loc: context.getLocation(span.start),
            span,
          })
        }

        effectDepth++
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth--
        }
      },
    }
  },
}
