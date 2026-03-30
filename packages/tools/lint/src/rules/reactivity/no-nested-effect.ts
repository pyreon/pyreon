import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo } from "../../utils/ast";

export const noNestedEffect: Rule = {
  meta: {
    id: "pyreon/no-nested-effect",
    category: "reactivity",
    description: "Warn against nesting effect() inside another effect().",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let effectDepth = 0;
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return;
        if (effectDepth > 0) {
          context.report({
            message: "Nested `effect()` — consider using `computed()` for derived values instead.",
            span: getSpan(node),
          });
        }
        effectDepth++;
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "effect")) {
          effectDepth--;
        }
      },
    };
    return callbacks;
  },
};
