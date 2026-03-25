import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Warn about non-deterministic expressions in render that cause hydration mismatch.
 *
 * Bad:  `<span>{Date.now()}</span>` or `<span>{Math.random()}</span>`
 * Good: Use a signal initialized in onMount, or useId() for unique values.
 */
export const noMismatchRisk: Rule = {
  meta: {
    id: "pyreon/no-mismatch-risk",
    description: "Warn about Date.now()/Math.random() in render — causes hydration mismatch",
    category: "ssr",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-mismatch-risk",
  },

  create(context) {
    let jsxDepth = 0
    const riskyMethods = new Map([
      ["Date.now", "Date.now()"],
      ["Math.random", "Math.random()"],
      ["crypto.randomUUID", "crypto.randomUUID()"],
    ])

    return {
      JSXElement() {
        jsxDepth++
      },
      "JSXElement:exit"() {
        jsxDepth--
      },
      JSXFragment() {
        jsxDepth++
      },
      "JSXFragment:exit"() {
        jsxDepth--
      },

      CallExpression(node: any) {
        if (jsxDepth === 0) return

        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.property?.type === "Identifier"
        ) {
          const key = `${node.callee.object.name}.${node.callee.property.name}`
          const display = riskyMethods.get(key)
          if (display) {
            const span = getSpan(node)
            context.report({
              message: `\`${display}\` in JSX produces different values on server and client, causing hydration mismatch. Initialize in \`onMount()\` or use a signal.`,
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
