import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isMemberCallTo } from "../../utils/ast";

export const noMismatchRisk: Rule = {
  meta: {
    id: "pyreon/no-mismatch-risk",
    category: "ssr",
    description:
      "Warn about non-deterministic calls (Date.now, Math.random, crypto.randomUUID) in JSX context that cause hydration mismatches.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let jsxDepth = 0;
    const callbacks: VisitorCallbacks = {
      JSXElement() {
        jsxDepth++;
      },
      "JSXElement:exit"() {
        jsxDepth--;
      },
      JSXFragment() {
        jsxDepth++;
      },
      "JSXFragment:exit"() {
        jsxDepth--;
      },
      CallExpression(node: any) {
        if (jsxDepth === 0) return;

        if (
          isMemberCallTo(node, "Date", "now") ||
          isMemberCallTo(node, "Math", "random") ||
          isMemberCallTo(node, "crypto", "randomUUID")
        ) {
          const callee = node.callee;
          const name = `${callee.object.name}.${callee.property.name}`;
          context.report({
            message: `\`${name}()\` in JSX context — this produces different values on server and client, causing hydration mismatches.`,
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
