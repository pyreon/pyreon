import type { Rule } from "../../types"
import { getSpan, isInsideDevGuard } from "../../utils/ast"

/**
 * Require __DEV__ guard around console.warn and console.error in library code.
 *
 * Bad:  `console.warn("[Pyreon] ...")`
 * Good: `if (__DEV__) { console.warn("[Pyreon] ...") }`
 *
 * Without __DEV__ guards, warning messages bloat production bundles.
 */
export const devGuardWarnings: Rule = {
  meta: {
    id: "pyreon/dev-guard-warnings",
    description: "Require __DEV__ guard around console.warn/error in library code",
    category: "architecture",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/dev-guard-warnings",
  },

  create(context) {
    // Only apply to library code (packages/), not examples or tests
    if (
      context.filename.includes("/examples/") ||
      context.filename.includes(".test.") ||
      context.filename.includes("/tests/")
    ) {
      return {}
    }

    const ancestors: any[] = []

    return {
      IfStatement(node: any) {
        ancestors.push(node)
      },
      "IfStatement:exit"() {
        ancestors.pop()
      },

      CallExpression(node: any) {
        if (
          node.callee?.type !== "MemberExpression" ||
          node.callee.object?.type !== "Identifier" ||
          node.callee.object.name !== "console" ||
          node.callee.property?.type !== "Identifier"
        ) {
          return
        }

        const method = node.callee.property.name
        if (method !== "warn" && method !== "error") return

        if (!isInsideDevGuard(ancestors)) {
          const span = getSpan(node)
          context.report({
            message: `\`console.${method}()\` without \`__DEV__\` guard. Wrap in \`if (__DEV__) { ... }\` to tree-shake from production bundles.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
