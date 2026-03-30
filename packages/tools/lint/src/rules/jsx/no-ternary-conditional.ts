import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isTernaryWithJSX } from "../../utils/ast";

export const noTernaryConditional: Rule = {
  meta: {
    id: "pyreon/no-ternary-conditional",
    category: "jsx",
    description: "Prefer <Show> over ternary expressions with JSX branches.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let jsxExpressionDepth = 0;
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer() {
        jsxExpressionDepth++;
      },
      "JSXExpressionContainer:exit"() {
        jsxExpressionDepth--;
      },
      ConditionalExpression(node: any) {
        if (jsxExpressionDepth === 0) return;
        if (!isTernaryWithJSX(node)) return;
        context.report({
          message: "Ternary with JSX — use `<Show>` for more efficient conditional rendering.",
          span: getSpan(node),
        });
      },
    };
    return callbacks;
  },
};
