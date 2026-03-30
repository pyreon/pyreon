import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo } from "../../utils/ast";

function isUpdateCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "update"
  );
}

export const noEffectAssignment: Rule = {
  meta: {
    id: "pyreon/no-effect-assignment",
    category: "reactivity",
    description: "Warn when an effect only contains a single .update() call.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return;
        const args = node.arguments;
        if (!args || args.length === 0) return;

        const fn = args[0];
        if (!fn) return;

        let body: any = null;
        if (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression") {
          body = fn.body;
        }
        if (!body) return;

        // Arrow with expression body
        if (isUpdateCall(body)) {
          context.report({
            message:
              "Effect contains a single `.update()` — consider using `computed()` for derived values.",
            span: getSpan(node),
          });
          return;
        }

        // Block body with single statement
        if (body.type === "BlockStatement") {
          const stmts = body.body;
          if (stmts && stmts.length === 1) {
            const stmt = stmts[0];
            if (stmt.type === "ExpressionStatement" && isUpdateCall(stmt.expression)) {
              context.report({
                message:
                  "Effect contains a single `.update()` — consider using `computed()` for derived values.",
                span: getSpan(node),
              });
            }
          }
        }
      },
    };
    return callbacks;
  },
};
