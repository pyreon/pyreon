import type { Rule } from "../../types"
import { getJSXTagName, getSpan, hasJSXAttribute } from "../../utils/ast"

/**
 * Enforce `by` prop instead of `key` on `<For>` components.
 *
 * Bad:  `<For each={items} key={r => r.id}>`
 * Good: `<For each={items} by={r => r.id}>`
 *
 * JSX reserves `key` for VNode reconciliation. Pyreon's `<For>` uses `by`.
 */
export const useByNotKey: Rule = {
  meta: {
    id: "pyreon/use-by-not-key",
    description: "Use `by` instead of `key` on <For> — JSX reserves `key` for VNode reconciliation",
    category: "jsx",
    defaultSeverity: "error",
    fixable: true,
    docs: "https://pyreon.dev/lint/use-by-not-key",
  },

  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName !== "For") return

        // Check for `key` attribute
        const keyAttr = node.openingElement?.attributes?.find(
          (attr: any) => attr.type === "JSXAttribute" && attr.name?.name === "key",
        )

        if (keyAttr && !hasJSXAttribute(node, "by")) {
          const span = getSpan(keyAttr.name)
          context.report({
            message:
              "Use `by` instead of `key` on `<For>`. JSX extracts `key` for VNode reconciliation — it never reaches the component.",
            loc: context.getLocation(span.start),
            span,
            fix: {
              span,
              replacement: "by",
            },
          })
        }
      },
    }
  },
}
