import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

const NEEDS_CLEANUP = new Set(["setInterval", "addEventListener"])

export const noMissingCleanup: Rule = {
  meta: {
    id: "pyreon/no-missing-cleanup",
    category: "lifecycle",
    description:
      "Warn when onMount uses setInterval/addEventListener without returning a cleanup function.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, "onMount")) return
        const args = node.arguments
        if (!args || args.length === 0) return

        const fn = args[0]
        if (!fn) return
        if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return

        const body = fn.body
        if (!body) return

        // Only check block bodies
        if (body.type !== "BlockStatement") return

        let hasCleanupTarget = false
        let hasReturn = false

        function walk(n: any) {
          if (!n) return
          if (n.type === "CallExpression") {
            const callee = n.callee
            if (callee?.type === "Identifier" && NEEDS_CLEANUP.has(callee.name)) {
              hasCleanupTarget = true
            }
            if (
              callee?.type === "MemberExpression" &&
              callee.property?.type === "Identifier" &&
              NEEDS_CLEANUP.has(callee.property.name)
            ) {
              hasCleanupTarget = true
            }
          }
          if (n.type === "ReturnStatement" && n.argument) {
            hasReturn = true
          }
          for (const key of Object.keys(n)) {
            const child = n[key]
            if (child && typeof child === "object") {
              if (Array.isArray(child)) {
                for (const item of child) {
                  if (item && typeof item.type === "string") walk(item)
                }
              } else if (typeof child.type === "string") {
                walk(child)
              }
            }
          }
        }

        walk(body)

        if (hasCleanupTarget && !hasReturn) {
          context.report({
            message:
              "`onMount` uses `setInterval`/`addEventListener` without returning a cleanup function — this will cause a memory leak.",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
