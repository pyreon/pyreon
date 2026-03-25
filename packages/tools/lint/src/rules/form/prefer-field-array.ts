import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Suggest useFieldArray() over manual signal arrays for form lists.
 *
 * Detects: signal<SomeType[]>([]) in files that also import from @pyreon/form.
 */
export const preferFieldArray: Rule = {
  meta: {
    id: "pyreon/prefer-field-array",
    description: "Suggest useFieldArray() over manual signal arrays in form components",
    category: "form",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/prefer-field-array",
  },

  create(context) {
    let hasFormImport = false

    return {
      ImportDeclaration(node: any) {
        if (node.source?.value === "@pyreon/form") {
          hasFormImport = true
        }
      },

      CallExpression(node: any) {
        if (!hasFormImport) return
        if (!isCallTo(node, "signal")) return

        // Check if the argument is an array literal
        if (node.arguments?.[0]?.type === "ArrayExpression") {
          const span = getSpan(node)
          context.report({
            message:
              "Consider `useFieldArray()` from `@pyreon/form` instead of `signal([])` for dynamic form lists. It provides stable keys, append/remove/move/swap helpers.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
