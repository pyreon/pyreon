import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, hasJSXAttribute } from "../../utils/ast";

export const dialogA11y: Rule = {
  meta: {
    id: "pyreon/dialog-a11y",
    category: "accessibility",
    description: "Warn when <dialog> is missing aria-label or aria-labelledby.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || name.name !== "dialog") return;

        const hasLabel = hasJSXAttribute(node, "aria-label");
        const hasLabelledBy = hasJSXAttribute(node, "aria-labelledby");

        if (!hasLabel && !hasLabelledBy) {
          context.report({
            message:
              "`<dialog>` missing `aria-label` or `aria-labelledby` — provide an accessible label for screen readers.",
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
