import type { Rule } from "../../types"
import { getSpan, isCallTo, isSetCall } from "../../utils/ast"

/**
 * Prefer computed() over effect() when only deriving a value.
 *
 * Bad:  `effect(() => { derived.set(a() + b()) })`
 * Good: `const derived = computed(() => a() + b())`
 *
 * Effects that only set a signal are better expressed as computed values.
 */
export const preferComputed: Rule = {
  meta: {
    id: "pyreon/prefer-computed",
    description: "Prefer computed() over effect() that only derives a signal value",
    category: "reactivity",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/prefer-computed",
  },

  create(context) {
    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return
        if (!node.arguments?.[0]) return

        const callback = node.arguments[0]
        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return
        }

        const body = callback.body
        if (!body) return

        // Check for effect(() => { x.set(expr) }) pattern
        // Body must be a block with exactly one statement that is a .set() call
        if (body.type === "BlockStatement" && body.body?.length === 1) {
          const stmt = body.body[0]
          if (
            stmt.type === "ExpressionStatement" &&
            isSetCall(stmt.expression)
          ) {
            const span = getSpan(node)
            context.report({
              message:
                "This `effect()` only sets a single signal. Use `computed()` instead for cleaner derived state.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }

        // Also catch: effect(() => x.set(expr)) — concise arrow body
        if (isSetCall(body)) {
          const span = getSpan(node)
          context.report({
            message:
              "This `effect()` only sets a single signal. Use `computed()` instead for cleaner derived state.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
