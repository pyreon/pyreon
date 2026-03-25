import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when onMount uses setInterval/addEventListener without cleanup.
 *
 * Bad:  `onMount(() => { setInterval(fn, 1000) })`
 * Good: `onMount(() => { const id = setInterval(fn, 1000); return () => clearInterval(id) })`
 */
export const noMissingCleanup: Rule = {
  meta: {
    id: "pyreon/no-missing-cleanup",
    description: "Require cleanup return from onMount when using timers or event listeners",
    category: "lifecycle",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-missing-cleanup",
  },

  create(context) {
    const needsCleanup = new Set(["setInterval", "setTimeout", "addEventListener", "requestAnimationFrame"])

    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "onMount")) return

        const callback = node.arguments?.[0]
        if (!callback) return
        if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return

        const body = callback.body
        if (!body || body.type !== "BlockStatement") return

        // Check if body contains cleanup-needing calls
        let hasCleanupNeeded = false
        let hasReturn = false

        for (const stmt of body.body ?? []) {
          if (stmt.type === "ReturnStatement" && stmt.argument) {
            hasReturn = true
          }
          // Walk statement for calls
          walkForCalls(stmt, (callNode: any) => {
            if (callNode.callee?.type === "Identifier" && needsCleanup.has(callNode.callee.name)) {
              hasCleanupNeeded = true
            }
            if (
              callNode.callee?.type === "MemberExpression" &&
              callNode.callee.property?.type === "Identifier" &&
              needsCleanup.has(callNode.callee.property.name)
            ) {
              hasCleanupNeeded = true
            }
          })
        }

        if (hasCleanupNeeded && !hasReturn) {
          const span = getSpan(node)
          context.report({
            message:
              "`onMount` uses timers or event listeners but doesn't return a cleanup function. Return a cleanup to avoid memory leaks.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}

function walkForCalls(node: any, visitor: (node: any) => void) {
  if (!node || typeof node !== "object") return
  if (node.type === "CallExpression") visitor(node)
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const child of val) walkForCalls(child, visitor)
    } else if (val && typeof val === "object" && val.type) {
      walkForCalls(val, visitor)
    }
  }
}
