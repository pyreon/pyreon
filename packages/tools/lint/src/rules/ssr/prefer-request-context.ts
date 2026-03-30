import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo } from "../../utils/ast";

export const preferRequestContext: Rule = {
  meta: {
    id: "pyreon/prefer-request-context",
    category: "ssr",
    description:
      "Warn about module-level signal()/createStore() in server files — use request context instead.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath();
    const isServerFile =
      filePath.includes("server") ||
      filePath.includes(".server.") ||
      filePath.endsWith("server.ts") ||
      filePath.endsWith("server.tsx");

    if (!isServerFile) return {};

    let functionDepth = 0;
    const callbacks: VisitorCallbacks = {
      FunctionDeclaration() {
        functionDepth++;
      },
      "FunctionDeclaration:exit"() {
        functionDepth--;
      },
      FunctionExpression() {
        functionDepth++;
      },
      "FunctionExpression:exit"() {
        functionDepth--;
      },
      ArrowFunctionExpression() {
        functionDepth++;
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth--;
      },
      CallExpression(node: any) {
        if (functionDepth > 0) return; // only flag module-level calls
        if (isCallTo(node, "signal") || isCallTo(node, "createStore")) {
          const name = node.callee.name;
          context.report({
            message: `Module-level \`${name}()\` in a server file — this state is shared across all requests. Use \`runWithRequestContext()\` for per-request isolation.`,
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
