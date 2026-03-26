import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"
import { extractImportInfo } from "../../utils/imports"

export const preferFieldArray: Rule = {
  meta: {
    id: "pyreon/prefer-field-array",
    category: "form",
    description: "Suggest useFieldArray() instead of signal([]) in files that import @pyreon/form.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    let importsForm = false

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (info && info.source === "@pyreon/form") {
          importsForm = true
        }
      },
      CallExpression(node: any) {
        if (!importsForm) return
        if (!isCallTo(node, "signal")) return

        const args = node.arguments
        if (!args || args.length === 0) return
        const firstArg = args[0]
        if (firstArg?.type === "ArrayExpression") {
          context.report({
            message:
              "`signal([])` in a form file — consider using `useFieldArray()` for dynamic array fields with stable keys.",
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
