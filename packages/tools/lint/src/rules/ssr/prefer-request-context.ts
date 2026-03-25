import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Warn about module-level signal/store usage in SSR handler files.
 *
 * Bad:  `const count = signal(0)` at module level in a server handler
 * Good: `runWithRequestContext(() => { const count = signal(0) })`
 *
 * Module-level state is shared across all requests in SSR.
 */
export const preferRequestContext: Rule = {
  meta: {
    id: "pyreon/prefer-request-context",
    description: "Warn about shared module state in SSR handlers — use runWithRequestContext",
    category: "ssr",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/prefer-request-context",
  },

  create(context) {
    let isServerFile = false
    let functionDepth = 0

    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value ?? ""
        if (
          source === "@pyreon/server" ||
          source.includes("createHandler") ||
          source.includes("runtime-server")
        ) {
          isServerFile = true
        }
      },

      FunctionDeclaration() {
        functionDepth++
      },
      "FunctionDeclaration:exit"() {
        functionDepth--
      },
      FunctionExpression() {
        functionDepth++
      },
      "FunctionExpression:exit"() {
        functionDepth--
      },
      ArrowFunctionExpression() {
        functionDepth++
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth--
      },

      CallExpression(node: any) {
        if (!isServerFile) return
        if (functionDepth > 0) return // Only check module-level

        if (
          node.callee?.type === "Identifier" &&
          (node.callee.name === "signal" || node.callee.name === "createStore")
        ) {
          const span = getSpan(node)
          context.report({
            message: `Module-level \`${node.callee.name}()\` in an SSR handler is shared across all requests. Use \`runWithRequestContext()\` to isolate per-request state.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
