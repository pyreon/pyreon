import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn against using effect() purely for one-way data flow assignments.
 *
 * Bad:  `effect(() => { x.set(y()) })`
 * Good: `const x = computed(() => y())`
 *
 * This is a more specific version of prefer-computed that catches
 * the arrow-body variant.
 */
export const noEffectAssignment: Rule = {
  meta: {
    id: "pyreon/no-effect-assignment",
    description: "Warn against effect(() => signal.set(derived)) — use computed() instead",
    category: "reactivity",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-effect-assignment",
  },

  create(context) {
    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return
        const callback = node.arguments?.[0]
        if (!callback) return

        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return
        }

        const body = callback.body
        if (!body) return

        // Check block body with single .update() call
        if (body.type === "BlockStatement" && body.body?.length === 1) {
          const stmt = body.body[0]
          if (
            stmt.type === "ExpressionStatement" &&
            stmt.expression?.type === "CallExpression" &&
            stmt.expression.callee?.type === "MemberExpression" &&
            stmt.expression.callee.property?.type === "Identifier" &&
            stmt.expression.callee.property.name === "update"
          ) {
            const span = getSpan(node)
            context.report({
              message:
                "Using `effect()` to call `.update()` on a signal. Consider `computed()` for pure derived values.",
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
