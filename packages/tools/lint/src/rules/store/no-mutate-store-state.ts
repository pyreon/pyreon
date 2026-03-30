import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";

export const noMutateStoreState: Rule = {
  meta: {
    id: "pyreon/no-mutate-store-state",
    category: "store",
    description: "Warn when directly calling .set() on store signals — use store actions instead.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") return;
        if (callee.property?.type !== "Identifier" || callee.property.name !== "set") return;

        // Check for store.signal.set() pattern — member.member.set()
        const obj = callee.object;
        if (!obj || obj.type !== "MemberExpression") return;
        const outerObj = obj.object;
        if (!outerObj || outerObj.type !== "Identifier") return;

        const name: string = outerObj.name;
        // Heuristic: if the outer object name contains "store" (case-insensitive)
        if (name.toLowerCase().includes("store")) {
          context.report({
            message: `Direct \`.set()\` on store state \`${name}\` — use store actions to mutate state for better traceability.`,
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
