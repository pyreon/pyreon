import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"
import { isPyreonImport } from "../../utils/imports"

/**
 * Enforce Pyreon's package dependency order (no circular imports).
 *
 * Layer order: reactivity → core → runtime-dom/runtime-server → router → head → server
 * Lower layers must not import from higher layers.
 */

const LAYER_ORDER: Record<string, number> = {
  "@pyreon/reactivity": 0,
  "@pyreon/core": 1,
  "@pyreon/compiler": 1,
  "@pyreon/runtime-dom": 2,
  "@pyreon/runtime-server": 2,
  "@pyreon/router": 3,
  "@pyreon/head": 4,
  "@pyreon/server": 5,
}

export const noCircularImport: Rule = {
  meta: {
    id: "pyreon/no-circular-import",
    description: "Enforce package dependency layer order — no upward imports",
    category: "architecture",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-circular-import",
  },

  create(context) {
    // Determine current file's package from the filename
    const currentPackage = detectPackage(context.filename)
    const currentLayer = currentPackage ? LAYER_ORDER[currentPackage] : undefined

    return {
      ImportDeclaration(node: any) {
        if (currentLayer === undefined) return

        const source = node.source?.value
        if (!source || !isPyreonImport(source)) return

        // Normalize source to base package (strip subpaths)
        const basePackage = normalizePackage(source)
        const importLayer = LAYER_ORDER[basePackage]

        if (importLayer !== undefined && importLayer > currentLayer) {
          const span = getSpan(node)
          context.report({
            message: `\`${currentPackage}\` (layer ${currentLayer}) must not import from \`${basePackage}\` (layer ${importLayer}). This violates the package dependency order.`,
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}

function detectPackage(filename: string): string | undefined {
  const match = filename.match(/@pyreon\/([^/]+)/) ?? filename.match(/packages\/(?:core|tools|fundamentals|ui-system)\/([^/]+)/)
  if (match) {
    const pkg = `@pyreon/${match[1]}`
    return LAYER_ORDER[pkg] !== undefined ? pkg : undefined
  }
  return undefined
}

function normalizePackage(source: string): string {
  // "@pyreon/core/jsx-runtime" → "@pyreon/core"
  const parts = source.split("/")
  if (parts[0].startsWith("@")) {
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]
}
