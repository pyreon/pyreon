import type { Rule, VisitorCallbacks } from "../../types";
import { getJSXAttribute, getSpan } from "../../utils/ast";

export const noIndexAsBy: Rule = {
  meta: {
    id: "pyreon/no-index-as-by",
    category: "jsx",
    description: "Disallow using index as `by` prop on <For> — use a unique key instead.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || name.name !== "For") return;

        const byAttr = getJSXAttribute(node, "by");
        if (!byAttr) return;

        const value = byAttr.value;
        if (!value || value.type !== "JSXExpressionContainer") return;

        const expr = value.expression;
        if (!expr) return;

        // Detect: by={(_, i) => i} or by={(item, index) => index}
        if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
          const params = expr.params;
          if (!params || params.length < 2) return;

          const secondParam = params[1];
          if (!secondParam || secondParam.type !== "Identifier") return;

          const indexName = secondParam.name;
          const body = expr.body;

          // Arrow expression body: (_, i) => i
          if (body?.type === "Identifier" && body.name === indexName) {
            context.report({
              message:
                "Using index as `by` prop on `<For>` — use a unique key from the data instead.",
              span: getSpan(byAttr),
            });
          }

          // Block body: (_, i) => { return i }
          if (body?.type === "BlockStatement") {
            const stmts = body.body;
            if (stmts?.length === 1) {
              const stmt = stmts[0];
              if (
                stmt.type === "ReturnStatement" &&
                stmt.argument?.type === "Identifier" &&
                stmt.argument.name === indexName
              ) {
                context.report({
                  message:
                    "Using index as `by` prop on `<For>` — use a unique key from the data instead.",
                  span: getSpan(byAttr),
                });
              }
            }
          }
        }
      },
    };
    return callbacks;
  },
};
