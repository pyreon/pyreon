import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, hasJSXAttribute } from "../../utils/ast";

export const noLargeForWithoutBy: Rule = {
  meta: {
    id: "pyreon/no-large-for-without-by",
    category: "performance",
    description:
      "Error when <For> is used without a `by` prop — critical for reconciliation performance.",
    severity: "error",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || name.name !== "For") return;
        if (hasJSXAttribute(node, "by")) return;
        context.report({
          message:
            "`<For>` without `by` prop — provide a key function for efficient reconciliation.",
          span: getSpan(node),
        });
      },
    };
    return callbacks;
  },
};
