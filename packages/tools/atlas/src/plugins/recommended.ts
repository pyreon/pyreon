/**
 * The curated "great defaults" plugin bundle — the batteries-included set most
 * catalogs want, in the correct pipeline order:
 *
 *   categorize (tags)
 *   -> generate scenarios (variant matrix, states, edge cases)
 *   -> ensure a default scenario
 *   -> fill required props so scenarios render
 *   -> verify a11y
 *   -> write usage docs
 *
 * Opt-in extras (e.g. `themePlugin`) are imported separately. DOM-backed
 * plugins (axe a11y, visual-regression, reactivity-coverage) join this bundle
 * once the runtime/verify layer lands.
 */
import type { AtlasPlugin } from './types'
import { a11yPlugin } from './a11y'
import { fillDefaultsPlugin } from './fill-defaults'
import { defaultScenarioPlugin, edgeCasesPlugin, statesPlugin } from './scenarios'
import { tagsPlugin } from './tags'
import { usageDocsPlugin } from './usage-docs'
import { variantMatrixPlugin } from './variant-matrix'

export interface RecommendedOptions {
  /** base args merged into generated variant-matrix scenarios */
  baseArgs?: Record<string, unknown>
}

export function recommendedPlugins(options: RecommendedOptions = {}): AtlasPlugin[] {
  return [
    tagsPlugin(),
    variantMatrixPlugin(options.baseArgs ? { baseArgs: options.baseArgs } : {}),
    statesPlugin(),
    edgeCasesPlugin(),
    defaultScenarioPlugin(),
    fillDefaultsPlugin(),
    a11yPlugin(),
    usageDocsPlugin(),
  ]
}
