/**
 * The curated "great defaults" plugin bundle — the batteries-included set most
 * catalogs want, in the correct pipeline order:
 *
 *   categorize (tags)
 *   -> generate scenarios (variant matrix, states, edge cases)
 *   -> ensure a default scenario
 *   -> fill required props so scenarios render
 *   -> verify a11y (static) + mount (runtime)
 *   -> write usage docs
 *
 * Opt-in extras (e.g. `themePlugin`) are imported separately. The remaining
 * DOM-backed checks (axe a11y, visual regression, reactive-prop liveness) join
 * this bundle as they land; `mountPlugin` is the seam they all sit on.
 */
import type { AtlasPlugin } from './types'
import { a11yPlugin } from './a11y'
import { mountPlugin } from './mount'
import { fillDefaultsPlugin } from './fill-defaults'
import { defaultScenarioPlugin, edgeCasesPlugin, statesPlugin } from './scenarios'
import { tagsPlugin } from './tags'
import { usageDocsPlugin } from './usage-docs'
import { variantMatrixPlugin } from './variant-matrix'

export interface RecommendedOptions {
  /** base args merged into generated variant-matrix scenarios */
  baseArgs?: Record<string, unknown>
  /**
   * Include the runtime mount check (default true).
   *
   * Set false when the caller supplies its own `mountPlugin(...)` — typically
   * to pass the project's provider wrapper, which this bundle knows nothing
   * about. Two mount plugins would mount every scenario twice and let the
   * unwrapped one's failure win.
   */
  mount?: boolean
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
    ...(options.mount === false ? [] : [mountPlugin()]),
    usageDocsPlugin(),
  ]
}
