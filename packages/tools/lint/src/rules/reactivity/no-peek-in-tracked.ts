import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo, isPeekCall } from "../../utils/ast";

export const noPeekInTracked: Rule = {
  meta: {
    id: "pyreon/no-peek-in-tracked",
    category: "reactivity",
    description: "Disallow .peek() inside effect() or computed() — it bypasses tracking.",
    severity: "error",
    fixable: false,
  },
  create(context) {
    let trackedDepth = 0;
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, "effect") || isCallTo(node, "computed")) {
          trackedDepth++;
        }
        if (trackedDepth > 0 && isPeekCall(node)) {
          context.report({
            message:
              "`.peek()` inside a tracked scope (effect/computed) bypasses dependency tracking — use a normal signal read instead.",
            span: getSpan(node),
          });
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect") || isCallTo(node, "computed")) {
          trackedDepth--;
        }
      },
    };
    return callbacks;
  },
};
