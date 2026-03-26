import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan } from "../../utils/ast"
import { isPyreonImport } from "../../utils/imports"

const DEEP_IMPORT_PATTERN = /@pyreon\/[^/]+\/(src|dist|lib)\//

export const noDeepImport: Rule = {
  meta: {
    id: "pyreon/no-deep-import",
    category: "architecture",
    description:
      "Disallow importing from @pyreon/*/src/, /dist/, or /lib/ — use public exports instead.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string
        if (!source || !isPyreonImport(source)) return

        if (DEEP_IMPORT_PATTERN.test(source)) {
          context.report({
            message: `Deep import \`${source}\` — import from the package's public exports instead.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
