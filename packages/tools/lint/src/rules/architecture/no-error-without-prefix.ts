import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Require [Pyreon] prefix on error messages thrown in library code.
 *
 * Bad:  `throw new Error("Invalid props")`
 * Good: `throw new Error("[Pyreon] Invalid props")`
 *
 * Prefixed errors help users identify the source in stack traces.
 */
export const noErrorWithoutPrefix: Rule = {
  meta: {
    id: "pyreon/no-error-without-prefix",
    description: "Require [Pyreon] prefix on Error messages in library code",
    category: "architecture",
    defaultSeverity: "warn",
    fixable: true,
    docs: "https://pyreon.dev/lint/no-error-without-prefix",
  },

  create(context) {
    // Only apply to library code
    if (
      context.filename.includes("/examples/") ||
      context.filename.includes(".test.") ||
      context.filename.includes("/tests/")
    ) {
      return {}
    }

    return {
      ThrowStatement(node: any) {
        const arg = node.argument
        if (!arg) return

        // throw new Error("message")
        if (
          arg.type === "NewExpression" &&
          arg.callee?.type === "Identifier" &&
          arg.callee.name === "Error" &&
          arg.arguments?.[0]?.type === "Literal" &&
          typeof arg.arguments[0].value === "string"
        ) {
          const msg = arg.arguments[0].value
          if (!msg.startsWith("[Pyreon]")) {
            const span = getSpan(arg.arguments[0])
            context.report({
              message:
                "Error message should start with `[Pyreon]` prefix for easy identification in stack traces.",
              loc: context.getLocation(span.start),
              span,
              fix: {
                span,
                replacement: `"[Pyreon] ${msg}"`,
              },
            })
          }
        }
      },
    }
  },
}
