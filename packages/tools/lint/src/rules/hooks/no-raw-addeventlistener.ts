import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";

export const noRawAddEventListener: Rule = {
  meta: {
    id: "pyreon/no-raw-addeventlistener",
    category: "hooks",
    description: "Suggest useEventListener() instead of raw .addEventListener() calls.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") return;
        if (callee.property?.type !== "Identifier" || callee.property.name !== "addEventListener")
          return;
        context.report({
          message:
            "Raw `.addEventListener()` — consider using `useEventListener()` from `@pyreon/hooks` for auto-cleanup on unmount.",
          span: getSpan(node),
        });
      },
    };
    return callbacks;
  },
};
