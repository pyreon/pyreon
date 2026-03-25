import type { Rule } from "../../types"
import { getJSXTagName, getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when effect() is used inside a <For> callback.
 *
 * Bad:  `<For each={items}>{item => { effect(() => { ... }); return <li/> }}</For>`
 * Good: Extract the item component, or use computed() per item.
 *
 * Creating N effects for N items is expensive and hard to clean up.
 */
export const noEffectInFor: Rule = {
  meta: {
    id: "pyreon/no-effect-in-for",
    description: "Warn against effect() inside <For> callback — creates N effects for N items",
    category: "performance",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-effect-in-for",
  },

  create(context) {
    let forCallbackDepth = 0

    return {
      JSXElement(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName === "For") {
          // The children of <For> are the callback
          forCallbackDepth++
        }
      },
      "JSXElement:exit"(node: any) {
        const tagName = getJSXTagName(node)
        if (tagName === "For") {
          forCallbackDepth--
        }
      },

      CallExpression(node: any) {
        if (forCallbackDepth === 0) return
        if (!isCallTo(node, "effect")) return

        const span = getSpan(node)
        context.report({
          message:
            "`effect()` inside `<For>` creates a new effect for every item. Extract to a component or use `computed()` per item.",
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
