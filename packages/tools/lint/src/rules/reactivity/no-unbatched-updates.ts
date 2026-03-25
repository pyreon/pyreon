import type { Rule } from "../../types"
import { getSpan, isCallTo, isSetCall } from "../../utils/ast"

/**
 * Warn when 3+ .set() calls appear in the same function without batch().
 *
 * Bad:  `a.set(1); b.set(2); c.set(3);`
 * Good: `batch(() => { a.set(1); b.set(2); c.set(3); })`
 *
 * Multiple unbatched updates cause unnecessary intermediate re-renders.
 */
export const noUnbatchedUpdates: Rule = {
  meta: {
    id: "pyreon/no-unbatched-updates",
    description: "Warn when 3+ signal .set() calls are not wrapped in batch()",
    category: "reactivity",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-unbatched-updates",
  },

  create(context) {
    // Track function scopes and their .set() calls
    const scopeStack: Array<{ setCalls: any[]; hasBatch: boolean }> = []

    function enterScope() {
      scopeStack.push({ setCalls: [], hasBatch: false })
    }

    function exitScope() {
      const scope = scopeStack.pop()
      if (!scope) return

      if (!scope.hasBatch && scope.setCalls.length >= 3) {
        // Report on the first .set() call
        const first = scope.setCalls[0]
        const span = getSpan(first)
        context.report({
          message: `${scope.setCalls.length} signal \`.set()\` calls without \`batch()\`. Wrap in \`batch(() => { ... })\` to avoid unnecessary re-renders.`,
          loc: context.getLocation(span.start),
          span,
        })
      }
    }

    return {
      FunctionDeclaration() {
        enterScope()
      },
      "FunctionDeclaration:exit"() {
        exitScope()
      },
      FunctionExpression() {
        enterScope()
      },
      "FunctionExpression:exit"() {
        exitScope()
      },
      ArrowFunctionExpression() {
        enterScope()
      },
      "ArrowFunctionExpression:exit"() {
        exitScope()
      },

      CallExpression(node: any) {
        const scope = scopeStack[scopeStack.length - 1]
        if (!scope) return

        // Track .set() calls
        if (isSetCall(node)) {
          scope.setCalls.push(node)
        }

        // Track batch() usage
        if (isCallTo(node, "batch")) {
          scope.hasBatch = true
        }
      },
    }
  },
}
