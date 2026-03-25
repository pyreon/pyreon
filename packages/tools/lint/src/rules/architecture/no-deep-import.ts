import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"
import { isPyreonImport } from "../../utils/imports"

/**
 * Disallow deep imports into Pyreon package internals.
 *
 * Bad:  `import { foo } from "@pyreon/core/src/internal/vnode"`
 * Good: `import { foo } from "@pyreon/core"`
 *
 * Internal modules can change without notice. Use public exports only.
 */
export const noDeepImport: Rule = {
  meta: {
    id: "pyreon/no-deep-import",
    description: "Disallow deep imports into @pyreon/*/src/ internals — use public exports",
    category: "architecture",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-deep-import",
  },

  create(context) {
    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value
        if (!source || !isPyreonImport(source)) return

        // Flag imports that go into src/ or dist/ internals
        if (source.includes("/src/") || source.includes("/dist/") || source.includes("/lib/")) {
          const span = getSpan(node.source)
          context.report({
            message: `Deep import into \`${source}\` accesses internal modules. Use the public export from the package root or a documented subpath export.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
