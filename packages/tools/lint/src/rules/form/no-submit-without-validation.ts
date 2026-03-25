import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when useForm() has onSubmit but no validators or schema.
 */
export const noSubmitWithoutValidation: Rule = {
  meta: {
    id: "pyreon/no-submit-without-validation",
    description: "Warn when useForm() has onSubmit but no validators or schema",
    category: "form",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-submit-without-validation",
  },

  create(context) {
    return {
      CallExpression(node: any) {
        if (!isCallTo(node, "useForm")) return

        const config = node.arguments?.[0]
        if (!config || config.type !== "ObjectExpression") return

        const props = config.properties ?? []
        const hasSubmit = props.some(
          (p: any) => p.key?.type === "Identifier" && p.key.name === "onSubmit",
        )
        const hasValidation = props.some(
          (p: any) =>
            p.key?.type === "Identifier" &&
            (p.key.name === "validators" || p.key.name === "schema" || p.key.name === "validate"),
        )

        if (hasSubmit && !hasValidation) {
          const span = getSpan(node)
          context.report({
            message:
              "`useForm()` has `onSubmit` but no `validators` or `schema`. Consider adding validation to catch errors before submission.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
