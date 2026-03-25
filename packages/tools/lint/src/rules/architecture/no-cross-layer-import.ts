import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"
import { isPyreonImport } from "../../utils/imports"

/**
 * Prevent UI-system packages from importing fundamentals internals and vice versa
 * at wrong abstraction boundaries.
 *
 * This enforces the package category boundaries:
 * - core packages should not import from ui-system
 * - fundamentals should not import from ui-system (except connector packages)
 */

const CATEGORY_MAP: Record<string, string> = {
  // Core
  reactivity: "core",
  core: "core",
  compiler: "core",
  "runtime-dom": "core",
  "runtime-server": "core",
  router: "core",
  head: "core",
  server: "core",

  // UI System
  "ui-core": "ui-system",
  styler: "ui-system",
  unistyle: "ui-system",
  elements: "ui-system",
  attrs: "ui-system",
  rocketstyle: "ui-system",
  coolgrid: "ui-system",
  kinetic: "ui-system",
  "kinetic-presets": "ui-system",
  "connector-document": "ui-system",
  "document-primitives": "ui-system",
}

export const noCrossLayerImport: Rule = {
  meta: {
    id: "pyreon/no-cross-layer-import",
    description: "Prevent core packages from importing UI-system packages",
    category: "architecture",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-cross-layer-import",
  },

  create(context) {
    const currentCategory = detectCategory(context.filename)

    return {
      ImportDeclaration(node: any) {
        if (!currentCategory) return

        const source = node.source?.value
        if (!source || !isPyreonImport(source)) return

        const importedPkg = source.replace("@pyreon/", "").split("/")[0]
        const importedCategory = CATEGORY_MAP[importedPkg]

        if (!importedCategory) return

        // Core should not import from UI system
        if (currentCategory === "core" && importedCategory === "ui-system") {
          const span = getSpan(node)
          context.report({
            message: `Core package should not import from UI-system package \`@pyreon/${importedPkg}\`. This creates an upward dependency.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}

function detectCategory(filename: string): string | undefined {
  if (filename.includes("packages/core/")) return "core"
  if (filename.includes("packages/ui-system/")) return "ui-system"
  if (filename.includes("packages/fundamentals/")) return "fundamentals"
  if (filename.includes("packages/tools/")) return "tools"
  return undefined
}
