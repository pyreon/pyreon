import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, hasJSXAttribute } from "../../utils/ast";

export const overlayA11y: Rule = {
  meta: {
    id: "pyreon/overlay-a11y",
    category: "accessibility",
    description: "Warn when <Overlay> is missing role, aria-label, or aria-labelledby.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || name.name !== "Overlay") return;

        const hasRole = hasJSXAttribute(node, "role");
        const hasLabel = hasJSXAttribute(node, "aria-label");
        const hasLabelledBy = hasJSXAttribute(node, "aria-labelledby");

        if (!hasRole && !hasLabel && !hasLabelledBy) {
          context.report({
            message:
              "`<Overlay>` missing `role`, `aria-label`, or `aria-labelledby` — provide accessibility attributes for screen readers.",
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
