import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";

const INPUT_TAGS = new Set(["input", "textarea", "select"]);

export const noOnChange: Rule = {
  meta: {
    id: "pyreon/no-onchange",
    category: "jsx",
    description:
      "Prefer `onInput` over `onChange` on input elements for keypress-by-keypress updates.",
    severity: "warn",
    fixable: true,
  },
  create(context) {
    let currentTag: string | null = null;
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name;
        if (name?.type === "JSXIdentifier" && INPUT_TAGS.has(name.name)) {
          currentTag = name.name;
        } else {
          currentTag = null;
        }

        if (!currentTag) return;
        const attrs = node.attributes ?? [];
        for (const attr of attrs) {
          if (
            attr.type === "JSXAttribute" &&
            attr.name?.type === "JSXIdentifier" &&
            attr.name.name === "onChange"
          ) {
            const nameSpan = getSpan(attr.name);
            context.report({
              message: `Use \`onInput\` instead of \`onChange\` on \`<${currentTag}>\` for keypress-by-keypress updates.`,
              span: getSpan(attr),
              fix: { span: nameSpan, replacement: "onInput" },
            });
          }
        }
      },
    };
    return callbacks;
  },
};
