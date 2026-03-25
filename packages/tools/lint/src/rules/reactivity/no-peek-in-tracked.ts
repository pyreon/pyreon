import type { Rule } from "../../types"
import { getSpan, isCallTo, isPeekCall } from "../../utils/ast"

/**
 * Disallow .peek() inside effect() or computed().
 *
 * Bad:  `effect(() => { console.log(count.peek()) })`
 * Good: `effect(() => { console.log(count()) })`
 *
 * .peek() bypasses dependency tracking, causing stale reads in reactive contexts.
 */
export const noPeekInTracked: Rule = {
  meta: {
    id: "pyreon/no-peek-in-tracked",
    description: "Disallow .peek() inside effect/computed — bypasses dependency tracking",
    category: "reactivity",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-peek-in-tracked",
  },

  create(context) {
    let trackedDepth = 0

    return {
      CallExpression(node: any) {
        if (isCallTo(node, "effect") || isCallTo(node, "computed")) {
          trackedDepth++
        }

        if (trackedDepth > 0 && isPeekCall(node)) {
          const span = getSpan(node)
          context.report({
            message:
              "`.peek()` inside a tracked context (effect/computed) bypasses dependency tracking, causing stale reads. Use a normal signal read instead.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect") || isCallTo(node, "computed")) {
          trackedDepth--
        }
      },
    }
  },
}
