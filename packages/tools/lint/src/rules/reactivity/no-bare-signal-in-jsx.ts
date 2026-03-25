import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Disallow bare signal calls in JSX text positions.
 *
 * Bad:  `{count()}`
 * Good: `{() => count()}`
 *
 * Bare signal calls in JSX evaluate once and don't track.
 * Wrap in an arrow function so the runtime creates a reactive text node.
 */
export const noBareSignalInJsx: Rule = {
  meta: {
    id: "pyreon/no-bare-signal-in-jsx",
    description: "Disallow bare signal calls in JSX text — wrap in arrow function for reactivity",
    category: "reactivity",
    defaultSeverity: "error",
    fixable: true,
    docs: "https://pyreon.dev/lint/no-bare-signal-in-jsx",
  },

  create(context) {
    return {
      JSXExpressionContainer(node: any) {
        const expr = node.expression
        if (!expr || expr.type === "JSXEmptyExpression") return

        // Look for: {someCall()} where someCall is a simple identifier
        // This is the pattern of reading a signal: {count()}
        if (
          expr.type === "CallExpression" &&
          expr.callee?.type === "Identifier" &&
          expr.arguments?.length === 0
        ) {
          const name = expr.callee.name

          // Skip known non-signal function calls (components, hooks)
          if (name[0] === name[0].toUpperCase()) return // PascalCase = component
          if (name.startsWith("use")) return // hooks
          if (name.startsWith("get") || name.startsWith("is") || name.startsWith("has")) return // getters

          const span = getSpan(expr)
          context.report({
            message: `Bare signal call \`${name}()\` in JSX text won't be reactive. Wrap in arrow function: \`() => ${name}()\``,
            loc: context.getLocation(span.start),
            span,
            fix: {
              span,
              replacement: `() => ${name}()`,
            },
          })
        }
      },
    }
  },
}
