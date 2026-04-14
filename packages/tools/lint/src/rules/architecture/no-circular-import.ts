import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPyreonImport } from '../../utils/imports'
import { isTestFile } from '../../utils/file-roles'

const LAYER_ORDER: Record<string, number> = {
  '@pyreon/reactivity': 0,
  '@pyreon/core': 1,
  '@pyreon/compiler': 1,
  '@pyreon/runtime-dom': 2,
  '@pyreon/runtime-server': 2,
  '@pyreon/router': 3,
  '@pyreon/head': 4,
  '@pyreon/server': 5,
}

function getLayer(source: string): number | null {
  return LAYER_ORDER[source] ?? null
}

function getFileLayer(filePath: string): number | null {
  for (const [pkg, layer] of Object.entries(LAYER_ORDER)) {
    const pkgName = pkg.replace('@pyreon/', '')
    if (filePath.includes(`/packages/core/${pkgName}/`)) return layer
  }
  return null
}

export const noCircularImport: Rule = {
  meta: {
    id: 'pyreon/no-circular-import',
    category: 'architecture',
    description: 'Enforce package layer order to prevent circular imports between core packages.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    // Tests don't ship as part of the layered production dep graph — they're
    // verification scaffolding. Cross-layer imports are routine and correct
    // there (e.g. a `runtime-dom` test importing `renderToString` from
    // `runtime-server` to compare SSR vs CSR output). Path-based skip is the
    // semantic truth for this rule, not a heuristic.
    if (isTestFile(filePath)) return {}
    const fileLayer = getFileLayer(filePath)
    if (fileLayer === null) return {}

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string
        if (!source || !isPyreonImport(source)) return

        const importLayer = getLayer(source)
        if (importLayer === null) return

        if (importLayer >= fileLayer) {
          context.report({
            message: `Importing \`${source}\` (layer ${importLayer}) from layer ${fileLayer} — this violates the package layer order and may cause circular imports.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
