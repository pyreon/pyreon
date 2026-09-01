import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPyreonImport } from '../../utils/imports'
import { isTestFile } from '../../utils/file-roles'

/**
 * Two INDEPENDENT layer orders, one per package tree.
 *
 * They are separate stacks, not one — `packages/core` and `packages/ui-system`
 * are ordered internally, and a ui-system package importing a core one is
 * normal (`elements` uses `@pyreon/core`). Merging them into a single rank
 * table would make every such import a violation, so the two are compared only
 * against their own tree.
 *
 * `ui-system` matters as much as `core` and was the tree that actually broke:
 * `ui-core` and `unistyle` formed a real cycle, fixed by a theme-engine
 * registration seam, and nothing but that fix's own tests stops it recurring.
 * Enforcing only `packages/core/` left the tree with the known incident
 * unguarded.
 */
const CORE_LAYERS: Record<string, number> = {
  '@pyreon/reactivity': 0,
  '@pyreon/core': 1,
  '@pyreon/compiler': 1,
  '@pyreon/runtime-dom': 2,
  '@pyreon/runtime-server': 2,
  '@pyreon/router': 3,
  '@pyreon/head': 4,
  '@pyreon/server': 5,
}

/**
 * `styler → ui-core → unistyle → {attrs, rocketstyle, elements, coolgrid} →
 * kinetic → kinetic-presets`, per the documented graph: styler has no
 * ui-system deps, ui-core depends on styler only, and unistyle depends on
 * ui-core and NOT the reverse.
 */
const UI_LAYERS: Record<string, number> = {
  '@pyreon/styler': 0,
  '@pyreon/ui-core': 1,
  '@pyreon/unistyle': 2,
  '@pyreon/attrs': 3,
  '@pyreon/rocketstyle': 3,
  '@pyreon/elements': 3,
  '@pyreon/coolgrid': 3,
  '@pyreon/kinetic': 4,
  '@pyreon/kinetic-presets': 5,
}
// `connector-document` and `document-primitives` are deliberately ABSENT.
// They are not in the documented chain, and ranking them by eye put them
// beside `elements` when they in fact sit above it — 41 false positives in a
// tree with no real violation. An unranked package is ignored, which is the
// honest default: a guessed rank is worse than no rank.


const TREES: readonly { dir: string; layers: Record<string, number> }[] = [
  { dir: 'core', layers: CORE_LAYERS },
  { dir: 'ui-system', layers: UI_LAYERS },
]

/** The tree a file belongs to, and its rank in that tree's order. */
function getFileTree(
  filePath: string,
): { layers: Record<string, number>; layer: number } | null {
  for (const { dir, layers } of TREES) {
    for (const [pkg, layer] of Object.entries(layers)) {
      const pkgName = pkg.replace('@pyreon/', '')
      if (filePath.includes(`/packages/${dir}/${pkgName}/`)) return { layers, layer }
    }
  }
  return null
}

export const noCircularImport: Rule = {
  meta: {
    id: 'pyreon/no-circular-import',
    category: 'architecture',
    description: 'Enforce the package layer order within `packages/core` and `packages/ui-system`, so an upward import cannot reintroduce a package cycle.',
    severity: 'error',
    scope: 'monorepo',
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
    const tree = getFileTree(filePath)
    if (tree === null) return {}
    const { layers, layer: fileLayer } = tree

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string
        if (!source || !isPyreonImport(source)) return

        // Compared only within the file's OWN tree: a ui-system package
        // importing a core one is the normal direction, not a violation.
        const importLayer = layers[source]
        if (importLayer === undefined) return

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
