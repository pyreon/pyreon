import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

const DOM_METHODS = new Set([
  "querySelector",
  "querySelectorAll",
  "getElementById",
  "getElementsByClassName",
  "getElementsByTagName",
])

export const noDomInSetup: Rule = {
  meta: {
    id: "pyreon/no-dom-in-setup",
    category: "lifecycle",
    description: "Warn when DOM query methods are used outside onMount or effect.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let safeDepth = 0 // inside onMount or effect
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, "onMount") || isCallTo(node, "effect")) {
          safeDepth++
        }

        if (safeDepth > 0) return

        // Check for document.querySelector() etc.
        const callee = node.callee
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "document" &&
          callee.property?.type === "Identifier" &&
          DOM_METHODS.has(callee.property.name)
        ) {
          context.report({
            message: `\`document.${callee.property.name}()\` outside \`onMount\`/\`effect\` — DOM is not available during SSR or setup phase.`,
            span: getSpan(node),
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "onMount") || isCallTo(node, "effect")) {
          safeDepth--
        }
      },
    }
    return callbacks
  },
}
