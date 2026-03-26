import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo, isSetCall } from "../../utils/ast"

export const preferComputed: Rule = {
  meta: {
    id: "pyreon/prefer-computed",
    category: "reactivity",
    description: "Suggest computed() when an effect only contains a single .set() call.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, "effect")) return
        const args = node.arguments
        if (!args || args.length === 0) return

        const fn = args[0]
        if (!fn) return

        let body: any = null
        if (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression") {
          body = fn.body
        }
        if (!body) return

        // Arrow with expression body: effect(() => x.set(y))
        if (body.type === "CallExpression" && isSetCall(body)) {
          context.report({
            message:
              "Effect contains a single `.set()` — consider using `computed()` instead for derived values.",
            span: getSpan(node),
          })
          return
        }

        // Block body with single statement: effect(() => { x.set(y) })
        if (body.type === "BlockStatement") {
          const stmts = body.body
          if (stmts && stmts.length === 1) {
            const stmt = stmts[0]
            if (stmt.type === "ExpressionStatement" && isSetCall(stmt.expression)) {
              context.report({
                message:
                  "Effect contains a single `.set()` — consider using `computed()` instead for derived values.",
                span: getSpan(node),
              })
            }
          }
        }
      },
    }
    return callbacks
  },
}
