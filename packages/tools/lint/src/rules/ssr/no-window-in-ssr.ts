import type { Rule } from "../../types"
import { getSpan, isInsideDevGuard, isInsideOnMount, isInsideTypeofGuard } from "../../utils/ast"
import { BROWSER_GLOBALS } from "../../utils/imports"

/**
 * Disallow browser globals outside onMount or typeof guards.
 *
 * Bad:  `const width = window.innerWidth` in component body
 * Good: `onMount(() => { const width = window.innerWidth })`
 *       or `if (typeof window !== "undefined") { ... }`
 *
 * Browser globals crash during SSR where window/document don't exist.
 */
export const noWindowInSsr: Rule = {
  meta: {
    id: "pyreon/no-window-in-ssr",
    description: "Disallow browser globals outside onMount/typeof guard — crashes in SSR",
    category: "ssr",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-window-in-ssr",
  },

  create(context) {
    // Track scope: onMount, effect, typeof guards
    let safeDepth = 0
    const ancestors: any[] = []

    return {
      CallExpression(node: any) {
        if (
          node.callee?.type === "Identifier" &&
          (node.callee.name === "onMount" || node.callee.name === "effect")
        ) {
          safeDepth++
        }
        ancestors.push(node)
      },
      "CallExpression:exit"(node: any) {
        if (
          node.callee?.type === "Identifier" &&
          (node.callee.name === "onMount" || node.callee.name === "effect")
        ) {
          safeDepth--
        }
        ancestors.pop()
      },

      IfStatement(node: any) {
        ancestors.push(node)
      },
      "IfStatement:exit"() {
        ancestors.pop()
      },

      Identifier(node: any) {
        if (safeDepth > 0) return
        if (!BROWSER_GLOBALS.has(node.name)) return

        // Skip typeof checks: `typeof window`
        // The parent UnaryExpression with operator "typeof" is safe
        const parent = ancestors[ancestors.length - 1]
        if (parent?.type === "UnaryExpression" && parent.operator === "typeof") return

        // Skip if inside typeof guard
        if (isInsideTypeofGuard(ancestors, node.name)) return
        if (isInsideDevGuard(ancestors)) return

        // Skip import specifiers (e.g., import { Image } from "...")
        if (parent?.type === "ImportSpecifier" || parent?.type === "ImportDefaultSpecifier") return

        // Skip property access (obj.window is fine)
        if (parent?.type === "MemberExpression" && parent.property === node) return

        const span = getSpan(node)
        context.report({
          message: `\`${node.name}\` is a browser-only global and will crash during SSR. Move to \`onMount()\` or guard with \`typeof ${node.name} !== "undefined"\`.`,
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
