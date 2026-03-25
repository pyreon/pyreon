import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"
import { HEAVY_PACKAGES } from "../../utils/imports"

/**
 * Suggest lazy-loading heavy packages instead of static imports.
 *
 * Bad:  `import { Chart } from "@pyreon/charts"`
 * Good: `const Chart = lazy(() => import("@pyreon/charts"))`
 *
 * Heavy packages (charts ~300KB, code ~250KB, document ~300KB, flow ~200KB)
 * should be lazy-loaded to avoid impacting initial bundle size.
 */
export const noEagerImport: Rule = {
  meta: {
    id: "pyreon/no-eager-import",
    description: "Suggest lazy-loading heavy packages (@pyreon/charts, code, document, flow)",
    category: "performance",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-eager-import",
  },

  create(context) {
    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value
        if (!source) return

        if (HEAVY_PACKAGES.has(source)) {
          const span = getSpan(node)
          context.report({
            message: `\`${source}\` is a heavy package. Consider using \`lazy(() => import("${source}"))\` for code splitting.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
