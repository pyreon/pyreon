import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo } from "../../utils/ast";

export const noEffectInMount: Rule = {
  meta: {
    id: "pyreon/no-effect-in-mount",
    category: "lifecycle",
    description:
      "Inform when effect() is created inside onMount — effects are typically created at setup time.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    let mountDepth = 0;
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth++;
        }
        if (mountDepth > 0 && isCallTo(node, "effect")) {
          context.report({
            message:
              "`effect()` inside `onMount` — effects are typically created at component setup time, not inside lifecycle hooks.",
            span: getSpan(node),
          });
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth--;
        }
      },
    };
    return callbacks;
  },
};
