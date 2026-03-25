import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow direct DOM access in component setup (outside onMount).
 *
 * Bad:  `const el = document.querySelector('.foo')` in component body
 * Good: `onMount(() => { const el = document.querySelector('.foo') })`
 *
 * DOM isn't available during SSR or before mount.
 */
export const noDomInSetup: Rule = {
  meta: {
    id: "pyreon/no-dom-in-setup",
    description: "Disallow document/DOM access in component setup — use onMount",
    category: "lifecycle",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-dom-in-setup",
  },

  create(context) {
    const domMethods = new Set(["querySelector", "querySelectorAll", "getElementById", "getElementsByClassName", "getElementsByTagName"])
    let mountDepth = 0
    let effectDepth = 0

    return {
      CallExpression(node: any) {
        if (isCallTo(node, "onMount")) mountDepth++
        if (isCallTo(node, "effect")) effectDepth++

        // Skip if inside onMount or effect
        if (mountDepth > 0 || effectDepth > 0) return

        // Check for document.querySelector etc.
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.object.name === "document" &&
          node.callee.property?.type === "Identifier" &&
          domMethods.has(node.callee.property.name)
        ) {
          const span = getSpan(node)
          context.report({
            message: `\`document.${node.callee.property.name}()\` in component setup runs before DOM is available. Move to \`onMount()\`.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "onMount")) mountDepth--
        if (isCallTo(node, "effect")) effectDepth--
      },
    }
  },
}
