import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Prefer `onInput` over `onChange` on form elements.
 *
 * Bad:  `<input onChange={handler}>`
 * Good: `<input onInput={handler}>`
 *
 * `onChange` in native DOM fires on blur, not on every keystroke.
 * Use `onInput` for keypress-by-keypress updates.
 */
export const noOnchange: Rule = {
  meta: {
    id: "pyreon/no-onchange",
    description: "Prefer `onInput` over `onChange` on inputs — native DOM onChange fires on blur",
    category: "jsx",
    defaultSeverity: "warn",
    fixable: true,
    docs: "https://pyreon.dev/lint/no-onchange",
  },

  create(context) {
    const inputElements = new Set(["input", "textarea", "select"])

    return {
      JSXElement(node: any) {
        const opening = node.openingElement
        if (!opening?.name || opening.name.type !== "JSXIdentifier") return

        // Only flag on form input elements
        if (!inputElements.has(opening.name.name)) return

        for (const attr of opening.attributes ?? []) {
          if (attr.type === "JSXAttribute" && attr.name?.name === "onChange") {
            const span = getSpan(attr.name)
            context.report({
              message:
                "Use `onInput` instead of `onChange` on form elements. Native DOM `onChange` fires on blur, not on every keystroke.",
              loc: context.getLocation(span.start),
              span,
              fix: {
                span,
                replacement: "onInput",
              },
            })
          }
        }
      },
    }
  },
}
